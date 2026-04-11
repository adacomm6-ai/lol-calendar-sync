const { PrismaClient } = require('@prisma/client');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLeague(value) {
  return normalizeText(value).toUpperCase() || 'OTHER';
}

function normalizeLeagueBucket(value, tournamentName) {
  const league = normalizeLeague(value);
  const tournament = normalizeText(tournamentName);
  const upperTournament = tournament.toUpperCase();
  if (league === 'LPL') return 'LPL';
  if (league === 'LCK') return 'LCK';
  if (
    league === 'WORLDS' ||
    league === 'WORLD' ||
    league === 'INTERNATIONAL' ||
    ['WORLD', 'WORLDS', 'MSI', '全球', '世界赛', '国际赛事'].some((keyword) => upperTournament.includes(keyword) || tournament.includes(keyword))
  ) {
    return 'WORLDS';
  }
  return ['LEC', 'LCS', 'LCP', 'CBLOL', 'LJL', 'VCS', 'PCS', 'LTA', 'LLA', 'TCL', 'OTHER'].includes(league)
    ? 'OTHER'
    : league;
}

function normalizeNameKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

function normalizeRole(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return 'OTHER';
  if (['TOP', '上单'].includes(raw)) return 'TOP';
  if (['JUN', 'JUNGLE', 'JG', '打野'].includes(raw)) return 'JUN';
  if (['MID', '中单'].includes(raw)) return 'MID';
  if (['ADC', 'BOT', '下路'].includes(raw)) return 'ADC';
  if (['SUP', 'SUPPORT', '辅助'].includes(raw)) return 'SUP';
  return raw;
}

function normalizeTournamentAliasKey(value) {
  const stopwords = new Set(['season', '赛季', 'unknown', '未知', 'tournament', '赛事', 'vs', 'versus', 'regular', 'playoffs', 'group', 'stage', 'swiss', 'playin']);
  const normalizeToken = (token) => {
    if (token === 'playoff' || token === 'playoffs' || token === '季后赛') return 'playoffs';
    if (token === 'group' || token === 'groups') return 'group';
    if (token === 'stage' || token === '阶段') return 'stage';
    if (token === 'playin' || token === 'play-in') return 'playin';
    return token;
  };
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(normalizeToken)
    .filter((token) => !stopwords.has(token))
    .sort()
    .join(' ');
}

function snapshotLogicalKey(row) {
  const league = normalizeLeague(row.league);
  const seasonYear = normalizeText(row.seasonYear);
  const role = normalizeRole(row.role);
  const bucket = normalizeLeagueBucket(league, row.tournamentName);
  const tournamentGroup = bucket === 'LPL' || bucket === 'LCK' || bucket === 'WORLDS'
    ? normalizeTournamentAliasKey(row.tournamentName)
    : seasonYear;
  return [
    league,
    seasonYear,
    role,
    normalizeNameKey(row.normalizedPlayerName || row.playerName),
    normalizeNameKey(row.teamName),
    tournamentGroup,
  ].join('::');
}

function parseSinceHours(argv) {
  const arg = argv.find((item) => item.startsWith('--since-hours='));
  if (!arg) return 24;
  const value = Number(arg.split('=')[1]);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function toPlain(row) {
  const out = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  });
  return out;
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const sinceHours = parseSinceHours(process.argv);
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const [recentSnapshots, allSnapshots, recentGames, allGames, players, teams] = await Promise.all([
      prisma.playerStatSnapshot.findMany({
        where: { syncedAt: { gte: since } },
        select: {
          id: true,
          sourceKey: true,
          league: true,
          seasonYear: true,
          tournamentName: true,
          role: true,
          playerName: true,
          normalizedPlayerName: true,
          teamName: true,
          syncedAt: true,
          source: true,
          playerId: true,
          teamId: true,
        },
      }),
      prisma.playerStatSnapshot.findMany({
        select: {
          id: true,
          sourceKey: true,
          league: true,
          seasonYear: true,
          tournamentName: true,
          role: true,
          playerName: true,
          normalizedPlayerName: true,
          teamName: true,
          syncedAt: true,
          source: true,
          playerId: true,
          teamId: true,
        },
      }),
      prisma.game.findMany({ where: { updatedAt: { gte: since } }, select: { id: true, matchId: true, gameNumber: true, externalSourceResultId: true, updatedAt: true } }),
      prisma.game.findMany({ select: { id: true, matchId: true, gameNumber: true, externalSourceResultId: true, updatedAt: true } }),
      prisma.player.findMany({ select: { id: true } }),
      prisma.team.findMany({ select: { id: true } }),
    ]);

    const playerIdSet = new Set(players.map((item) => item.id));
    const teamIdSet = new Set(teams.map((item) => item.id));

    const gameGroup = new Map();
    for (const game of allGames) {
      const key = `${game.matchId}::${game.gameNumber}`;
      const list = gameGroup.get(key) || [];
      list.push(game);
      gameGroup.set(key, list);
    }
    const duplicateGames = Array.from(gameGroup.entries()).filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, count: list.length, ids: list.map((item) => item.id) }));

    const exactGroup = new Map();
    for (const row of allSnapshots) {
      const key = [row.league, row.seasonYear, row.tournamentName, row.teamName, row.playerName, row.role].join('::');
      const list = exactGroup.get(key) || [];
      list.push(row);
      exactGroup.set(key, list);
    }
    const exactDuplicates = Array.from(exactGroup.entries()).filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, count: list.length }));

    const logicalGroup = new Map();
    for (const row of allSnapshots) {
      const key = snapshotLogicalKey(row);
      const list = logicalGroup.get(key) || [];
      list.push(row);
      logicalGroup.set(key, list);
    }
    const logicalDuplicates = Array.from(logicalGroup.entries()).filter(([, list]) => list.length > 1);

    const recentLogicalConflicts = logicalDuplicates
      .filter(([, list]) => list.some((item) => new Date(item.syncedAt).getTime() >= since.getTime()))
      .map(([key, list]) => ({
        key,
        count: list.length,
        sources: Array.from(new Set(list.map((item) => item.source))),
        tournaments: Array.from(new Set(list.map((item) => item.tournamentName))),
      }));

    const orphanSnapshots = allSnapshots.filter((row) => (row.playerId && !playerIdSet.has(row.playerId)) || (row.teamId && !teamIdSet.has(row.teamId)));

    const summary = {
      since: since.toISOString(),
      sinceHours,
      recentSnapshotCount: recentSnapshots.length,
      recentGameCount: recentGames.length,
      duplicateGameCount: duplicateGames.length,
      exactDuplicateGroupCount: exactDuplicates.length,
      logicalDuplicateGroupCount: logicalDuplicates.length,
      recentLogicalConflictGroupCount: recentLogicalConflicts.length,
      orphanSnapshotCount: orphanSnapshots.length,
      status: duplicateGames.length === 0 && recentLogicalConflicts.length === 0 && orphanSnapshots.length === 0 ? 'PASS' : 'FAIL',
      samples: {
        duplicateGames: duplicateGames.slice(0, 10).map(toPlain),
        exactDuplicates: exactDuplicates.slice(0, 10).map(toPlain),
        recentLogicalConflicts: recentLogicalConflicts.slice(0, 10).map(toPlain),
        orphanSnapshots: orphanSnapshots.slice(0, 10).map(toPlain),
      },
    };

    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
})();
