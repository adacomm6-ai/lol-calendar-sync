const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.join(__dirname, '..');
const LOCAL_DB_PATH = path.join(ROOT_DIR, 'prisma', 'dev.db');
const BP_DATA_DIR = path.join('D:', 'BP', 'server', 'data');
const BACKUP_DIR = path.join(ROOT_DIR, 'backups', 'local-db');

const WORLDS_REGION_ID = 'WORLDS';
const LEGACY_WORLDS_IDS = ['世界赛', 'WORLDS'];
const WORLD_LEAGUES = ['WORLDS', 'MSI', 'INTERNATIONAL'];
const TEAM_NAME_ALIASES = new Map([
  ['LLL', 'LOUD'],
  ['LOUP', 'LOUD'],
  ['LOUD', 'LOUD'],
]);

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function backupLocalDb() {
  ensureDir(BACKUP_DIR);
  const backupPath = path.join(BACKUP_DIR, `dev-before-bp-worlds-sync-${nowStamp()}.db`);
  fs.copyFileSync(LOCAL_DB_PATH, backupPath);
  return backupPath;
}

function normalizeText(value) {
  return String(value ?? '').replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/['’`".,()\[\]{}:/\\-]/g, '').replace(/\s+/g, '');
}

function normalizeRole(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return 'UNKNOWN';
  const mapping = { TOP: 'TOP', JG: 'JUNGLE', JUNGLE: 'JUNGLE', MID: 'MID', ADC: 'ADC', BOT: 'ADC', SUP: 'SUPPORT', SUPPORT: 'SUPPORT' };
  return mapping[raw] || raw;
}

function canonicalizeRegion(value) {
  const text = normalizeText(value);
  const upper = text.toUpperCase();
  if (!text) return text;
  if (upper.includes('LPL')) return 'LPL';
  if (upper.includes('LCK')) return 'LCK';
  if (upper.includes('OTHER') || text.includes('\u5176\u5B83\u8D5B\u533A') || text.includes('\u5176\u4ED6\u8D5B\u533A')) return 'OTHER';
  if (upper.includes('WORLDS') || upper.includes('WORLD') || upper.includes('MSI') || text.includes('\u4E16\u754C\u8D5B') || text.includes('\u5168\u7403\u5148\u950B\u8D5B')) return WORLDS_REGION_ID;
  return text;
}

function canonicalizeTeamName(value) {
  const text = normalizeText(value);
  if (!text) return text;
  const alias = TEAM_NAME_ALIASES.get(text.toUpperCase());
  return alias || text;
}

function formatStartTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function secondsFromMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 60);
}

function boolFrom(value) {
  return value === 1 || value === '1' || value === true;
}

function normalizeChampionId(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  return raw
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
}

function championAvatarPath(championId) {
  if (!championId) return '';
  return `/images/champions/${championId}.png`;
}

function buildFormat(seriesFormat, bestOf) {
  const cleaned = normalizeText(seriesFormat).toUpperCase();
  if (cleaned) return cleaned;
  const n = Number(bestOf);
  return Number.isFinite(n) && n > 0 ? `BO${n}` : 'BO3';
}

function buildTournamentName(league, stageName, playedAt) {
  const cleaned = normalizeText(stageName);
  if (cleaned) return cleaned;
  const year = playedAt ? new Date(playedAt).getUTCFullYear() : 2026;
  return `${league || WORLDS_REGION_ID} ${year}`;
}

function buildStageName(stagePhase) {
  return normalizeText(stagePhase) || '常规赛';
}

function openBpDb() {
  const livePath = path.join(BP_DATA_DIR, 'bp_stats.db');
  if (fs.existsSync(livePath)) {
    return { db: new DatabaseSync(livePath, { readonly: true }), sourcePath: livePath };
  }

  const backupFiles = fs.readdirSync(BP_DATA_DIR)
    .filter((name) => name.startsWith('bp_stats.db.bak'))
    .sort()
    .reverse();
  if (backupFiles.length > 0) {
    const fallbackPath = path.join(BP_DATA_DIR, backupFiles[0]);
    return { db: new DatabaseSync(fallbackPath, { readonly: true }), sourcePath: fallbackPath };
  }

  throw new Error('BP database not found under D:/BP/server/data');
}

