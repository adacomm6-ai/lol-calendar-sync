const { PrismaClient } = require('@prisma/client');

function normalizeText(value) { return String(value || '').trim(); }
function normalizeLeague(value) { return normalizeText(value).toUpperCase() || 'OTHER'; }
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
function normalizeNameKey(value) { return normalizeText(value).toLowerCase().replace(/\s+/g, ''); }
function normalizeLeagueBucket(value, tournamentName) {
  const league = normalizeLeague(value);
  const tournament = normalizeText(tournamentName);
  const upper = tournament.toUpperCase();
  if (league === 'LPL') return 'LPL';
  if (league === 'LCK') return 'LCK';
  if (league === 'WORLDS' || league === 'WORLD' || league === 'INTERNATIONAL' || ['WORLD', 'WORLDS', 'MSI', '全球', '世界赛', '国际赛事'].some((k) => upper.includes(k) || tournament.includes(k))) return 'WORLDS';
  return ['LEC', 'LCS', 'LCP', 'CBLOL', 'LJL', 'VCS', 'PCS', 'LTA', 'LLA', 'TCL', 'OTHER'].includes(league) ? 'OTHER' : league;
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
function logicalKey(row) {
  const league = normalizeLeague(row.league);
  const season = normalizeText(row.seasonYear);
  const role = normalizeRole(row.role);
  const bucket = normalizeLeagueBucket(league, row.tournamentName);
  const tournamentKey = ['LPL', 'LCK', 'WORLDS'].includes(bucket)
    ? normalizeTournamentAliasKey(row.tournamentName)
    : season;
  return [
    league,
    season,
    role,
    normalizeNameKey(row.normalizedPlayerName || row.playerName),
    normalizeNameKey(row.teamName),
    tournamentKey,
  ].join('::');
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeUniqueStrings(left, right) {
  const seen = new Set();
  const merged = [];
  [...left, ...right].forEach((item) => {
    const text = normalizeText(item);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(text);
  });
  return merged;
}

function parseArrayJson(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseObjectJson(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sourcePriority(source) {
  const text = normalizeText(source).toLowerCase();
  if (text.includes('oracleselixir')) return 3;
  if (text.includes('golgg')) return 2;
  if (text.includes('lolesports')) return 1;
  return 0;
}

function pickCanonical(rows) {
  return rows.slice().sort((left, right) => {
    const p = sourcePriority(right.source) - sourcePriority(left.source);
    if (p !== 0) return p;
    const gamesDiff = (toNumber(right.games) || 0) - (toNumber(left.games) || 0);
    if (gamesDiff !== 0) return gamesDiff;
    return new Date(right.syncedAt || 0).getTime() - new Date(left.syncedAt || 0).getTime();
  })[0];
}

function fillString(existing, incoming) {
  const current = normalizeText(existing);
  if (current) return current;
  const next = normalizeText(incoming);
  return next || null;
}

function fillCounter(existing, incoming) {
  const left = toNumber(existing);
  const right = toNumber(incoming);
  return Math.max(left || 0, right || 0);
}

function fillNullableNumber(existing, incoming) {
  const left = toNumber(existing);
  if (left !== null) return left;
  const right = toNumber(incoming);
  return right !== null ? right : null;
}

function mergeFrom(existing, incoming) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;
  return new Date(incoming).getTime() < new Date(existing).getTime() ? incoming : existing;
}

function mergeTo(existing, incoming) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;
  return new Date(incoming).getTime() > new Date(existing).getTime() ? incoming : existing;
}

function mergeRows(canonical, rows) {
  let merged = { ...canonical };
  const labels = parseArrayJson(canonical.labelsJson);
  const insights = parseArrayJson(canonical.insightsJson);
  let extra = parseObjectJson(canonical.extraJson);

  for (const row of rows) {
    merged = {
      ...merged,
      playerId: merged.playerId || row.playerId || null,
      teamId: merged.teamId || row.teamId || null,
      league: fillString(merged.league, row.league) || merged.league,
      seasonYear: fillString(merged.seasonYear, row.seasonYear) || merged.seasonYear,
      splitName: fillString(merged.splitName, row.splitName),
      tournamentName: fillString(merged.tournamentName, row.tournamentName) || merged.tournamentName,
      role: fillString(merged.role, row.role) || merged.role,
      playerName: fillString(merged.playerName, row.playerName) || merged.playerName,
      normalizedPlayerName: fillString(merged.normalizedPlayerName, row.normalizedPlayerName) || merged.normalizedPlayerName,
      teamName: fillString(merged.teamName, row.teamName) || merged.teamName,
      teamShortName: fillString(merged.teamShortName, row.teamShortName),
      source: fillString(merged.source, row.source) || merged.source,
      sourceUrl: fillString(merged.sourceUrl, row.sourceUrl),
      dateFrom: mergeFrom(merged.dateFrom, row.dateFrom),
      dateTo: mergeTo(merged.dateTo, row.dateTo),
      games: fillCounter(merged.games, row.games),
      wins: fillCounter(merged.wins, row.wins),
      losses: fillCounter(merged.losses, row.losses),
      winRatePct: fillNullableNumber(merged.winRatePct, row.winRatePct),
      kda: fillNullableNumber(merged.kda, row.kda),
      avgKills: fillNullableNumber(merged.avgKills, row.avgKills),
      avgDeaths: fillNullableNumber(merged.avgDeaths, row.avgDeaths),
      avgAssists: fillNullableNumber(merged.avgAssists, row.avgAssists),
      csPerMin: fillNullableNumber(merged.csPerMin, row.csPerMin),
      goldPerMin: fillNullableNumber(merged.goldPerMin, row.goldPerMin),
      killParticipationPct: fillNullableNumber(merged.killParticipationPct, row.killParticipationPct),
      damageSharePct: fillNullableNumber(merged.damageSharePct, row.damageSharePct),
      goldSharePct: fillNullableNumber(merged.goldSharePct, row.goldSharePct),
      visionSharePct: fillNullableNumber(merged.visionSharePct, row.visionSharePct),
      damagePerMin: fillNullableNumber(merged.damagePerMin, row.damagePerMin),
      visionScorePerMin: fillNullableNumber(merged.visionScorePerMin, row.visionScorePerMin),
      wardsPerMin: fillNullableNumber(merged.wardsPerMin, row.wardsPerMin),
      wardsClearedPerMin: fillNullableNumber(merged.wardsClearedPerMin, row.wardsClearedPerMin),
      visionWardsPerMin: fillNullableNumber(merged.visionWardsPerMin, row.visionWardsPerMin),
      goldDiffAt15: fillNullableNumber(merged.goldDiffAt15, row.goldDiffAt15),
      csDiffAt15: fillNullableNumber(merged.csDiffAt15, row.csDiffAt15),
      xpDiffAt15: fillNullableNumber(merged.xpDiffAt15, row.xpDiffAt15),
      firstBloodParticipationPct: fillNullableNumber(merged.firstBloodParticipationPct, row.firstBloodParticipationPct),
      firstBloodVictimPct: fillNullableNumber(merged.firstBloodVictimPct, row.firstBloodVictimPct),
      currentRecentGames: fillCounter(merged.currentRecentGames, row.currentRecentGames),
      currentTotalGames: fillCounter(merged.currentTotalGames, row.currentTotalGames),
      confidence: fillNullableNumber(merged.confidence, row.confidence),
      stateScore: fillNullableNumber(merged.stateScore, row.stateScore),
      masteryScore: fillNullableNumber(merged.masteryScore, row.masteryScore),
      laneScore: fillNullableNumber(merged.laneScore, row.laneScore),
      overallScore: fillNullableNumber(merged.overallScore, row.overallScore),
      relativeScore: fillNullableNumber(merged.relativeScore, row.relativeScore),
      relativeZScore: fillNullableNumber(merged.relativeZScore, row.relativeZScore),
      evaluationLabel: fillString(merged.evaluationLabel, row.evaluationLabel),
      trendScore: fillNullableNumber(merged.trendScore, row.trendScore),
      recentWinRatePct: fillNullableNumber(merged.recentWinRatePct, row.recentWinRatePct),
      careerWinRatePct: fillNullableNumber(merged.careerWinRatePct, row.careerWinRatePct),
      recentKda: fillNullableNumber(merged.recentKda, row.recentKda),
      careerKda: fillNullableNumber(merged.careerKda, row.careerKda),
      localGoldPerMin: fillNullableNumber(merged.localGoldPerMin, row.localGoldPerMin),
      localCsPerMin: fillNullableNumber(merged.localCsPerMin, row.localCsPerMin),
      localDamagePerMin: fillNullableNumber(merged.localDamagePerMin, row.localDamagePerMin),
      localDamageTakenPerMin: fillNullableNumber(merged.localDamageTakenPerMin, row.localDamageTakenPerMin),
      localKillParticipationPct: fillNullableNumber(merged.localKillParticipationPct, row.localKillParticipationPct),
      localVisionPerMin: fillNullableNumber(merged.localVisionPerMin, row.localVisionPerMin),
      localScore: fillNullableNumber(merged.localScore, row.localScore),
      localExternalWinRatePct: fillNullableNumber(merged.localExternalWinRatePct, row.localExternalWinRatePct),
      mappedTeamName: fillString(merged.mappedTeamName, row.mappedTeamName),
      mappedRole: fillString(merged.mappedRole, row.mappedRole),
      sampleGames: fillCounter(merged.sampleGames, row.sampleGames),
      mappingConfidence: fillNullableNumber(merged.mappingConfidence, row.mappingConfidence),
    };

    labels.splice(0, labels.length, ...mergeUniqueStrings(labels, parseArrayJson(row.labelsJson)));
    insights.splice(0, insights.length, ...mergeUniqueStrings(insights, parseArrayJson(row.insightsJson)));
    const rowExtra = parseObjectJson(row.extraJson);
    extra = {
      ...rowExtra,
      ...extra,
      sourceKeyAliases: mergeUniqueStrings(parseArrayJson(extra.sourceKeyAliases), [row.sourceKey]),
      sourceAliases: mergeUniqueStrings(parseArrayJson(extra.sourceAliases), [row.source]),
      tournamentAliases: mergeUniqueStrings(parseArrayJson(extra.tournamentAliases), [row.tournamentName]),
    };
  }

  return {
    ...merged,
    labelsJson: JSON.stringify(labels),
    insightsJson: JSON.stringify(insights),
    extraJson: JSON.stringify(extra),
    syncedAt: new Date(),
  };
}

async function main() {
  const prisma = new PrismaClient();
  const apply = process.argv.includes('--apply');

  try {
    const snapshots = await prisma.playerStatSnapshot.findMany({
      select: {
        id: true,
        sourceKey: true,
        playerId: true,
        teamId: true,
        league: true,
        seasonYear: true,
        splitName: true,
        tournamentName: true,
        role: true,
        playerName: true,
        normalizedPlayerName: true,
        teamName: true,
        teamShortName: true,
        source: true,
        sourceUrl: true,
        dateFrom: true,
        dateTo: true,
        games: true,
        wins: true,
        losses: true,
        winRatePct: true,
        kda: true,
        avgKills: true,
        avgDeaths: true,
        avgAssists: true,
        csPerMin: true,
        goldPerMin: true,
        killParticipationPct: true,
        damageSharePct: true,
        goldSharePct: true,
        visionSharePct: true,
        damagePerMin: true,
        visionScorePerMin: true,
        wardsPerMin: true,
        wardsClearedPerMin: true,
        visionWardsPerMin: true,
        goldDiffAt15: true,
        csDiffAt15: true,
        xpDiffAt15: true,
        firstBloodParticipationPct: true,
        firstBloodVictimPct: true,
        currentRecentGames: true,
        currentTotalGames: true,
        confidence: true,
        stateScore: true,
        masteryScore: true,
        laneScore: true,
        overallScore: true,
        relativeScore: true,
        relativeZScore: true,
        evaluationLabel: true,
        trendScore: true,
        labelsJson: true,
        insightsJson: true,
        recentWinRatePct: true,
        careerWinRatePct: true,
        recentKda: true,
        careerKda: true,
        localGoldPerMin: true,
        localCsPerMin: true,
        localDamagePerMin: true,
        localDamageTakenPerMin: true,
        localKillParticipationPct: true,
        localVisionPerMin: true,
        localScore: true,
        localExternalWinRatePct: true,
        mappedTeamName: true,
        mappedRole: true,
        sampleGames: true,
        mappingConfidence: true,
        extraJson: true,
        syncedAt: true,
      },
      orderBy: [{ syncedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    const groupMap = new Map();
    for (const row of snapshots) {
      const key = logicalKey(row);
      const list = groupMap.get(key) || [];
      list.push(row);
      groupMap.set(key, list);
    }

    const duplicateGroups = Array.from(groupMap.entries()).filter(([, list]) => list.length > 1);
    let mergedGroups = 0;
    let deletedRows = 0;

    for (const [, rows] of duplicateGroups) {
      const canonical = pickCanonical(rows);
      const others = rows.filter((row) => row.id !== canonical.id);
      const merged = mergeRows(canonical, rows);

      if (apply) {
        await prisma.$transaction(async (tx) => {
          await tx.playerStatSnapshot.update({
            where: { id: canonical.id },
            data: {
              ...merged,
              sourceKey: canonical.sourceKey,
            },
          });
          if (others.length > 0) {
            await tx.playerStatSnapshot.deleteMany({
              where: { id: { in: others.map((row) => row.id) } },
            });
          }
        });
      }

      mergedGroups += 1;
      deletedRows += others.length;
    }

    const summary = {
      mode: apply ? 'apply' : 'dry-run',
      totalSnapshots: snapshots.length,
      duplicateGroupCount: duplicateGroups.length,
      mergedGroups,
      deletedRows,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
