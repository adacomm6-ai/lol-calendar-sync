const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const EXECUTE = process.argv.includes('--execute');

function resolveDbPath() {
  const cwd = process.cwd();
  const direct = path.join(cwd, 'prisma', 'dev.db');
  const workspaceRoot = path.resolve(cwd, '..', '..', 'prisma', 'dev.db');
  if (cwd.includes('__recovery_work__') && fs.existsSync(workspaceRoot)) return workspaceRoot;
  return direct;
}

function normalizeAliasKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

const TEAM_ALIAS_BY_KEY = {
  drx: 'KRX',
  tes: 'Top Esports',
  tope: 'Top Esports',
  topesports: 'Top Esports',
  ig: 'Invictus Gaming',
  invictus: 'Invictus Gaming',
  invictusgaming: 'Invictus Gaming',
  al: "Anyone's Legend",
  anyoneslegend: "Anyone's Legend",
  wbg: 'Weibo Gaming',
  weibogaming: 'Weibo Gaming',
  blg: 'Bilibili Gaming',
  bilibiligaming: 'Bilibili Gaming',
  nip: 'Ninjas in Pyjamas',
  ninjasinpyjamas: 'Ninjas in Pyjamas',
  lng: 'LNG Esports',
  lngesports: 'LNG Esports',
  we: 'Team WE',
  teamwe: 'Team WE',
  jdg: 'JD Gaming',
  jdgaming: 'JD Gaming',
  edg: 'EDward Gaming',
  edwardgaming: 'EDward Gaming',
  fpx: 'FunPlus Phoenix',
  funplusphoenix: 'FunPlus Phoenix',
  omg: 'Oh My God',
  ohmygod: 'Oh My God',
  up: 'Ultra Prime',
  ultraprime: 'Ultra Prime',
  tt: 'ThunderTalk Gaming',
  thundertalkgaming: 'ThunderTalk Gaming',
  lgd: 'LGD Gaming',
  lgdgaming: 'LGD Gaming',
  ra: 'Rare Atom',
  rareatom: 'Rare Atom',
  vit: 'Team Vitality',
  tv: 'Team Vitality',
  teamvitality: 'Team Vitality',
  kc: 'Karmine Corp',
  karminecorp: 'Karmine Corp',
  mkoi: 'Movistar KOI',
  movistarkoi: 'Movistar KOI',
  gx: 'GIANTX',
  giantx: 'GIANTX',
  th: 'Team Heretics',
  heretics: 'Team Heretics',
  teamheretics: 'Team Heretics',
  fnc: 'Fnatic',
  fnatic: 'Fnatic',
  g2: 'G2 Esports',
  g2esports: 'G2 Esports',
  bds: 'Team BDS',
  teambds: 'Team BDS',
  rge: 'Rogue',
  rogue: 'Rogue',
  navi: 'Natus Vincere',
  natusvincere: 'Natus Vincere',
  sk: 'SK Gaming',
  skgaming: 'SK Gaming',
  hle: 'Hanwha Life Esports',
  hanwhalifeesports: 'Hanwha Life Esports',
};

function resolveTeamAlias(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return TEAM_ALIAS_BY_KEY[normalizeAliasKey(trimmed)] || trimmed;
}

function normalizeTeamLookupKey(value) {
  return normalizeAliasKey(resolveTeamAlias(value));
}

function normalizePlayerKey(value) {
  return String(value || '').trim().toLowerCase();
}

function chooseCanonicalTeam(teams) {
  return [...teams].sort((a, b) => {
    const aAlias = resolveTeamAlias(a.name) === a.name ? 1 : 0;
    const bAlias = resolveTeamAlias(b.name) === b.name ? 1 : 0;
    if (aAlias !== bAlias) return bAlias - aAlias;

    const aLogo = a.logo ? 1 : 0;
    const bLogo = b.logo ? 1 : 0;
    if (aLogo !== bLogo) return bLogo - aLogo;

    const aLen = String(a.name || '').length;
    const bLen = String(b.name || '').length;
    if (aLen !== bLen) return bLen - aLen;

    return new Date(a.createdAt) - new Date(b.createdAt);
  })[0];
}

function safeDateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return time;
}

function pickNewerRow(a, b) {
  const aTime = safeDateValue(a?.updatedAt) || safeDateValue(a?.createdAt) || 0;
  const bTime = safeDateValue(b?.updatedAt) || safeDateValue(b?.createdAt) || 0;
  return aTime >= bTime ? a : b;
}

function chooseText(preferred, fallback, key) {
  const first = preferred?.[key];
  if (first !== null && first !== undefined && String(first).trim() !== '') return first;
  return fallback?.[key] ?? null;
}

function chooseNumber(preferred, fallback, key) {
  const first = preferred?.[key];
  if (typeof first === 'number') return first;
  return typeof fallback?.[key] === 'number' ? fallback[key] : null;
}

function maxNumber(a, b, key) {
  const left = typeof a?.[key] === 'number' ? a[key] : null;
  const right = typeof b?.[key] === 'number' ? b[key] : null;
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function countTeamReferences(db, teamId) {
  const scalar = [
    ['Match', 'teamAId'],
    ['Match', 'teamBId'],
    ['Match', 'winnerId'],
    ['Game', 'winnerId'],
    ['Game', 'blueSideTeamId'],
    ['Game', 'redSideTeamId'],
    ['Player', 'teamId'],
    ['TeamComment', 'teamId'],
    ['ManualOddsRecord', 'teamAId'],
    ['ManualOddsRecord', 'teamBId'],
    ['PlayerStatSnapshot', 'teamId'],
    ['PlayerRankAccount', 'teamId'],
    ['PlayerRankRecentSummary', 'teamId'],
    ['PlayerRankProfileCache', 'teamId'],
  ];
  const stmtCache = new Map();
  let total = 0;
  const detail = {};
  for (const [table, column] of scalar) {
    const key = `${table}.${column}`;
    if (!stmtCache.has(key)) {
      stmtCache.set(key, db.prepare(`SELECT COUNT(*) AS c FROM "${table}" WHERE "${column}" = ?`));
    }
    const count = stmtCache.get(key).get(teamId).c;
    if (count) detail[key] = count;
    total += count;
  }
  return { total, detail };
}

function countSeriesAnomalies(db) {
  const rows = db.prepare(`
    SELECT
      m.id,
      m.format,
      m.status,
      m.teamAId,
      m.teamBId,
      m.winnerId,
      SUM(CASE WHEN g.winnerId = m.teamAId THEN 1 ELSE 0 END) AS rawWinsA,
      SUM(CASE WHEN g.winnerId = m.teamBId THEN 1 ELSE 0 END) AS rawWinsB,
      COUNT(g.id) AS totalGames
    FROM "Match" m
    LEFT JOIN "Game" g ON g.matchId = m.id
    GROUP BY m.id
  `).all();

  const bestOfWins = (format) => {
    const normalized = String(format || '').toUpperCase();
    if (normalized === 'BO1') return 1;
    if (normalized === 'BO2') return 2;
    if (normalized === 'BO5') return 3;
    return 2;
  };

  return rows.filter((row) => {
    const needed = bestOfWins(row.format);
    const finishedByScore = row.rawWinsA >= needed || row.rawWinsB >= needed;
    if (!finishedByScore) return false;
    return row.status !== 'FINISHED' && row.status !== 'COMPLETED';
  }).length;
}

function buildDuplicatePlan(db) {
  const teams = db.prepare(`
    SELECT id, name, shortName, region, logo, createdAt, updatedAt
    FROM "Team"
    ORDER BY datetime(createdAt) ASC, name ASC
  `).all();

  const groups = new Map();
  for (const team of teams) {
    const key = normalizeTeamLookupKey(team.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(team);
  }

  const duplicateGroups = [...groups.entries()]
    .map(([key, items]) => ({ key, items }))
    .filter((group) => group.items.length > 1);

  const pairs = [];
  for (const group of duplicateGroups) {
    const canonical = chooseCanonicalTeam(group.items);
    for (const item of group.items) {
      if (item.id === canonical.id) continue;
      pairs.push({ key: group.key, duplicate: item, canonical });
    }
  }
  return { duplicateGroups, pairs };
}

function mergeProfileCache(db, sourcePlayerId, targetPlayerId, canonicalTeamId) {
  const getCache = db.prepare('SELECT * FROM "PlayerRankProfileCache" WHERE playerId = ?');
  const updateTarget = db.prepare(`
    UPDATE "PlayerRankProfileCache"
    SET
      teamId = ?,
      primaryAccountId = ?,
      activeAccountId = ?,
      displayAccountId = ?,
      displayPlatform = ?,
      displayGameName = ?,
      displayTagLine = ?,
      displayTier = ?,
      displayRank = ?,
      displayLeaguePoints = ?,
      displayWins = ?,
      displayLosses = ?,
      displayWinRate = ?,
      accountCount = ?,
      verifiedAccountCount = ?,
      suspectAccountCount = ?,
      games7d = ?,
      games14d = ?,
      winRate14d = ?,
      activityScore = ?,
      activityLabel = ?,
      formScore = ?,
      trendScore = ?,
      topChampionsJson = ?,
      lastGameAt = ?,
      lastSyncedAt = ?,
      confidenceScore = ?,
      confidenceLabel = ?,
      notes = ?,
      updatedAt = ?
    WHERE id = ?
  `);
  const updateSourceToTarget = db.prepare(`
    UPDATE "PlayerRankProfileCache"
    SET playerId = ?, teamId = ?, updatedAt = ?
    WHERE id = ?
  `);
  const deleteCache = db.prepare('DELETE FROM "PlayerRankProfileCache" WHERE id = ?');

  const source = getCache.get(sourcePlayerId);
  if (!source) return { moved: 0, merged: 0, deleted: 0 };

  const target = getCache.get(targetPlayerId);
  const now = new Date().toISOString();

  if (!target) {
    updateSourceToTarget.run(targetPlayerId, canonicalTeamId, now, source.id);
    return { moved: 1, merged: 0, deleted: 0 };
  }

  const preferred = pickNewerRow(target, source);
  const fallback = preferred === target ? source : target;

  updateTarget.run(
    canonicalTeamId,
    chooseText(preferred, fallback, 'primaryAccountId'),
    chooseText(preferred, fallback, 'activeAccountId'),
    chooseText(preferred, fallback, 'displayAccountId'),
    chooseText(preferred, fallback, 'displayPlatform'),
    chooseText(preferred, fallback, 'displayGameName'),
    chooseText(preferred, fallback, 'displayTagLine'),
    chooseText(preferred, fallback, 'displayTier'),
    chooseText(preferred, fallback, 'displayRank'),
    chooseNumber(preferred, fallback, 'displayLeaguePoints'),
    chooseNumber(preferred, fallback, 'displayWins') ?? 0,
    chooseNumber(preferred, fallback, 'displayLosses') ?? 0,
    chooseNumber(preferred, fallback, 'displayWinRate'),
    maxNumber(target, source, 'accountCount') ?? 0,
    maxNumber(target, source, 'verifiedAccountCount') ?? 0,
    maxNumber(target, source, 'suspectAccountCount') ?? 0,
    maxNumber(target, source, 'games7d') ?? 0,
    maxNumber(target, source, 'games14d') ?? 0,
    chooseNumber(preferred, fallback, 'winRate14d'),
    chooseNumber(preferred, fallback, 'activityScore'),
    chooseText(preferred, fallback, 'activityLabel'),
    chooseNumber(preferred, fallback, 'formScore'),
    chooseNumber(preferred, fallback, 'trendScore'),
    chooseText(preferred, fallback, 'topChampionsJson'),
    chooseText(preferred, fallback, 'lastGameAt'),
    chooseText(preferred, fallback, 'lastSyncedAt'),
    chooseNumber(preferred, fallback, 'confidenceScore'),
    chooseText(preferred, fallback, 'confidenceLabel'),
    chooseText(preferred, fallback, 'notes'),
    now,
    target.id,
  );

  deleteCache.run(source.id);
  return { moved: 0, merged: 1, deleted: 1 };
}

function mergePlayerInto(db, sourcePlayer, targetPlayer, canonicalTeamId) {
  const now = new Date().toISOString();
  const updatePlayerMeta = db.prepare(`
    UPDATE "Player"
    SET role = ?, split = ?, photo = ?, updatedAt = ?
    WHERE id = ?
  `);
  const updateSnapshotPlayer = db.prepare('UPDATE "PlayerRankSnapshot" SET playerId = ? WHERE playerId = ?');
  const updateAccountPlayer = db.prepare('UPDATE "PlayerRankAccount" SET playerId = ?, updatedAt = ? WHERE playerId = ?');
  const updateStatPlayer = db.prepare('UPDATE "PlayerStatSnapshot" SET playerId = ?, updatedAt = ? WHERE playerId = ?');
  const updateRecentPlayer = db.prepare('UPDATE "PlayerRankRecentSummary" SET playerId = ?, updatedAt = ? WHERE playerId = ?');
  const updateAccountTeam = db.prepare('UPDATE "PlayerRankAccount" SET teamId = ?, updatedAt = ? WHERE playerId = ?');
  const updateRecentTeam = db.prepare('UPDATE "PlayerRankRecentSummary" SET teamId = ?, updatedAt = ? WHERE playerId = ?');
  const updateStatTeam = db.prepare('UPDATE "PlayerStatSnapshot" SET teamId = ?, updatedAt = ? WHERE playerId = ?');
  const deletePlayer = db.prepare('DELETE FROM "Player" WHERE id = ?');

  const preferred = pickNewerRow(targetPlayer, sourcePlayer);
  const mergedRole = chooseText(preferred, preferred === targetPlayer ? sourcePlayer : targetPlayer, 'role') || targetPlayer.role;
  const mergedSplit = chooseText(preferred, preferred === targetPlayer ? sourcePlayer : targetPlayer, 'split') || targetPlayer.split;
  const mergedPhoto = chooseText(preferred, preferred === targetPlayer ? sourcePlayer : targetPlayer, 'photo');
  updatePlayerMeta.run(mergedRole, mergedSplit, mergedPhoto, now, targetPlayer.id);

  updateSnapshotPlayer.run(targetPlayer.id, sourcePlayer.id);
  updateAccountPlayer.run(targetPlayer.id, now, sourcePlayer.id);
  updateStatPlayer.run(targetPlayer.id, now, sourcePlayer.id);
  updateRecentPlayer.run(targetPlayer.id, now, sourcePlayer.id);
  updateAccountTeam.run(canonicalTeamId, now, targetPlayer.id);
  updateRecentTeam.run(canonicalTeamId, now, targetPlayer.id);
  updateStatTeam.run(canonicalTeamId, now, targetPlayer.id);

  const cacheResult = mergeProfileCache(db, sourcePlayer.id, targetPlayer.id, canonicalTeamId);
  deletePlayer.run(sourcePlayer.id);

  return {
    mergedPlayers: 1,
    movedPlayers: 0,
    mergedCaches: cacheResult.merged,
    movedCaches: cacheResult.moved,
    deletedCaches: cacheResult.deleted,
    deletedPlayers: 1,
  };
}

function movePlayerToCanonicalTeam(db, playerId, canonicalTeamId) {
  const now = new Date().toISOString();
  db.prepare('UPDATE "Player" SET teamId = ?, updatedAt = ? WHERE id = ?').run(canonicalTeamId, now, playerId);
  db.prepare('UPDATE "PlayerRankAccount" SET teamId = ?, updatedAt = ? WHERE playerId = ?').run(canonicalTeamId, now, playerId);
  db.prepare('UPDATE "PlayerRankRecentSummary" SET teamId = ?, updatedAt = ? WHERE playerId = ?').run(canonicalTeamId, now, playerId);
  db.prepare('UPDATE "PlayerStatSnapshot" SET teamId = ?, updatedAt = ? WHERE playerId = ?').run(canonicalTeamId, now, playerId);
  db.prepare('UPDATE "PlayerRankProfileCache" SET teamId = ?, updatedAt = ? WHERE playerId = ?').run(canonicalTeamId, now, playerId);
  return { mergedPlayers: 0, movedPlayers: 1, mergedCaches: 0, movedCaches: 0, deletedCaches: 0, deletedPlayers: 0 };
}

function executeMerge(db, pairs) {
  const getPlayersByTeam = db.prepare(`
    SELECT id, name, role, split, teamId, photo, createdAt, updatedAt
    FROM "Player"
    WHERE teamId = ?
    ORDER BY datetime(createdAt) ASC, name ASC
  `);
  const now = new Date().toISOString();
  const updateMatchTeamA = db.prepare('UPDATE "Match" SET teamAId = ?, updatedAt = ? WHERE teamAId = ?');
  const updateMatchTeamB = db.prepare('UPDATE "Match" SET teamBId = ?, updatedAt = ? WHERE teamBId = ?');
  const updateMatchWinner = db.prepare('UPDATE "Match" SET winnerId = ?, updatedAt = ? WHERE winnerId = ?');
  const updateGameWinner = db.prepare('UPDATE "Game" SET winnerId = ?, updatedAt = ? WHERE winnerId = ?');
  const updateGameBlue = db.prepare('UPDATE "Game" SET blueSideTeamId = ?, updatedAt = ? WHERE blueSideTeamId = ?');
  const updateGameRed = db.prepare('UPDATE "Game" SET redSideTeamId = ?, updatedAt = ? WHERE redSideTeamId = ?');
  const updateComment = db.prepare('UPDATE "TeamComment" SET teamId = ? WHERE teamId = ?');
  const updateOddsA = db.prepare('UPDATE "ManualOddsRecord" SET teamAId = ?, updatedAt = ? WHERE teamAId = ?');
  const updateOddsB = db.prepare('UPDATE "ManualOddsRecord" SET teamBId = ?, updatedAt = ? WHERE teamBId = ?');
  const updateStatTeam = db.prepare('UPDATE "PlayerStatSnapshot" SET teamId = ?, updatedAt = ? WHERE teamId = ?');
  const updateAccountTeam = db.prepare('UPDATE "PlayerRankAccount" SET teamId = ?, updatedAt = ? WHERE teamId = ?');
  const updateRecentTeam = db.prepare('UPDATE "PlayerRankRecentSummary" SET teamId = ?, updatedAt = ? WHERE teamId = ?');
  const updateProfileTeam = db.prepare('UPDATE "PlayerRankProfileCache" SET teamId = ?, updatedAt = ? WHERE teamId = ?');
  const deleteTeam = db.prepare('DELETE FROM "Team" WHERE id = ?');

  const stats = {
    mergedTeams: 0,
    mergedPlayers: 0,
    movedPlayers: 0,
    deletedPlayers: 0,
    mergedCaches: 0,
    movedCaches: 0,
    deletedCaches: 0,
    updatedMatchesA: 0,
    updatedMatchesB: 0,
    updatedMatchWinners: 0,
    updatedGameWinners: 0,
    updatedGameBlue: 0,
    updatedGameRed: 0,
    updatedTeamComments: 0,
    updatedManualOddsA: 0,
    updatedManualOddsB: 0,
    updatedSnapshotsTeam: 0,
    updatedAccountsTeam: 0,
    updatedRecentTeam: 0,
    updatedProfileTeam: 0,
  };

  for (const pair of pairs) {
    const canonicalPlayers = getPlayersByTeam.all(pair.canonical.id);
    const duplicatePlayers = getPlayersByTeam.all(pair.duplicate.id);
    const keeperByNormalizedName = new Map();

    for (const player of canonicalPlayers) {
      const key = normalizePlayerKey(player.name);
      if (!key) continue;
      if (!keeperByNormalizedName.has(key)) {
        keeperByNormalizedName.set(key, player);
      }
    }

    for (const sourcePlayer of duplicatePlayers) {
      const key = normalizePlayerKey(sourcePlayer.name);
      const targetPlayer = keeperByNormalizedName.get(key);
      let result;
      if (targetPlayer) {
        result = mergePlayerInto(db, sourcePlayer, targetPlayer, pair.canonical.id);
      } else {
        result = movePlayerToCanonicalTeam(db, sourcePlayer.id, pair.canonical.id);
        keeperByNormalizedName.set(key, {
          ...sourcePlayer,
          teamId: pair.canonical.id,
        });
      }
      stats.mergedPlayers += result.mergedPlayers;
      stats.movedPlayers += result.movedPlayers;
      stats.deletedPlayers += result.deletedPlayers;
      stats.mergedCaches += result.mergedCaches;
      stats.movedCaches += result.movedCaches;
      stats.deletedCaches += result.deletedCaches;
    }

    stats.updatedMatchesA += updateMatchTeamA.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedMatchesB += updateMatchTeamB.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedMatchWinners += updateMatchWinner.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedGameWinners += updateGameWinner.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedGameBlue += updateGameBlue.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedGameRed += updateGameRed.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedTeamComments += updateComment.run(pair.canonical.id, pair.duplicate.id).changes;
    stats.updatedManualOddsA += updateOddsA.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedManualOddsB += updateOddsB.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedSnapshotsTeam += updateStatTeam.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedAccountsTeam += updateAccountTeam.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedRecentTeam += updateRecentTeam.run(pair.canonical.id, now, pair.duplicate.id).changes;
    stats.updatedProfileTeam += updateProfileTeam.run(pair.canonical.id, now, pair.duplicate.id).changes;

    const remaining = countTeamReferences(db, pair.duplicate.id);
    if (remaining.total > 0) {
      throw new Error(`队伍 ${pair.duplicate.name} (${pair.duplicate.id}) 仍有 ${remaining.total} 条引用未迁移: ${JSON.stringify(remaining.detail)}`);
    }

    deleteTeam.run(pair.duplicate.id);
    stats.mergedTeams += 1;
  }

  return stats;
}

function main() {
  const dbPath = resolveDbPath();
  const db = new DatabaseSync(dbPath);

  try {
    const beforePlan = buildDuplicatePlan(db);
    const beforePairs = beforePlan.pairs.map((pair) => ({
      duplicateName: pair.duplicate.name,
      duplicateId: pair.duplicate.id,
      canonicalName: pair.canonical.name,
      canonicalId: pair.canonical.id,
      refs: countTeamReferences(db, pair.duplicate.id),
    }));

    const beforePlayerConflictCount = beforePairs.reduce((sum, pair) => {
      const rows = db.prepare(`
        SELECT COUNT(*) AS c
        FROM "Player" p
        WHERE p.teamId = ?
          AND EXISTS (
            SELECT 1
            FROM "Player" c
            WHERE c.teamId = ?
              AND lower(trim(c.name)) = lower(trim(p.name))
          )
      `).get(pair.duplicateId, pair.canonicalId);
      return sum + rows.c;
    }, 0);

    const beforeSummary = {
      dbPath,
      mode: EXECUTE ? 'EXECUTE' : 'DRY_RUN',
      duplicateGroupCount: beforePlan.duplicateGroups.length,
      mergePairCount: beforePlan.pairs.length,
      playerConflictCount: beforePlayerConflictCount,
      seriesAnomalyCount: countSeriesAnomalies(db),
      pairs: beforePairs,
    };

    if (!EXECUTE) {
      console.log(JSON.stringify(beforeSummary, null, 2));
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    const result = executeMerge(db, beforePlan.pairs);
    const afterPlan = buildDuplicatePlan(db);
    const afterSeriesAnomalyCount = countSeriesAnomalies(db);
    if (afterPlan.pairs.length !== 0) {
      throw new Error(`归并后仍剩余 ${afterPlan.pairs.length} 条重复队伍映射未消除`);
    }
    if (afterSeriesAnomalyCount !== 0) {
      throw new Error(`归并后仍存在 ${afterSeriesAnomalyCount} 场完赛状态异常`);
    }
    db.exec('COMMIT');

    console.log(JSON.stringify({
      ...beforeSummary,
      result,
      after: {
        duplicateGroupCount: afterPlan.duplicateGroups.length,
        mergePairCount: afterPlan.pairs.length,
        seriesAnomalyCount: afterSeriesAnomalyCount,
      },
    }, null, 2));
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    db.close();
  }
}

main();