function syncSystemSettings(localDb) {
  const row = localDb.prepare('SELECT "data" FROM "SystemSettings" WHERE "id" = ?').get('global');
  if (!row?.data) return false;
  const parsed = JSON.parse(row.data);
  parsed.regions = [
    { id: 'LPL', name: 'LPL (中国)' },
    { id: 'LCK', name: 'LCK (韩国)' },
    { id: 'OTHER', name: 'OTHER' },
    { id: WORLDS_REGION_ID, name: WORLDS_REGION_ID },
  ];
  parsed.splits = (parsed.splits || []).map((split) => ({
    ...split,
    id: LEGACY_WORLDS_IDS.includes(split.id) ? WORLDS_REGION_ID : split.id,
    regions: Array.isArray(split.regions)
      ? split.regions.map((region) => (LEGACY_WORLDS_IDS.includes(region) ? WORLDS_REGION_ID : region))
      : split.regions,
  }));
  if (LEGACY_WORLDS_IDS.includes(parsed.defaultRegion)) parsed.defaultRegion = WORLDS_REGION_ID;
  if (LEGACY_WORLDS_IDS.includes(parsed.defaultSplit)) parsed.defaultSplit = WORLDS_REGION_ID;
  localDb.prepare('UPDATE "SystemSettings" SET "data" = ?, "updatedAt" = ? WHERE "id" = ?').run(JSON.stringify(parsed), new Date().toISOString(), 'global');
  return true;
}

function renameWorldTeamRegions(localDb) {
  const rows = localDb.prepare('SELECT "id", "region" FROM "Team"').all();
  const update = localDb.prepare('UPDATE "Team" SET "region" = ?, "updatedAt" = ? WHERE "id" = ?');
  const nowIso = new Date().toISOString();
  let changed = 0;
  for (const row of rows) {
    const region = String(row.region || '');
    const nextRegion = canonicalizeRegion(region);
    if (nextRegion !== region) {
      update.run(nextRegion, nowIso, row.id);
      changed += 1;
    }
  }
  return changed;
}

