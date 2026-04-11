const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const absoluteDbPath = path.join(projectRoot, 'prisma', 'dev.db').replace(/\\/g, '/');
process.env.APP_DB_TARGET = 'local';
process.env.DATABASE_URL = `file:${absoluteDbPath}`;

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const OUTPUT_PATH = path.join(projectRoot, 'logs', 'recent-stats-audit.json');
const TRUE_ISSUES_OUTPUT_PATH = path.join(projectRoot, 'logs', 'recent-stats-audit-true-issues.json');
const FORMAT_SET = ['BO3', 'BO5', 'Bo3', 'Bo5', 'bo3', 'bo5'];

function ensureLogsDir() {
  const dirs = [path.dirname(OUTPUT_PATH), path.dirname(TRUE_ISSUES_OUTPUT_PATH)];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function expectedGameCount(formatValue) {
  const text = String(formatValue || '').toUpperCase();
  const match = text.match(/BO\s*(\d+)/i) || text.match(/(\d+)/);
  const parsed = match ? parseInt(match[1], 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requiredWins(formatValue) {
  const expectedGames = expectedGameCount(formatValue);
  return expectedGames ? Math.floor(expectedGames / 2) + 1 : null;
}

function getSeriesMeta(match) {
  const winsNeeded = requiredWins(match.format);
  const winsByTeam = new Map();
  let clinchedAtGameNumber = null;

  for (const game of match.games) {
    if (!game.winnerId) continue;
    const wins = (winsByTeam.get(game.winnerId) || 0) + 1;
    winsByTeam.set(game.winnerId, wins);

    if (!clinchedAtGameNumber && winsNeeded && wins >= winsNeeded) {
      clinchedAtGameNumber = game.gameNumber;
    }
  }

  return {
    winsNeeded,
    clinchedAtGameNumber,
  };
}

function computeWindowStats(matches) {
  let totalSeconds = 0;
  let totalKills = 0;
  let totalGamesCount = 0;
  let gamesWithKills = 0;
  let gamesWithDuration = 0;
  let gamesMissingDuration = 0;
  let gamesMissingKills = 0;
  let placeholderGamesAfterClinch = 0;

  const matchDetails = matches.map((match) => {
    const seriesMeta = getSeriesMeta(match);

    const games = match.games.map((game) => {
      const hasDuration = game.duration !== null && game.duration !== undefined;
      const hasKills = game.totalKills !== null && game.totalKills !== undefined;
      const isPlaceholderAfterClinch =
        !hasDuration &&
        !hasKills &&
        seriesMeta.clinchedAtGameNumber !== null &&
        game.gameNumber > seriesMeta.clinchedAtGameNumber;

      if (hasDuration) {
        totalSeconds += game.duration;
        totalGamesCount += 1;
        gamesWithDuration += 1;
      } else if (isPlaceholderAfterClinch) {
        placeholderGamesAfterClinch += 1;
      } else {
        gamesMissingDuration += 1;
      }

      if (hasKills) {
        totalKills += game.totalKills;
        gamesWithKills += 1;
      } else if (!isPlaceholderAfterClinch) {
        gamesMissingKills += 1;
      }

      return {
        gameNumber: game.gameNumber,
        duration: game.duration,
        totalKills: game.totalKills,
        winnerId: game.winnerId,
        isPlaceholderAfterClinch,
      };
    });

    return {
      matchId: match.id,
      startTime: match.startTime ? match.startTime.toISOString() : null,
      format: match.format,
      expectedGames: expectedGameCount(match.format),
      clinchedAtGameNumber: seriesMeta.clinchedAtGameNumber,
      tournament: match.tournament,
      teamA: match.teamA ? { id: match.teamA.id, name: match.teamA.name, shortName: match.teamA.shortName } : null,
      teamB: match.teamB ? { id: match.teamB.id, name: match.teamB.name, shortName: match.teamB.shortName } : null,
      winnerId: match.winnerId,
      games,
    };
  });

  if (totalGamesCount === 0) {
    return {
      matchCount: matches.length,
      gameCountUsed: 0,
      averageDuration: null,
      averageKills: null,
      totalSeconds,
      totalKills,
      gamesWithDuration,
      gamesWithKills,
      gamesMissingDuration,
      gamesMissingKills,
      placeholderGamesAfterClinch,
      matchDetails,
    };
  }

  const avgSeconds = Math.floor(totalSeconds / totalGamesCount);
  const avgKills = totalKills / totalGamesCount;

  return {
    matchCount: matches.length,
    gameCountUsed: totalGamesCount,
    averageDuration: formatDuration(avgSeconds),
    averageKills: avgKills.toFixed(1),
    totalSeconds,
    totalKills,
    gamesWithDuration,
    gamesWithKills,
    gamesMissingDuration,
    gamesMissingKills,
    placeholderGamesAfterClinch,
    matchDetails,
  };
}

function summarizeWindow(windowLabel, stats) {
  const issues = [];
  if (!stats) return issues;

  if (stats.gamesMissingDuration > 0) {
    issues.push(`${windowLabel}存在 ${stats.gamesMissingDuration} 局真实缺少时长`);
  }
  if (stats.gamesMissingKills > 0) {
    issues.push(`${windowLabel}存在 ${stats.gamesMissingKills} 局真实缺少总击杀`);
  }
  if (stats.placeholderGamesAfterClinch > 0) {
    issues.push(`${windowLabel}包含 ${stats.placeholderGamesAfterClinch} 局系列赛结束后的占位局`);
  }
  if (stats.gamesWithKills !== stats.gameCountUsed) {
    issues.push(
      `${windowLabel}击杀统计分母与时长样本不一致：时长样本 ${stats.gameCountUsed}，击杀样本 ${stats.gamesWithKills}`,
    );
  }

  return issues;
}

function hasTrueMissingGames(row) {
  return (
    (row.last2 && (row.last2.gamesMissingDuration > 0 || row.last2.gamesMissingKills > 0)) ||
    (row.last3 && (row.last3.gamesMissingDuration > 0 || row.last3.gamesMissingKills > 0))
  );
}

async function main() {
  ensureLogsDir();

  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      shortName: true,
      region: true,
    },
    orderBy: [{ region: 'asc' }, { name: 'asc' }],
  });

  const rows = [];

  for (const team of teams) {
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [{ teamAId: team.id }, { teamBId: team.id }],
        status: 'FINISHED',
        format: { in: FORMAT_SET },
      },
      orderBy: { startTime: 'desc' },
      take: 3,
      include: {
        teamA: { select: { id: true, name: true, shortName: true } },
        teamB: { select: { id: true, name: true, shortName: true } },
        games: {
          select: {
            gameNumber: true,
            duration: true,
            totalKills: true,
            winnerId: true,
          },
          orderBy: { gameNumber: 'asc' },
        },
      },
    });

    if (recentMatches.length < 2) continue;

    const last2 = computeWindowStats(recentMatches.slice(0, 2));
    const last3 = recentMatches.length >= 3 ? computeWindowStats(recentMatches.slice(0, 3)) : null;

    const row = {
      team: {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        region: team.region,
      },
      last2,
      last3,
    };

    row.issues = [
      ...summarizeWindow('最近2个大场', row.last2),
      ...summarizeWindow('最近3个大场', row.last3),
    ];
    row.hasTrueMissingGames = hasTrueMissingGames(row);
    rows.push(row);
  }

  const issueRows = rows.filter((row) => row.issues.length > 0);
  const summary = {
    generatedAt: new Date().toISOString(),
    totalTeams: teams.length,
    eligibleForLast2: rows.length,
    eligibleForLast3: rows.filter((row) => row.last3 !== null).length,
    issueTeams: issueRows.length,
    teamsWithTrueMissingGames: issueRows.filter((row) => row.hasTrueMissingGames).length,
    teamsWithOnlyPlaceholderGames: issueRows.filter((row) => !row.hasTrueMissingGames).length,
    issueBreakdown: issueRows.map((row) => ({
      team: row.team,
      hasTrueMissingGames: row.hasTrueMissingGames,
      issues: row.issues,
    })),
  };

  const report = {
    summary,
    rows,
  };
  const trueIssuesOnlyReport = {
    generatedAt: summary.generatedAt,
    summary: {
      totalTeams: teams.length,
      eligibleForLast2: summary.eligibleForLast2,
      eligibleForLast3: summary.eligibleForLast3,
      trueIssueTeams: summary.teamsWithTrueMissingGames,
    },
    rows: issueRows.filter((row) => row.hasTrueMissingGames),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(TRUE_ISSUES_OUTPUT_PATH, JSON.stringify(trueIssuesOnlyReport, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`report saved: ${OUTPUT_PATH}`);
  console.log(`true issues report saved: ${TRUE_ISSUES_OUTPUT_PATH}`);
}

main()
  .catch((error) => {
    console.error('[audit-recent-stats-consistency] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
