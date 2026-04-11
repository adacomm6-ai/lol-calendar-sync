const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const LOCAL_DB = path.join(ROOT, 'prisma', 'dev.db');
const BP_DB = path.join('D:', 'BP', 'server', 'data', 'bp_stats.db');
const BACKUP_DIR = path.join(ROOT, 'backups', 'local-db');

const SCOREGG_HERO_MAP = {
  Scoregg695: 'Mel',
  Scoregg705: 'Yunara',
  Scoregg711: 'Zaahen',
};

const TEAM_ALIAS = new Map([
  ['bilibiligaming', 'blg'], ['blg', 'blg'],
  ['jdgaming', 'jdg'], ['jdg', 'jdg'],
  ['weibogaming', 'wbg'], ['wbg', 'wbg'],
  ['anyoneslegend', 'al'], ['al', 'al'],
  ['invictusgaming', 'ig'], ['ig', 'ig'],
  ['topesports', 'tes'], ['tes', 'tes'],
  ['edwardgaming', 'edg'], ['edg', 'edg'],
  ['ninjasinpyjamas', 'nip'], ['nip', 'nip'],
  ['lngesports', 'lng'], ['lng', 'lng'],
  ['thundertalkgaming', 'tt'], ['tt', 'tt'],
  ['ohmygod', 'omg'], ['omg', 'omg'],
  ['teamwe', 'we'], ['we', 'we'],
  ['g2esports', 'g2'], ['g2', 'g2'],
  ['teamsecretwhales', 'tsw'], ['tsw', 'tsw'],
  ['gen', 'gen'], ['geng', 'gen'],
  ['bnkfearx', 'bfx'], ['fearx', 'bfx'], ['bfx', 'bfx'],
  ['lyon', 'lyon'], ['loud', 'loud'], ['lll', 'loud'],
  ['dpluskia', 'dk'], ['dk', 'dk'],
  ['drx', 'drx'],
  ['nongshimredforce', 'ns'], ['ns', 'ns'],
  ['dnfreecs', 'dnf'], ['kwangdongfreecs', 'dnf'], ['dnsoopers', 'dnf'],
]);

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function backupLocalDb() {
  ensureDir(BACKUP_DIR);
  const target = path.join(BACKUP_DIR, `dev-before-hero-analysis-backfill-${nowStamp()}.db`);
  fs.copyFileSync(LOCAL_DB, target);
  return target;
}

function normalizeText(v) {
  return String(v || '').replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').trim();
}

