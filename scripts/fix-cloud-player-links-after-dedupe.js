const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const FILL_MISSING = process.argv.includes('--fill-missing');

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].includes(raw)) return raw;
  return 'UNKNOWN';
}

function resolveCloudConnectionString() {
  const raw = process.env.CLOUD_DATABASE_URL || process.env.CLOUD_DIRECT_URL || process.env.DATABASE_URL || '';
  return raw.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
}

function safeParseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getLatestBackupPath() {
  const dir = path.join(process.cwd(), 'backup', 'cloud-fixes');
  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((f) => /^cloud-fix-pre-.*\.json$/i.test(f))
    .map((f) => ({ fullPath: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length ? files[0].fullPath : null;
}

function pickCanonicalPlayerId(playerByTeamAndName, teamIdCandidates, nameNorm) {
  if (!nameNorm) return null;
  for (const teamId of teamIdCandidates) {
    if (!teamId) continue;
    const key = `${teamId}::${nameNorm}`;
    const id = playerByTeamAndName.get(key);
    if (id) return id;
  }
  return null;
}

function collectRowsFromNode(node, rows) {
  if (Array.isArray(node)) {
    for (const item of node) collectRowsFromNode(item, rows);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const hasPlayerFields =
    Object.prototype.hasOwnProperty.call(node, 'playerId') ||
    Object.prototype.hasOwnProperty.call(node, 'playerName') ||
    Object.prototype.hasOwnProperty.call(node, 'name');

  if (hasPlayerFields) rows.push(node);

  for (const value of Object.values(node)) {
    collectRowsFromNode(value, rows);
  }
}

function rewriteRowsPlayerIds(rows, options) {
  const {
    redirectMap,
    playerById,
    playerByTeamAndName,
    teamIdCandidates,
    mutateNameToCanonical,
    fillMissingPlayerId,
    unresolvedCollector,
    gameId,
    fieldName,
  } = options;

  let changed = 0;
  let fixedDangling = 0;
  let filledMissing = 0;
  let unresolved = 0;

  for (const row of rows) {
    const rawId = typeof row.playerId === 'string' ? row.playerId.trim() : '';
    const nameNorm = normalizeName(row.playerName || row.name);

    let resolvedId = null;
    const idExists = rawId ? playerById.has(rawId) : false;

    if (rawId && redirectMap.has(rawId)) {
      resolvedId = redirectMap.get(rawId);
    } else if (rawId && !idExists) {
      resolvedId = pickCanonicalPlayerId(playerByTeamAndName, teamIdCandidates, nameNorm);
    } else if (!rawId && fillMissingPlayerId) {
      resolvedId = pickCanonicalPlayerId(playerByTeamAndName, teamIdCandidates, nameNorm);
    }

    if (!resolvedId && rawId && !idExists) {
      unresolved++;
      if (Array.isArray(unresolvedCollector)) {
        unresolvedCollector.push({
          gameId,
          field: fieldName,
          stalePlayerId: rawId,
          playerName: String(row.playerName || row.name || ''),
          teamCandidates: teamIdCandidates.filter(Boolean),
        });
      }
      continue;
    }

    if (resolvedId && resolvedId !== rawId) {
      row.playerId = resolvedId;
      changed++;
      if (rawId) fixedDangling++;
      else filledMissing++;
    }

    const finalId = row.playerId;
    const canonical = finalId ? playerById.get(finalId) : null;
    if (
      mutateNameToCanonical &&
      canonical &&
      normalizeName(row.playerName || row.name) === normalizeName(canonical.name) &&
      (row.playerName || row.name) !== canonical.name
    ) {
      if (Object.prototype.hasOwnProperty.call(row, 'playerName')) {
        row.playerName = canonical.name;
      }
      if (Object.prototype.hasOwnProperty.call(row, 'name')) {
        row.name = canonical.name;
      }
      changed++;
    }
  }

  return { changed, fixedDangling, filledMissing, unresolved };
}

function collectStaleRefsFromStats(games, playerById, deletedRedirectMap) {
  const refs = [];

  for (const game of games) {
    const teamAStats = safeParseJson(game.teamAStats, []);
    const teamBStats = safeParseJson(game.teamBStats, []);

    const scan = (rows, fieldName, primaryTeamId, secondaryTeamId) => {
      if (!Array.isArray(rows)) return;
      for (const row of rows) {
        const staleId = typeof row?.playerId === 'string' ? row.playerId.trim() : '';
        if (!staleId || playerById.has(staleId) || deletedRedirectMap.has(staleId)) continue;

        const name = String(row?.playerName || row?.name || '').trim();
        const nameNorm = normalizeName(name);
        if (!nameNorm) continue;

        refs.push({
          staleId,
          displayName: name,
          nameNorm,
          role: normalizeRole(row?.role),
          gameId: game.id,
          fieldName,
          primaryTeamId: primaryTeamId || null,
          secondaryTeamId: secondaryTeamId || null,
        });
      }
    };

    scan(teamAStats, 'teamAStats', game.teamAId, game.teamBId);
    scan(teamBStats, 'teamBStats', game.teamBId, game.teamAId);
  }

  return refs;
}

async function main() {
  const cloudCs = resolveCloudConnectionString();
  if (!cloudCs || !/^postgres(ql)?:\/\//i.test(cloudCs)) {
    throw new Error('Missing valid cloud Postgres URL in CLOUD_DATABASE_URL/CLOUD_DIRECT_URL/DATABASE_URL');
  }

  const backupPath = getLatestBackupPath();
  if (!backupPath) {
    throw new Error('No backup file found under backup/cloud-fixes/cloud-fix-pre-*.json');
  }

  const rawBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const duplicatePlayersBefore = Array.isArray(rawBackup.cloudDuplicatePlayersBefore)
    ? rawBackup.cloudDuplicatePlayersBefore
    : [];

  const cloud = new Client({ connectionString: cloudCs, ssl: { rejectUnauthorized: false } });

  try {
    await cloud.connect();

    const currentPlayers = (
      await cloud.query('select id, name, role, split, photo, "teamId" from "Player"')
    ).rows;

    const playerById = new Map(currentPlayers.map((p) => [p.id, p]));
    const playerByTeamAndName = new Map();
    for (const p of currentPlayers) {
      const key = `${p.teamId}::${normalizeName(p.name)}`;
      if (!playerByTeamAndName.has(key)) {
        playerByTeamAndName.set(key, p.id);
      }
    }

    // 1) Build redirect map for 23 deleted duplicates
    const deletedRedirectMap = new Map();
    const unresolvedDeletedIds = [];
    for (const old of duplicatePlayersBefore) {
      if (playerById.has(old.id)) continue;
      const key = `${old.teamId}::${normalizeName(old.name)}`;
      const replacementId = playerByTeamAndName.get(key);
      if (replacementId) {
        deletedRedirectMap.set(old.id, replacementId);
      } else {
        unresolvedDeletedIds.push(old.id);
      }
    }

    const games = (
      await cloud.query(`
        select
          g.id,
          g."teamAStats",
          g."teamBStats",
          g."analysisData",
          m."teamAId",
          m."teamBId"
        from "Game" g
        join "Match" m on m.id = g."matchId"
      `)
    ).rows;

    // 2) Build recovery map for other stale IDs not in 23-list
    const staleRefs = collectStaleRefsFromStats(games, playerById, deletedRedirectMap);
    const grouped = new Map();
    for (const ref of staleRefs) {
      const teamId = ref.primaryTeamId;
      if (!teamId) continue;
      const key = `${teamId}::${ref.nameNorm}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          teamId,
          nameNorm: ref.nameNorm,
          displayName: ref.displayName,
          role: ref.role,
          staleIds: new Set(),
          seen: 0,
        });
      }
      const g = grouped.get(key);
      g.staleIds.add(ref.staleId);
      g.seen += 1;
      if (!g.displayName && ref.displayName) g.displayName = ref.displayName;
      if (g.role === 'UNKNOWN' && ref.role !== 'UNKNOWN') g.role = ref.role;
    }

    const recoveryRedirectMap = new Map();
    const playersToCreate = [];

    for (const [, group] of grouped) {
      const existingKey = `${group.teamId}::${group.nameNorm}`;
      let canonicalId = playerByTeamAndName.get(existingKey) || null;

      if (!canonicalId) {
        canonicalId = crypto.randomUUID();
        const displayName = group.displayName || group.nameNorm;
        const role = normalizeRole(group.role);

        playersToCreate.push({
          id: canonicalId,
          name: displayName,
          role,
          split: 'Recovered Legacy',
          teamId: group.teamId,
          photo: null,
        });

        playerById.set(canonicalId, {
          id: canonicalId,
          name: displayName,
          role,
          split: 'Recovered Legacy',
          teamId: group.teamId,
          photo: null,
        });
        playerByTeamAndName.set(existingKey, canonicalId);
      }

      for (const staleId of group.staleIds) {
        recoveryRedirectMap.set(staleId, canonicalId);
      }
    }

    // 3) Merge maps (23-deleted map first priority)
    const redirectMap = new Map(deletedRedirectMap);
    for (const [staleId, keeperId] of recoveryRedirectMap.entries()) {
      if (!redirectMap.has(staleId)) {
        redirectMap.set(staleId, keeperId);
      }
    }

    // 4) Patch game payloads
    const patchPreview = [];
    const unresolvedExamples = [];
    let totalChangedGames = 0;
    let totalChangedRows = 0;
    let totalFixedDangling = 0;
    let totalFilledMissing = 0;
    let totalUnresolved = 0;

    for (const game of games) {
      const teamAStats = safeParseJson(game.teamAStats, []);
      const teamBStats = safeParseJson(game.teamBStats, []);
      const analysisData = safeParseJson(game.analysisData, null);

      let changedThisGame = false;
      const before = {
        teamAStats: game.teamAStats,
        teamBStats: game.teamBStats,
        analysisData: game.analysisData,
      };

      if (Array.isArray(teamAStats)) {
        const result = rewriteRowsPlayerIds(teamAStats, {
          redirectMap,
          playerById,
          playerByTeamAndName,
          teamIdCandidates: [game.teamAId, game.teamBId],
          mutateNameToCanonical: true,
          fillMissingPlayerId: FILL_MISSING,
          unresolvedCollector: unresolvedExamples,
          gameId: game.id,
          fieldName: 'teamAStats',
        });
        if (result.changed > 0) changedThisGame = true;
        totalChangedRows += result.changed;
        totalFixedDangling += result.fixedDangling;
        totalFilledMissing += result.filledMissing;
        totalUnresolved += result.unresolved;
      }

      if (Array.isArray(teamBStats)) {
        const result = rewriteRowsPlayerIds(teamBStats, {
          redirectMap,
          playerById,
          playerByTeamAndName,
          teamIdCandidates: [game.teamBId, game.teamAId],
          mutateNameToCanonical: true,
          fillMissingPlayerId: FILL_MISSING,
          unresolvedCollector: unresolvedExamples,
          gameId: game.id,
          fieldName: 'teamBStats',
        });
        if (result.changed > 0) changedThisGame = true;
        totalChangedRows += result.changed;
        totalFixedDangling += result.fixedDangling;
        totalFilledMissing += result.filledMissing;
        totalUnresolved += result.unresolved;
      }

      if (analysisData && typeof analysisData === 'object') {
        const rows = [];
        collectRowsFromNode(analysisData, rows);
        if (rows.length) {
          const result = rewriteRowsPlayerIds(rows, {
            redirectMap,
            playerById,
            playerByTeamAndName,
            teamIdCandidates: [game.teamAId, game.teamBId],
            mutateNameToCanonical: false,
            fillMissingPlayerId: FILL_MISSING,
            unresolvedCollector: unresolvedExamples,
            gameId: game.id,
            fieldName: 'analysisData',
          });
          if (result.changed > 0) changedThisGame = true;
          totalChangedRows += result.changed;
          totalFixedDangling += result.fixedDangling;
          totalFilledMissing += result.filledMissing;
          totalUnresolved += result.unresolved;
        }
      }

      if (!changedThisGame) continue;
      totalChangedGames++;

      patchPreview.push({
        gameId: game.id,
        before,
        after: {
          teamAStats: JSON.stringify(teamAStats),
          teamBStats: JSON.stringify(teamBStats),
          analysisData: analysisData ? JSON.stringify(analysisData) : game.analysisData,
        },
      });
    }

    const backupDir = path.join(process.cwd(), 'backup', 'cloud-fixes');
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const runBackupPath = path.join(backupDir, `cloud-player-link-fix-pre-${ts}.json`);
    fs.writeFileSync(
      runBackupPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          dryRun: DRY_RUN,
          sourceBackupFile: backupPath,
          stats: {
            duplicateRowsInSourceBackup: duplicatePlayersBefore.length,
            deletedRedirectMapSize: deletedRedirectMap.size,
            recoveredRedirectMapSize: recoveryRedirectMap.size,
            totalRedirectMapSize: redirectMap.size,
            unresolvedDeletedIds: unresolvedDeletedIds.length,
            recoveredPlayersToCreate: playersToCreate.length,
            gamesScanned: games.length,
            gamesToUpdate: totalChangedGames,
            changedRows: totalChangedRows,
            fixedDangling: totalFixedDangling,
            filledMissing: totalFilledMissing,
            unresolvedInGames: totalUnresolved,
            fillMissingPlayerId: FILL_MISSING,
          },
          unresolvedDeletedIds,
          unresolvedExamples: unresolvedExamples.slice(0, 200),
          deletedRedirectMap: Object.fromEntries(deletedRedirectMap),
          recoveryRedirectMap: Object.fromEntries(recoveryRedirectMap),
          playersToCreate,
          patchPreview,
        },
        null,
        2,
      ),
      'utf8',
    );

    console.log('source_backup=' + backupPath);
    console.log('run_backup=' + runBackupPath);
    console.log('deleted_redirect_map_size=' + deletedRedirectMap.size);
    console.log('recovered_redirect_map_size=' + recoveryRedirectMap.size);
    console.log('total_redirect_map_size=' + redirectMap.size);
    console.log('unresolved_deleted_ids=' + unresolvedDeletedIds.length);
    console.log('recovered_players_to_create=' + playersToCreate.length);
    console.log('games_scanned=' + games.length);
    console.log('games_to_update=' + totalChangedGames);
    console.log('changed_rows=' + totalChangedRows);
    console.log('fixed_dangling=' + totalFixedDangling);
    console.log('filled_missing=' + totalFilledMissing);
    console.log('unresolved_in_games=' + totalUnresolved);
    console.log('fill_missing=' + (FILL_MISSING ? '1' : '0'));

    if (DRY_RUN) {
      console.log('mode=DRY_RUN');
      return;
    }

    await cloud.query('BEGIN');

    for (const player of playersToCreate) {
      await cloud.query(
        `insert into "Player" (id, name, role, split, "teamId", photo, "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, now(), now())
         on conflict (id) do nothing`,
        [player.id, player.name, player.role, player.split, player.teamId, player.photo],
      );
    }

    for (const patch of patchPreview) {
      await cloud.query(
        `update "Game"
         set "teamAStats"=$1, "teamBStats"=$2, "analysisData"=$3, "updatedAt"=now()
         where id=$4`,
        [patch.after.teamAStats, patch.after.teamBStats, patch.after.analysisData, patch.gameId],
      );
    }

    await cloud.query('COMMIT');

    // Post-check: scan unresolved playerId references in teamAStats/teamBStats
    const verifyPlayers = (await cloud.query('select id from "Player"')).rows;
    const verifyPlayerSet = new Set(verifyPlayers.map((r) => r.id));

    const verifyGames = (
      await cloud.query('select id, "teamAStats", "teamBStats" from "Game"')
    ).rows;

    let danglingAfter = 0;
    for (const game of verifyGames) {
      const rows = [
        ...safeParseJson(game.teamAStats, []),
        ...safeParseJson(game.teamBStats, []),
      ];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const pid = typeof row?.playerId === 'string' ? row.playerId.trim() : '';
        if (pid && !verifyPlayerSet.has(pid)) danglingAfter++;
      }
    }

    console.log('dangling_after=' + danglingAfter);
    console.log('result=PASS');
  } catch (error) {
    try {
      await cloud.query('ROLLBACK');
    } catch (_) {}
    console.error('result=FAIL');
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  } finally {
    try {
      await cloud.end();
    } catch (_) {}
  }
}

main();