function buildTeamResolver(localDb) {
  const rows = localDb.prepare('SELECT "id", "name", "shortName", "region", "logo" FROM "Team"').all();
  const teamById = new Map();
  const idByKey = new Map();
  const updateRegion = localDb.prepare('UPDATE "Team" SET "region" = ?, "updatedAt" = ? WHERE "id" = ?');
  const insert = localDb.prepare(`
    INSERT INTO "Team" ("id", "name", "shortName", "region", "logo", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  function register(row) {
    teamById.set(row.id, row);
    [row.id, row.name, row.shortName, canonicalizeTeamName(row.name), canonicalizeTeamName(row.shortName)].forEach((value) => {
      const key = normalizeKey(value);
      if (key) idByKey.set(key, row.id);
    });
  }

  rows.forEach(register);

  function ensureTeam(rawName) {
    const cleanedName = canonicalizeTeamName(rawName);
    if (!cleanedName) throw new Error('Encountered empty WORLDS team name.');
    const nowIso = new Date().toISOString();
    const existingId = idByKey.get(normalizeKey(cleanedName));
    if (existingId) {
      const existing = teamById.get(existingId);
      const nextRegion = canonicalizeRegion(existing?.region);
      if (existing && nextRegion && String(existing.region || '') !== nextRegion) {
        updateRegion.run(nextRegion, nowIso, existingId);
        existing.region = nextRegion;
      }
      return existingId;
    }
    const teamId = crypto.randomUUID();
    const shortName = /^[A-Z0-9.'-]{2,10}$/.test(cleanedName) && !cleanedName.includes(' ') ? cleanedName : null;
    const region = WORLDS_REGION_ID;
    insert.run(teamId, cleanedName, shortName, region, null, nowIso, nowIso);
    register({ id: teamId, name: cleanedName, shortName, region, logo: null });
    return teamId;
  }

  return { ensureTeam };
}

function loadWorldSeriesMeta(bpDb) {
  const rows = bpDb.prepare(`
    SELECT "league", "source_match_id", "stage_name", "stage_phase"
    FROM "series_metadata"
    WHERE upper("league") IN ('WORLDS', 'MSI', 'INTERNATIONAL')
       OR upper("league") LIKE '%WORLD%'
  `).all();
  const metaByMatchId = new Map();
  for (const row of rows) {
    metaByMatchId.set(String(row.source_match_id), {
      league: normalizeText(row.league),
      stageName: normalizeText(row.stage_name),
      stagePhase: normalizeText(row.stage_phase),
    });
  }
  return metaByMatchId;
}

function collectWorldPlayers(bpDb, ensureTeam) {
  const rows = bpDb.prepare(`
    SELECT "player_name", "role", "team_name", "played_at"
    FROM "picks"
    WHERE (upper("league") IN ('WORLDS', 'MSI', 'INTERNATIONAL') OR upper("league") LIKE '%WORLD%')
      AND COALESCE(TRIM("player_name"), '') <> ''
    ORDER BY datetime("played_at") DESC
  `).all();
  const players = new Map();
  for (const row of rows) {
    const teamId = ensureTeam(row.team_name);
    const name = normalizeText(row.player_name);
    const key = `${teamId}::${normalizeKey(name)}`;
    if (!name || players.has(key)) continue;
    const nowIso = new Date().toISOString();
    players.set(key, {
      id: crypto.randomUUID(),
      name,
      role: normalizeRole(row.role),
      split: '2026 WORLDS',
      teamId,
      photo: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  return [...players.values()];
}

function upsertPlayers(localDb, players) {
  const findExisting = localDb.prepare('SELECT "id" FROM "Player" WHERE "name" = ? AND "teamId" = ? LIMIT 1');
  const insert = localDb.prepare(`
    INSERT INTO "Player" ("id", "name", "role", "split", "teamId", "photo", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const update = localDb.prepare('UPDATE "Player" SET "role" = ?, "split" = ?, "updatedAt" = ? WHERE "id" = ?');
  let inserted = 0;
  let updated = 0;
  for (const player of players) {
    const existing = findExisting.get(player.name, player.teamId);
    if (existing?.id) {
      update.run(player.role, player.split, new Date().toISOString(), existing.id);
      updated += 1;
    } else {
      insert.run(player.id, player.name, player.role, player.split, player.teamId, player.photo, player.createdAt, player.updatedAt);
      inserted += 1;
    }
  }
  return { inserted, updated };
}

function buildGamePayload(gameRows, series, forcedGameNumber = null) {
  const teamStats = new Map();
  for (const row of gameRows) {
    const teamName = canonicalizeTeamName(row.team_name);
    if (!teamStats.has(teamName)) {
      teamStats.set(teamName, { name: teamName, players: [], totalKills: 0, totalDeaths: 0, totalAssists: 0, winVotes: 0 });
    }
    const stats = teamStats.get(teamName);
    const kills = Number(row.champion_kills) || 0;
    const deaths = Number(row.champion_deaths) || 0;
    const assists = Number(row.champion_assists) || 0;
    const isWin = boolFrom(row.is_win);
    const championId = normalizeChampionId(row.champion_id);
    const heroName = championId || 'Unknown';
    stats.players.push({ name: normalizeText(row.player_name), role: normalizeRole(row.role), kills, deaths, assists, isWin, hero: heroName, championName: heroName, hero_avatar: championAvatarPath(championId) });
    stats.totalKills += kills;
    stats.totalDeaths += deaths;
    stats.totalAssists += assists;
    if (isWin) stats.winVotes += 1;
  }
  const teamA = teamStats.get(series.teamAName) || { name: series.teamAName, players: [], totalKills: 0, totalDeaths: 0, totalAssists: 0, winVotes: 0 };
  const teamB = teamStats.get(series.teamBName) || { name: series.teamBName, players: [], totalKills: 0, totalDeaths: 0, totalAssists: 0, winVotes: 0 };
  let winnerId = null;
  if (teamA.winVotes > teamB.winVotes) winnerId = series.teamAId;
  if (teamB.winVotes > teamA.winVotes) winnerId = series.teamBId;
  const referenceRow = gameRows[0];
  const sourceGameNumber = Number(referenceRow.source_game_id) || 0;
  const gameNumber = Number(forcedGameNumber) > 0 ? Number(forcedGameNumber) : (sourceGameNumber || 1);
  return {
    id: crypto.randomUUID(),
    matchId: null,
    gameNumber,
    winnerId,
    duration: secondsFromMinutes(referenceRow.game_duration_minutes),
    teamAStats: JSON.stringify(teamA),
    teamBStats: JSON.stringify(teamB),
    blueSideTeamId: series.teamAId,
    redSideTeamId: series.teamBId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    analysisData: JSON.stringify({ importedFrom: 'BP', externalSource: `bp:${normalizeText(referenceRow.source) || 'unknown'}`, patchVersion: normalizeText(referenceRow.patch_version), teamA, teamB }),
    totalKills: teamA.totalKills + teamB.totalKills,
    blueKills: teamA.totalKills,
    redKills: teamB.totalKills,
    screenshot: null,
    blueTenMinKills: Number(referenceRow.blue_kills_at_10m) || null,
    redTenMinKills: Number(referenceRow.red_kills_at_10m) || null,
    screenshot2: null,
    externalSource: `bp:${normalizeText(referenceRow.source) || 'unknown'}`,
    externalSourceResultId: String(referenceRow.source_result_id),
    externalSourceGameId: normalizeText(referenceRow.source_game_id) || String(gameNumber),
  };
}

function collectWorldSeries(bpDb, ensureTeam, metaByMatchId) {
  const rows = bpDb.prepare(`
    SELECT "played_at", "league", "team_name", "opponent_team_name", "player_name", "role", "is_win", "game_duration_minutes", "champion_kills", "champion_deaths", "champion_assists", "champion_id", "source", "source_match_id", "source_result_id", "source_game_id", "patch_version", "series_best_of", "series_format"
    FROM "picks"
    WHERE (upper("league") IN ('WORLDS', 'MSI', 'INTERNATIONAL') OR upper("league") LIKE '%WORLD%')
      AND COALESCE(TRIM("source_match_id"), '') <> ''
      AND COALESCE(TRIM("source_result_id"), '') <> ''
    ORDER BY datetime("played_at") ASC, "source_match_id" ASC, "source_result_id" ASC
  `).all();
  const seriesMap = new Map();
  for (const row of rows) {
    const sourceMatchId = String(row.source_match_id);
    const sourceResultId = String(row.source_result_id);
    if (!seriesMap.has(sourceMatchId)) {
      seriesMap.set(sourceMatchId, {
        sourceMatchId,
        source: normalizeText(row.source) || 'unknown',
        league: normalizeText(row.league) || WORLDS_REGION_ID,
        playedAt: formatStartTime(row.played_at),
        seriesBestOf: Number(row.series_best_of) || null,
        seriesFormat: normalizeText(row.series_format),
        patchVersion: normalizeText(row.patch_version) || null,
        anchorTeamName: canonicalizeTeamName(row.team_name),
        teamNames: new Set(),
        games: new Map(),
      });
    }
    const series = seriesMap.get(sourceMatchId);
    const teamName = canonicalizeTeamName(row.team_name);
    const opponentTeamName = canonicalizeTeamName(row.opponent_team_name);
    if (teamName) series.teamNames.add(teamName);
    if (opponentTeamName) series.teamNames.add(opponentTeamName);
    if (!series.playedAt) series.playedAt = formatStartTime(row.played_at);
    if (!series.games.has(sourceResultId)) series.games.set(sourceResultId, []);
    series.games.get(sourceResultId).push(row);
  }

  const seriesList = [];
  for (const series of seriesMap.values()) {
    const teams = [...series.teamNames].filter(Boolean);
    if (teams.length < 2) continue;
    const teamAName = teams.find((name) => normalizeKey(name) === normalizeKey(series.anchorTeamName)) || teams[0];
    const teamBName = teams.find((name) => normalizeKey(name) !== normalizeKey(teamAName)) || teams[1];
    if (!teamAName || !teamBName) continue;
    const teamAId = ensureTeam(teamAName);
    const teamBId = ensureTeam(teamBName);
    const meta = metaByMatchId.get(series.sourceMatchId) || {};
    const games = [...series.games.entries()].sort((a,b) => (Number(a[1][0]?.source_game_id)||0) - (Number(b[1][0]?.source_game_id)||0)).map(([, gameRows], idx) => buildGamePayload(gameRows, { teamAName, teamBName, teamAId, teamBId }, idx + 1));
    let teamAWins = 0;
    let teamBWins = 0;
    for (const game of games) {
      if (game.winnerId === teamAId) teamAWins += 1;
      if (game.winnerId === teamBId) teamBWins += 1;
    }
    let winnerId = null;
    if (teamAWins > teamBWins) winnerId = teamAId;
    if (teamBWins > teamAWins) winnerId = teamBId;
    seriesList.push({
      sourceMatchId: series.sourceMatchId,
      externalSource: `bp:${series.source}`,
      startTime: series.playedAt,
      teamAId,
      teamBId,
      winnerId,
      status: 'FINISHED',
      format: buildFormat(series.seriesFormat, series.seriesBestOf),
      tournament: buildTournamentName(meta.league || series.league, meta.stageName, series.playedAt),
      stage: buildStageName(meta.stagePhase),
      gameVersion: series.patchVersion,
      games,
    });
  }
  return seriesList;
}

function findExistingMatchId(localDb, series) {
  const byExternal = localDb.prepare('SELECT "id" FROM "Match" WHERE "externalMatchId" = ?').get(series.sourceMatchId);
  if (byExternal?.id) return byExternal.id;
  return null;
}

function overwriteSeries(localDb, seriesList) {
  const updateMatch = localDb.prepare(`UPDATE "Match" SET "startTime"=?,"teamAId"=?,"teamBId"=?,"winnerId"=?,"status"=?,"format"=?,"tournament"=?,"stage"=?,"gameVersion"=?,"updatedAt"=?,"externalSource"=?,"externalMatchId"=? WHERE "id"=?`);
  const insertMatch = localDb.prepare(`INSERT INTO "Match" ("id","startTime","teamAId","teamBId","winnerId","status","format","tournament","stage","gameVersion","createdAt","updatedAt","externalSource","externalMatchId") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const deleteGamesByMatchId = localDb.prepare('DELETE FROM "Game" WHERE "matchId" = ?');
  const deleteCommentsByMatchId = localDb.prepare('DELETE FROM "Comment" WHERE "matchId" = ?');
  const deleteOddsByMatchId = localDb.prepare('DELETE FROM "Odds" WHERE "matchId" = ?');
  const deleteGameByExternalResultId = localDb.prepare('DELETE FROM "Game" WHERE "externalSourceResultId" = ?');
  const insertGame = localDb.prepare(`INSERT INTO "Game" ("id","matchId","gameNumber","winnerId","duration","teamAStats","teamBStats","blueSideTeamId","redSideTeamId","createdAt","updatedAt","analysisData","totalKills","blueKills","redKills","screenshot","blueTenMinKills","redTenMinKills","screenshot2","externalSource","externalSourceResultId","externalSourceGameId") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const stats = { insertedMatches: 0, updatedMatches: 0, insertedGames: 0 };
  for (const series of seriesList) {
    let matchId = findExistingMatchId(localDb, series);
    const nowIso = new Date().toISOString();
    if (matchId) {
      deleteCommentsByMatchId.run(matchId);
      deleteOddsByMatchId.run(matchId);
      deleteGamesByMatchId.run(matchId);
      updateMatch.run(series.startTime, series.teamAId, series.teamBId, series.winnerId, series.status, series.format, series.tournament, series.stage, series.gameVersion, nowIso, series.externalSource, series.sourceMatchId, matchId);
      stats.updatedMatches += 1;
    } else {
      matchId = crypto.randomUUID();
      insertMatch.run(matchId, series.startTime, series.teamAId, series.teamBId, series.winnerId, series.status, series.format, series.tournament, series.stage, series.gameVersion, nowIso, nowIso, series.externalSource, series.sourceMatchId);
      stats.insertedMatches += 1;
    }
    for (const game of series.games) {
      deleteGameByExternalResultId.run(game.externalSourceResultId);
      insertGame.run(game.id, matchId, game.gameNumber, game.winnerId, game.duration, game.teamAStats, game.teamBStats, game.blueSideTeamId, game.redSideTeamId, game.createdAt, game.updatedAt, game.analysisData, game.totalKills, game.blueKills, game.redKills, game.screenshot, game.blueTenMinKills, game.redTenMinKills, game.screenshot2, game.externalSource, game.externalSourceResultId, game.externalSourceGameId);
      stats.insertedGames += 1;
    }
  }
  return stats;
}

function main() {
  if (!fs.existsSync(LOCAL_DB_PATH)) throw new Error(`Local DB not found: ${LOCAL_DB_PATH}`);
  const backupPath = backupLocalDb();
  const localDb = new DatabaseSync(LOCAL_DB_PATH);
  const { db: bpDb, sourcePath } = openBpDb();
  try {
    localDb.exec('PRAGMA foreign_keys = ON');
    localDb.exec('BEGIN IMMEDIATE');
    const configUpdated = syncSystemSettings(localDb);
    const renamedTeams = renameWorldTeamRegions(localDb);
    const { ensureTeam } = buildTeamResolver(localDb);
    const players = collectWorldPlayers(bpDb, ensureTeam);
    const playerStats = upsertPlayers(localDb, players);
    const metaByMatchId = loadWorldSeriesMeta(bpDb);
    const seriesList = collectWorldSeries(bpDb, ensureTeam, metaByMatchId);
    const seriesStats = overwriteSeries(localDb, seriesList);
    localDb.exec('COMMIT');
    console.log(JSON.stringify({ backupPath, sourcePath, configUpdated, renamedTeams, players: playerStats, series: { total: seriesList.length, ...seriesStats } }, null, 2));
  } catch (error) {
    try { localDb.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    bpDb.close();
    localDb.close();
  }
}

main();