function normalizeKey(v) {
  return normalizeText(v).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function canonicalTeam(v) {
  const key = normalizeKey(v);
  return TEAM_ALIAS.get(key) || key;
}

function pairKey(a, b) {
  const aa = canonicalTeam(a);
  const bb = canonicalTeam(b);
  return [aa, bb].sort().join('::');
}

function normalizeRole(v) {
  const r = normalizeText(v).toUpperCase();
  if (!r) return 'UNKNOWN';
  const map = { TOP: 'TOP', JG: 'JUNGLE', JUNGLE: 'JUNGLE', MID: 'MID', ADC: 'ADC', BOT: 'ADC', SUP: 'SUPPORT', SUPPORT: 'SUPPORT' };
  return map[r] || r;
}

function normalizeChampion(raw) {
  const text = normalizeText(raw).replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
  if (!text) return '';
  if (SCOREGG_HERO_MAP[text]) return SCOREGG_HERO_MAP[text];
  return text;
}

function heroAvatar(championId) {
  if (!championId) return '';
  return `https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/${championId}.png`;
}

function parseSafe(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function patchPlayerHeroFields(player) {
  if (!player || typeof player !== 'object') return false;
  let changed = false;
  const originalHero = normalizeText(player.hero || player.champion || player.championName);
  const normalized = normalizeChampion(originalHero);
  if (normalized && normalized !== originalHero) {
    if (typeof player.hero === 'string') player.hero = normalized;
    if (typeof player.champion === 'string') player.champion = normalized;
    if (typeof player.championName === 'string') player.championName = normalized;
    changed = true;
  }
  const targetHero = normalizeChampion(player.hero || player.champion || player.championName);
  if (targetHero) {
    const avatar = heroAvatar(targetHero);
    if (!player.hero_avatar || /^\/images\/champions\//.test(String(player.hero_avatar)) || /Scoregg/i.test(String(player.hero_avatar))) {
      if (player.hero_avatar !== avatar) {
        player.hero_avatar = avatar;
        changed = true;
      }
    }
  }
  return changed;
}

function fixScoreggHeroCodes(localDb) {
  const rows = localDb.prepare("select id, analysisData from \"Game\" where analysisData is not null and analysisData like '%Scoregg%'").all();
  const update = localDb.prepare('update "Game" set "analysisData" = ?, "updatedAt" = ? where "id" = ?');
  const now = new Date().toISOString();
  let updatedGames = 0;
  let updatedPlayers = 0;

  for (const row of rows) {
    const data = parseSafe(row.analysisData, null);
    if (!data || typeof data !== 'object') continue;

    let gameChanged = false;

    const teamAPlayers = Array.isArray(data?.teamA?.players) ? data.teamA.players : [];
    const teamBPlayers = Array.isArray(data?.teamB?.players) ? data.teamB.players : [];
    const damageData = Array.isArray(data?.damage_data) ? data.damage_data : [];

    for (const p of [...teamAPlayers, ...teamBPlayers, ...damageData]) {
      if (patchPlayerHeroFields(p)) {
        updatedPlayers += 1;
        gameChanged = true;
      }
    }

    if (gameChanged) {
      update.run(JSON.stringify(data), now, row.id);
      updatedGames += 1;
    }
  }

  return { scanned: rows.length, updatedGames, updatedPlayers };
}

function loadBpSeries(bpDb) {
  const rows = bpDb.prepare(`
    select
      source_match_id,
      source_result_id,
      source_game_id,
      played_at,
      team_name,
      opponent_team_name,
      player_name,
      role,
      champion_id,
      champion_kills,
      champion_deaths,
      champion_assists,
      game_duration_minutes,
      is_win
    from picks
    where coalesce(trim(source_match_id), '') <> ''
      and coalesce(trim(source_result_id), '') <> ''
    order by datetime(played_at) asc
  `).all();

  const byMatch = new Map();
  for (const r of rows) {
    const matchId = String(r.source_match_id);
    if (!byMatch.has(matchId)) {
      byMatch.set(matchId, {
        sourceMatchId: matchId,
        playedAt: new Date(r.played_at).getTime(),
        teams: new Set(),
        gamesByResult: new Map(),
      });
    }
    const series = byMatch.get(matchId);
    const playedAt = new Date(r.played_at).getTime();
    if (Number.isFinite(playedAt)) series.playedAt = playedAt;

    series.teams.add(canonicalTeam(r.team_name));
    series.teams.add(canonicalTeam(r.opponent_team_name));

    const resultId = String(r.source_result_id);
    if (!series.gamesByResult.has(resultId)) {
      const gameOrderMatch = String(r.source_game_id || '').match(/\d+/);
      const gameOrder = gameOrderMatch ? Number(gameOrderMatch[0]) : 0;
      series.gamesByResult.set(resultId, {
        sourceResultId: resultId,
        sourceGameIdRaw: String(r.source_game_id || ''),
        gameOrder: Number.isFinite(gameOrder) ? gameOrder : 0,
        playedAt,
        rows: [],
      });
    }
    series.gamesByResult.get(resultId).rows.push(r);
  }

  const index = new Map();
  for (const series of byMatch.values()) {
    const teams = [...series.teams];
    if (teams.length < 2) continue;

    series.gamesOrdered = [...series.gamesByResult.values()].sort((a, b) => {
      const ao = Number(a.gameOrder) || 0;
      const bo = Number(b.gameOrder) || 0;
      if (ao > 0 && bo > 0 && ao !== bo) return ao - bo;
      const at = Number(a.playedAt) || 0;
      const bt = Number(b.playedAt) || 0;
      return at - bt;
    });

    const key = [teams[0], teams[1]].sort().join('::');
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(series);
  }

  return index;
}


function buildPlayersFromBpRows(rows, localTeamAName, localTeamBName) {
  const aKey = canonicalTeam(localTeamAName);
  const bKey = canonicalTeam(localTeamBName);

  const teamAPlayers = [];
  const teamBPlayers = [];

  for (const row of rows) {
    const teamKey = canonicalTeam(row.team_name);
    const target = teamKey === aKey ? teamAPlayers : (teamKey === bKey ? teamBPlayers : null);
    if (!target) continue;

    const hero = normalizeChampion(row.champion_id) || 'Unknown';
    target.push({
      name: normalizeText(row.player_name) || 'Unknown',
      role: normalizeRole(row.role),
      kills: Number(row.champion_kills) || 0,
      deaths: Number(row.champion_deaths) || 0,
      assists: Number(row.champion_assists) || 0,
      damage: 0,
      hero,
      championName: hero,
      hero_avatar: heroAvatar(hero),
      team: target === teamAPlayers ? 'Blue' : 'Red',
      isWin: row.is_win === 1 || row.is_win === '1' || row.is_win === true,
    });
  }

  return { teamAPlayers, teamBPlayers };
}

function backfillMissingAnalysis(localDb, bpIndex) {
  const rows = localDb.prepare(`
    select
      g.id as gameId,
      g.matchId as matchId,
      g.gameNumber as gameNumber,
      g.winnerId as winnerId,
      m.startTime as startTime,
      ta.id as teamAId,
      ta.name as teamAName,
      tb.id as teamBId,
      tb.name as teamBName
    from "Game" g
    join "Match" m on m.id = g.matchId
    left join "Team" ta on ta.id = m.teamAId
    left join "Team" tb on tb.id = m.teamBId
    where g.analysisData is null or trim(g.analysisData) = ''
    order by m.startTime desc
  `).all();

  const update = localDb.prepare(`
    update "Game"
    set
      "analysisData" = ?,
      "teamAStats" = ?,
      "teamBStats" = ?,
      "duration" = coalesce("duration", ?),
      "totalKills" = coalesce("totalKills", ?),
      "blueKills" = coalesce("blueKills", ?),
      "redKills" = coalesce("redKills", ?),
      "externalSource" = coalesce("externalSource", ?),
      "updatedAt" = ?
    where "id" = ?
  `);

  const unmatched = [];
  let matched = 0;

  for (const row of rows) {
    const key = pairKey(row.teamAName, row.teamBName);
    const seriesList = bpIndex.get(key) || [];
    if (!seriesList.length) {
      unmatched.push({ gameId: row.gameId, gameNumber: row.gameNumber, teams: `${row.teamAName} vs ${row.teamBName}`, reason: 'no-series-by-team' });
      continue;
    }

    const localTs = Number.isFinite(Number(row.startTime)) ? Number(row.startTime) : new Date(row.startTime).getTime();
    const validSeries = seriesList
      .map((series) => ({
        series,
        diff: Number.isFinite(localTs) && Number.isFinite(series.playedAt) ? Math.abs(series.playedAt - localTs) : Number.MAX_SAFE_INTEGER,
      }))
      .filter((x) => x.diff <= 1000 * 60 * 60 * 48)
      .sort((a, b) => a.diff - b.diff);

    if (!validSeries.length) {
      unmatched.push({ gameId: row.gameId, gameNumber: row.gameNumber, teams: `${row.teamAName} vs ${row.teamBName}`, reason: 'no-series-by-time' });
      continue;
    }

    const pickedSeries = validSeries[0].series;
    const gameRows = pickedSeries.gamesOrdered?.[Number(row.gameNumber) - 1]?.rows || null;
    if (!gameRows || !gameRows.length) {
      unmatched.push({ gameId: row.gameId, gameNumber: row.gameNumber, teams: `${row.teamAName} vs ${row.teamBName}`, reason: 'no-game-number-in-series' });
      continue;
    }

    const { teamAPlayers, teamBPlayers } = buildPlayersFromBpRows(gameRows, row.teamAName, row.teamBName);
    if (teamAPlayers.length < 5 || teamBPlayers.length < 5) {
      unmatched.push({ gameId: row.gameId, gameNumber: row.gameNumber, teams: `${row.teamAName} vs ${row.teamBName}`, reason: 'players-incomplete' });
      continue;
    }

    const blueKills = teamAPlayers.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
    const redKills = teamBPlayers.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
    const totalKills = blueKills + redKills;
    const durationMin = Number(gameRows[0].game_duration_minutes);
    const durationSec = Number.isFinite(durationMin) ? Math.round(durationMin * 60) : null;

    let winner = null;
    if (row.winnerId && row.winnerId === row.teamAId) winner = 'Blue';
    if (row.winnerId && row.winnerId === row.teamBId) winner = 'Red';

    const damageData = [
      ...teamAPlayers.map((p) => ({ ...p, team: 'Blue' })),
      ...teamBPlayers.map((p) => ({ ...p, team: 'Red' })),
    ];

    const payload = {
      importedFrom: 'BP_AUTO_BACKFILL',
      sourceMatchId: pickedSeries.sourceMatchId,
      sourceGameId: Number(row.gameNumber),
      winner,
      duration: durationSec || 0,
      blue_team_name: row.teamAName,
      red_team_name: row.teamBName,
      blue_kills: blueKills,
      red_kills: redKills,
      total_kills: totalKills,
      teamA: { name: row.teamAName, players: teamAPlayers },
      teamB: { name: row.teamBName, players: teamBPlayers },
      damage_data: damageData,
    };

    update.run(
      JSON.stringify(payload),
      JSON.stringify(teamAPlayers),
      JSON.stringify(teamBPlayers),
      durationSec,
      totalKills,
      blueKills,
      redKills,
      'bp:auto-backfill',
      new Date().toISOString(),
      row.gameId,
    );
    matched += 1;
  }

  return {
    totalMissing: rows.length,
    matched,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 50),
  };
}

function main() {
  if (!fs.existsSync(LOCAL_DB)) throw new Error(`Local DB not found: ${LOCAL_DB}`);
  if (!fs.existsSync(BP_DB)) throw new Error(`BP DB not found: ${BP_DB}`);

  const backupPath = backupLocalDb();
  const localDb = new DatabaseSync(LOCAL_DB);
  const bpDb = new DatabaseSync(BP_DB, { readonly: true });

  try {
    localDb.exec('PRAGMA foreign_keys = ON');
    localDb.exec('BEGIN IMMEDIATE');

    const scoreggResult = fixScoreggHeroCodes(localDb);
    const bpIndex = loadBpSeries(bpDb);
    const backfillResult = backfillMissingAnalysis(localDb, bpIndex);

    localDb.exec('COMMIT');

    console.log(JSON.stringify({
      backupPath,
      scoreggResult,
      backfillResult,
    }, null, 2));
  } catch (error) {
    try { localDb.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    bpDb.close();
    localDb.close();
  }
}

main();


