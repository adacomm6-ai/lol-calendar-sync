const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.join(__dirname, '..');
const LOCAL_DB_PATH = path.join(ROOT_DIR, 'prisma', 'dev.db');
const BP_DB_PATH = path.join('D:', 'BP', 'server', 'data', 'bp_stats.db');
const BACKUP_DIR = path.join(ROOT_DIR, 'backups', 'local-db');
const REPORT_DIR = path.join(ROOT_DIR, 'docs');

const REGION_BY_LEAGUE = {
  LPL: 'LPL, 2026, Split 1',
  LCK: 'LCK, 2026, Split 1',
  OTHER: 'OTHER, 2026, Split 1',
};

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/['’`".,()[\]{}:/\\-]/g, '')
    .replace(/\s+/g, '');
}

function normalizeRole(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return 'UNKNOWN';

  const mapping = {
    TOP: 'TOP',
    JG: 'JUNGLE',
    JUNGLE: 'JUNGLE',
    MID: 'MID',
    ADC: 'ADC',
    BOT: 'ADC',
    SUP: 'SUPPORT',
    SUPPORT: 'SUPPORT',
  };

  return mapping[raw] || raw;
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

function formatIso(value) {
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

function buildFormat(seriesFormat, bestOf) {
  const cleaned = normalizeText(seriesFormat).toUpperCase();
  if (cleaned) return cleaned;
  const n = Number(bestOf);
  return Number.isFinite(n) && n > 0 ? `BO${n}` : 'BO3';
}

function buildTournamentName(league, stageName, startTime) {
  const year = startTime ? new Date(startTime).getUTCFullYear() : 2026;
  const cleanedStageName = normalizeText(stageName);

  if (league === 'LPL') return `LPL ${year}`;
  if (league === 'LCK') return `LCK ${year}`;
  return cleanedStageName || `其它赛区 ${year}`;
}

function buildStageName(stageName, stagePhase) {
  const parts = [normalizeText(stageName), normalizeText(stagePhase)].filter(Boolean);
  return parts.join(' / ') || '常规赛';
}

function backupLocalDb() {
  ensureDir(BACKUP_DIR);
  const backupPath = path.join(BACKUP_DIR, `dev-before-bp-rebuild-${nowStamp()}.db`);
  fs.copyFileSync(LOCAL_DB_PATH, backupPath);
  return backupPath;
}

function writeReport(report) {
  ensureDir(REPORT_DIR);
  const reportPath = path.join(REPORT_DIR, `bp-local-rebuild-report-${nowStamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

function buildTeamResolver(localDb) {
  const rows = localDb
    .prepare('SELECT "id", "name", "shortName", "region", "logo" FROM "Team"')
    .all();

  const teamById = new Map();
  const idByKey = new Map();

  function registerTeam(row) {
    teamById.set(row.id, row);
    [row.id, row.name, row.shortName].forEach((value) => {
      const key = normalizeKey(value);
      if (key) idByKey.set(key, row.id);
    });
  }

  rows.forEach(registerTeam);

  const insertTeam = localDb.prepare(`
    INSERT INTO "Team" ("id", "name", "shortName", "region", "logo", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  function ensureTeam(rawName, league) {
    const cleanedName = normalizeText(rawName);
    if (!cleanedName) {
      throw new Error('Encountered empty team name while rebuilding local data.');
    }

    const existingId = idByKey.get(normalizeKey(cleanedName));
    if (existingId) return existingId;

    const teamId = crypto.randomUUID();
    const shortName =
      /^[A-Z0-9.'-]{2,10}$/.test(cleanedName) && !cleanedName.includes(' ') ? cleanedName : null;
    const region = REGION_BY_LEAGUE[league] || REGION_BY_LEAGUE.OTHER;
    const nowIso = new Date().toISOString();

    insertTeam.run(teamId, cleanedName, shortName, region, null, nowIso, nowIso);
    registerTeam({
      id: teamId,
      name: cleanedName,
      shortName,
      region,
      logo: null,
    });

    return teamId;
  }

  return { ensureTeam, teamById };
}

function loadSeriesMeta(bpDb) {
  const rows = bpDb
    .prepare('SELECT "league", "source_match_id", "stage_name", "stage_phase" FROM "series_metadata"')
    .all();

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

function collectPlayers(bpDb, ensureTeam) {
  const rows = bpDb
    .prepare(`
      SELECT "player_name", "role", "team_name", "league", "played_at"
      FROM "picks"
      WHERE COALESCE(TRIM("player_name"), '') <> ''
      ORDER BY datetime("played_at") DESC
    `)
    .all();

  const seen = new Map();

  for (const row of rows) {
    const playerName = normalizeText(row.player_name);
    const playerKey = normalizeKey(playerName);
    if (!playerKey || seen.has(playerKey)) continue;

    const teamId = ensureTeam(row.team_name, normalizeText(row.league) || 'OTHER');
    const nowIso = new Date().toISOString();

    seen.set(playerKey, {
      id: crypto.randomUUID(),
      name: playerName,
      role: normalizeRole(row.role),
      split: '2026 Split 1',
      teamId,
      photo: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return [...seen.values()];
}

function buildGamePayload(gameRows, series, forcedGameNumber = null) {
  const teamStats = new Map();
  const orderedTeams = [series.teamAName, series.teamBName];

  for (const row of gameRows) {
    const teamName = normalizeText(row.team_name);
    if (!teamStats.has(teamName)) {
      teamStats.set(teamName, {
        name: teamName,
        players: [],
        totalKills: 0,
        totalDeaths: 0,
        totalAssists: 0,
        winVotes: 0,
      });
    }

    const stats = teamStats.get(teamName);
    const kills = Number(row.champion_kills) || 0;
    const deaths = Number(row.champion_deaths) || 0;
    const assists = Number(row.champion_assists) || 0;
    const isWin = boolFrom(row.is_win);
    const championId = normalizeChampionId(row.champion_id);
    const heroName = championId || 'Unknown';

    stats.players.push({
      name: normalizeText(row.player_name),
      role: normalizeRole(row.role),
      kills,
      deaths,
      assists,
      isWin,
      hero: heroName,
      championName: heroName,
      hero_avatar: championAvatarPath(championId),
    });
    stats.totalKills += kills;
    stats.totalDeaths += deaths;
    stats.totalAssists += assists;
    if (isWin) stats.winVotes += 1;
  }

  const teamA = teamStats.get(series.teamAName) || {
    name: series.teamAName,
    players: [],
    totalKills: 0,
    totalDeaths: 0,
    totalAssists: 0,
    winVotes: 0,
  };
  const teamB = teamStats.get(series.teamBName) || {
    name: series.teamBName,
    players: [],
    totalKills: 0,
    totalDeaths: 0,
    totalAssists: 0,
    winVotes: 0,
  };

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
    analysisData: JSON.stringify({
      importedFrom: 'BP',
      externalSource: `bp:${normalizeText(referenceRow.source) || 'unknown'}`,
      orderedTeams,
      patchVersion: normalizeText(referenceRow.patch_version),
      teamA,
      teamB,
    }),
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

function collectSeries(bpDb, ensureTeam, metaByMatchId) {
  const rows = bpDb
    .prepare(`
      SELECT
        "played_at",
        "league",
        "team_name",
        "opponent_team_name",
        "player_name",
        "role",
        "is_win",
        "game_duration_minutes",
        "champion_kills",
        "champion_deaths",
        "champion_assists",
        "champion_id",
        "source",
        "source_match_id",
        "source_result_id",
        "source_game_id",
        "patch_version",
        "blue_kills_at_10m",
        "red_kills_at_10m",
        "series_best_of",
        "series_format"
      FROM "picks"
      WHERE COALESCE(TRIM("source_match_id"), '') <> ''
        AND COALESCE(TRIM("source_result_id"), '') <> ''
      ORDER BY datetime("played_at") ASC, "source_match_id" ASC, "source_result_id" ASC
    `)
    .all();

  const seriesMap = new Map();

  for (const row of rows) {
    const sourceMatchId = String(row.source_match_id);
    const sourceResultId = String(row.source_result_id);
    const league = normalizeText(row.league) || 'OTHER';

    if (!seriesMap.has(sourceMatchId)) {
      seriesMap.set(sourceMatchId, {
        sourceMatchId,
        source: normalizeText(row.source) || 'unknown',
        league,
        playedAt: formatIso(row.played_at),
        seriesBestOf: Number(row.series_best_of) || null,
        seriesFormat: normalizeText(row.series_format),
        patchVersion: normalizeText(row.patch_version) || null,
        teamNames: new Set(),
        anchorTeamName: normalizeText(row.team_name),
        games: new Map(),
      });
    }

    const series = seriesMap.get(sourceMatchId);
    const teamName = normalizeText(row.team_name);
    const opponentTeamName = normalizeText(row.opponent_team_name);
    if (teamName) series.teamNames.add(teamName);
    if (opponentTeamName) series.teamNames.add(opponentTeamName);
    if (!series.playedAt) series.playedAt = formatIso(row.played_at);
    if (!series.patchVersion) series.patchVersion = normalizeText(row.patch_version) || null;

    if (!series.games.has(sourceResultId)) {
      series.games.set(sourceResultId, []);
    }
    series.games.get(sourceResultId).push(row);
  }

  const seriesList = [];

  for (const series of seriesMap.values()) {
    const teams = [...series.teamNames].filter(Boolean);
    if (teams.length < 2) continue;

    const teamAName = teams.find((name) => normalizeKey(name) === normalizeKey(series.anchorTeamName)) || teams[0];
    const teamBName = teams.find((name) => normalizeKey(name) !== normalizeKey(teamAName)) || teams[1];

    if (!teamAName || !teamBName) continue;

    const teamAId = ensureTeam(teamAName, series.league);
    const teamBId = ensureTeam(teamBName, series.league);
    const meta = metaByMatchId.get(series.sourceMatchId) || {};

    const gamePayloads = [...series.games.entries()]
      .sort((a, b) => {
        const left = Number(a[1][0]?.source_game_id) || 0;
        const right = Number(b[1][0]?.source_game_id) || 0;
        return left - right;
      })
      .map(([, gameRows], idx) =>
        buildGamePayload(gameRows, {
          teamAName,
          teamBName,
          teamAId,
          teamBId,
        }, idx + 1)
      );

    let teamAWins = 0;
    let teamBWins = 0;
    for (const game of gamePayloads) {
      if (game.winnerId === teamAId) teamAWins += 1;
      if (game.winnerId === teamBId) teamBWins += 1;
    }

    let winnerId = null;
    if (teamAWins > teamBWins) winnerId = teamAId;
    if (teamBWins > teamAWins) winnerId = teamBId;

    seriesList.push({
      sourceMatchId: series.sourceMatchId,
      externalSource: `bp:${series.source}`,
      league: series.league,
      startTime: series.playedAt,
      teamAName,
      teamBName,
      teamAId,
      teamBId,
      winnerId,
      status: 'FINISHED',
      format: buildFormat(series.seriesFormat, series.seriesBestOf),
      tournament: buildTournamentName(series.league, meta.stageName, series.playedAt),
      stage: buildStageName(meta.stageName, meta.stagePhase),
      gameVersion: series.patchVersion,
      games: gamePayloads,
    });
  }

  return seriesList;
}

function removeDemacia(localDb) {
  const demaciaMatchIds = localDb
    .prepare(`
      SELECT "id"
      FROM "Match"
      WHERE LOWER(COALESCE("tournament", '')) LIKE '%demacia%'
         OR LOWER(COALESCE("stage", '')) LIKE '%demacia%'
         OR COALESCE("tournament", '') LIKE '%德玛%'
         OR COALESCE("stage", '') LIKE '%德玛%'
    `)
    .all()
    .map((row) => row.id);

  if (demaciaMatchIds.length === 0) {
    return { matches: 0, games: 0, comments: 0, odds: 0 };
  }

  const placeholders = demaciaMatchIds.map(() => '?').join(', ');
  const gameCount = localDb
    .prepare(`SELECT COUNT(*) AS "count" FROM "Game" WHERE "matchId" IN (${placeholders})`)
    .get(...demaciaMatchIds).count;
  const commentCount = localDb
    .prepare(`SELECT COUNT(*) AS "count" FROM "Comment" WHERE "matchId" IN (${placeholders})`)
    .get(...demaciaMatchIds).count;
  const oddsCount = localDb
    .prepare(`SELECT COUNT(*) AS "count" FROM "Odds" WHERE "matchId" IN (${placeholders})`)
    .get(...demaciaMatchIds).count;

  localDb.prepare(`DELETE FROM "Game" WHERE "matchId" IN (${placeholders})`).run(...demaciaMatchIds);
  localDb.prepare(`DELETE FROM "Comment" WHERE "matchId" IN (${placeholders})`).run(...demaciaMatchIds);
  localDb.prepare(`DELETE FROM "Odds" WHERE "matchId" IN (${placeholders})`).run(...demaciaMatchIds);
  localDb.prepare(`DELETE FROM "Match" WHERE "id" IN (${placeholders})`).run(...demaciaMatchIds);

  return {
    matches: demaciaMatchIds.length,
    games: Number(gameCount || 0),
    comments: Number(commentCount || 0),
    odds: Number(oddsCount || 0),
  };
}

function rebuildPlayers(localDb, players) {
  const existingCount = Number(localDb.prepare('SELECT COUNT(*) AS "count" FROM "Player"').get().count || 0);
  localDb.prepare('DELETE FROM "Player"').run();

  const insertPlayer = localDb.prepare(`
    INSERT INTO "Player" ("id", "name", "role", "split", "teamId", "photo", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const player of players) {
    insertPlayer.run(
      player.id,
      player.name,
      player.role,
      player.split,
      player.teamId,
      player.photo,
      player.createdAt,
      player.updatedAt
    );
  }

  return { cleared: existingCount, inserted: players.length };
}

function findMatchByGameIds(localDb, resultIds) {
  const cleanIds = resultIds.filter(Boolean);
  if (cleanIds.length === 0) return null;

  const placeholders = cleanIds.map(() => '?').join(', ');
  const row = localDb
    .prepare(`
      SELECT "matchId"
      FROM "Game"
      WHERE "externalSourceResultId" IN (${placeholders})
      LIMIT 1
    `)
    .get(...cleanIds);

  return row?.matchId || null;
}

function findExistingMatchId(localDb, series) {
  const byExternalId = localDb
    .prepare('SELECT "id" FROM "Match" WHERE "externalMatchId" = ?')
    .get(series.sourceMatchId);
  if (byExternalId?.id) return byExternalId.id;

  const byGameIds = findMatchByGameIds(
    localDb,
    series.games.map((game) => game.externalSourceResultId)
  );
  if (byGameIds) return byGameIds;

  const exactStart = series.startTime || '';
  if (exactStart) {
    const byTeamsForward = localDb
      .prepare(`
        SELECT "id"
        FROM "Match"
        WHERE "startTime" = ?
          AND "teamAId" = ?
          AND "teamBId" = ?
        LIMIT 1
      `)
      .get(exactStart, series.teamAId, series.teamBId);
    if (byTeamsForward?.id) return byTeamsForward.id;

    const byTeamsReverse = localDb
      .prepare(`
        SELECT "id"
        FROM "Match"
        WHERE "startTime" = ?
          AND "teamAId" = ?
          AND "teamBId" = ?
        LIMIT 1
      `)
      .get(exactStart, series.teamBId, series.teamAId);
    if (byTeamsReverse?.id) return byTeamsReverse.id;
  }

  return null;
}

function overwriteSeries(localDb, seriesList) {
  const updateMatch = localDb.prepare(`
    UPDATE "Match"
    SET "startTime" = ?,
        "teamAId" = ?,
        "teamBId" = ?,
        "winnerId" = ?,
        "status" = ?,
        "format" = ?,
        "tournament" = ?,
        "stage" = ?,
        "gameVersion" = ?,
        "updatedAt" = ?,
        "externalSource" = ?,
        "externalMatchId" = ?
    WHERE "id" = ?
  `);

  const insertMatch = localDb.prepare(`
    INSERT INTO "Match"
    ("id", "startTime", "teamAId", "teamBId", "winnerId", "status", "format", "tournament", "stage", "gameVersion", "createdAt", "updatedAt", "externalSource", "externalMatchId")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteGamesByMatchId = localDb.prepare('DELETE FROM "Game" WHERE "matchId" = ?');
  const deleteCommentsByMatchId = localDb.prepare('DELETE FROM "Comment" WHERE "matchId" = ?');
  const deleteOddsByMatchId = localDb.prepare('DELETE FROM "Odds" WHERE "matchId" = ?');
  const deleteGameByExternalResultId = localDb.prepare('DELETE FROM "Game" WHERE "externalSourceResultId" = ?');

  const insertGame = localDb.prepare(`
    INSERT INTO "Game"
    ("id", "matchId", "gameNumber", "winnerId", "duration", "teamAStats", "teamBStats", "blueSideTeamId", "redSideTeamId", "createdAt", "updatedAt", "analysisData", "totalKills", "blueKills", "redKills", "screenshot", "blueTenMinKills", "redTenMinKills", "screenshot2", "externalSource", "externalSourceResultId", "externalSourceGameId")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stats = {
    insertedMatches: 0,
    updatedMatches: 0,
    insertedGames: 0,
    overwrittenComments: 0,
    overwrittenOdds: 0,
  };

  for (const series of seriesList) {
    let matchId = findExistingMatchId(localDb, series);
    const nowIso = new Date().toISOString();

    if (matchId) {
      stats.overwrittenComments += Number(localDb.prepare('SELECT COUNT(*) AS "count" FROM "Comment" WHERE "matchId" = ?').get(matchId).count || 0);
      stats.overwrittenOdds += Number(localDb.prepare('SELECT COUNT(*) AS "count" FROM "Odds" WHERE "matchId" = ?').get(matchId).count || 0);
      deleteCommentsByMatchId.run(matchId);
      deleteOddsByMatchId.run(matchId);
      deleteGamesByMatchId.run(matchId);

      updateMatch.run(
        series.startTime,
        series.teamAId,
        series.teamBId,
        series.winnerId,
        series.status,
        series.format,
        series.tournament,
        series.stage,
        series.gameVersion,
        nowIso,
        series.externalSource,
        series.sourceMatchId,
        matchId
      );
      stats.updatedMatches += 1;
    } else {
      matchId = crypto.randomUUID();
      insertMatch.run(
        matchId,
        series.startTime,
        series.teamAId,
        series.teamBId,
        series.winnerId,
        series.status,
        series.format,
        series.tournament,
        series.stage,
        series.gameVersion,
        nowIso,
        nowIso,
        series.externalSource,
        series.sourceMatchId
      );
      stats.insertedMatches += 1;
    }

    for (const game of series.games) {
      deleteGameByExternalResultId.run(game.externalSourceResultId);
      insertGame.run(
        game.id,
        matchId,
        game.gameNumber,
        game.winnerId,
        game.duration,
        game.teamAStats,
        game.teamBStats,
        game.blueSideTeamId,
        game.redSideTeamId,
        game.createdAt,
        game.updatedAt,
        game.analysisData,
        game.totalKills,
        game.blueKills,
        game.redKills,
        game.screenshot,
        game.blueTenMinKills,
        game.redTenMinKills,
        game.screenshot2,
        game.externalSource,
        game.externalSourceResultId,
        game.externalSourceGameId
      );
      stats.insertedGames += 1;
    }
  }

  return stats;
}

function countLocal(localDb, tableName) {
  return Number(localDb.prepare(`SELECT COUNT(*) AS "count" FROM "${tableName}"`).get().count || 0);
}

function main() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    throw new Error(`Local DB not found: ${LOCAL_DB_PATH}`);
  }
  if (!fs.existsSync(BP_DB_PATH)) {
    throw new Error(`BP DB not found: ${BP_DB_PATH}`);
  }

  const backupPath = backupLocalDb();
  const localDb = new DatabaseSync(LOCAL_DB_PATH);
  const bpDb = new DatabaseSync(BP_DB_PATH, { readonly: true });

  const report = {
    startedAt: new Date().toISOString(),
    backupPath,
    demaciaRemoved: null,
    players: null,
    seriesImported: null,
    finishedAt: null,
    counts: {},
  };

  try {
    localDb.exec('PRAGMA foreign_keys = ON');
    localDb.exec('BEGIN IMMEDIATE');

    const teamResolver = buildTeamResolver(localDb);
    const metaByMatchId = loadSeriesMeta(bpDb);
    const bpPlayers = collectPlayers(bpDb, teamResolver.ensureTeam);
    const bpSeries = collectSeries(bpDb, teamResolver.ensureTeam, metaByMatchId);

    report.demaciaRemoved = removeDemacia(localDb);
    report.players = rebuildPlayers(localDb, bpPlayers);
    report.seriesImported = overwriteSeries(localDb, bpSeries);

    localDb.exec('COMMIT');
  } catch (error) {
    try {
      localDb.exec('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    bpDb.close();
  }

  report.finishedAt = new Date().toISOString();
  report.counts = {
    teams: countLocal(localDb, 'Team'),
    players: countLocal(localDb, 'Player'),
    matches: countLocal(localDb, 'Match'),
    games: countLocal(localDb, 'Game'),
    comments: countLocal(localDb, 'Comment'),
    odds: countLocal(localDb, 'Odds'),
  };

  localDb.close();

  const reportPath = writeReport(report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}

