const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (['TOP', '上单'].includes(raw)) return 'TOP';
  if (['JUN', 'JUNGLE', 'JG', '打野'].includes(raw)) return 'JUN';
  if (['MID', '中单'].includes(raw)) return 'MID';
  if (['ADC', 'BOT', '下路'].includes(raw)) return 'ADC';
  if (['SUP', 'SUPPORT', '辅助'].includes(raw)) return 'SUP';
  return raw || 'UNKNOWN';
}

function roleAliases(normalizedRole) {
  switch (normalizedRole) {
    case 'TOP':
      return ['TOP', '上单'];
    case 'JUN':
      return ['JUN', 'JUNGLE', 'JG', '打野'];
    case 'MID':
      return ['MID', '中单'];
    case 'ADC':
      return ['ADC', 'BOT', '下路'];
    case 'SUP':
      return ['SUP', 'SUPPORT', '辅助'];
    default:
      return [normalizedRole].filter(Boolean);
  }
}

function resolveCloudConnectionString() {
  const raw = process.env.CLOUD_DATABASE_URL || process.env.CLOUD_DIRECT_URL || process.env.DATABASE_URL || '';
  return raw.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
}

function boolScore(value) {
  return value ? 1 : 0;
}

function parseCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTeamName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function teamDisplayScore(teamName) {
  const text = String(teamName || '').trim();
  if (!text) return 0;
  let score = 0;
  score -= text.length * 0.1;
  if (/^[A-Z0-9.\-]+$/.test(text)) score += 3;
  if (/\bEsports\b/i.test(text) || /\bGaming\b/i.test(text) || /\bRolster\b/i.test(text)) score -= 1.5;
  return score;
}

function chooseKeeper(rows) {
  const regionWeight = new Map();
  for (const row of rows) {
    const weight = parseCount(row.totalRefs) * 100 + boolScore(row.photo) * 10 + 1;
    regionWeight.set(row.region, (regionWeight.get(row.region) || 0) + weight);
  }
  const preferredRegion = Array.from(regionWeight.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([region]) => region)[0] || '';

  return rows
    .slice()
    .sort((left, right) => {
      const refDiff = parseCount(right.totalRefs) - parseCount(left.totalRefs);
      if (refDiff !== 0) return refDiff;

      const rightPreferredRegion = boolScore(right.region === preferredRegion);
      const leftPreferredRegion = boolScore(left.region === preferredRegion);
      if (rightPreferredRegion !== leftPreferredRegion) return rightPreferredRegion - leftPreferredRegion;

      const rightPhoto = boolScore(right.photo);
      const leftPhoto = boolScore(left.photo);
      if (rightPhoto !== leftPhoto) return rightPhoto - leftPhoto;

      const teamScoreDiff = teamDisplayScore(right.team_name) - teamDisplayScore(left.team_name);
      if (teamScoreDiff !== 0) return teamScoreDiff;

      const rightUpdated = new Date(right.updatedAt || 0).getTime();
      const leftUpdated = new Date(left.updatedAt || 0).getTime();
      if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;

      return String(left.id).localeCompare(String(right.id));
    })[0];
}

function shouldMergeGroup(rows, keeper) {
  if (rows.length <= 1) return false;
  const referenced = rows.filter((row) => parseCount(row.totalRefs) > 0);
  if (referenced.length <= 1) return true;

  const allSameRegion = new Set(rows.map((row) => row.region)).size === 1;
  const allHaveSamePhoto = new Set(rows.map((row) => String(row.photo || '').trim()).filter(Boolean)).size <= 1;
  const keeperRefs = parseCount(keeper.totalRefs);
  const others = rows.filter((row) => row.id !== keeper.id);
  const maxOtherRefs = Math.max(0, ...others.map((row) => parseCount(row.totalRefs)));

  if (allSameRegion && allHaveSamePhoto) return true;
  if (keeperRefs > 0 && maxOtherRefs === 0) return true;

  return false;
}

async function exportSummary(backupRoot, payload) {
  fs.writeFileSync(path.join(backupRoot, 'player-merge-summary.json'), JSON.stringify(payload, null, 2), 'utf8');
}

async function main() {
  const cloudCs = resolveCloudConnectionString();
  if (!cloudCs || !/^postgres(ql)?:\/\//i.test(cloudCs)) {
    throw new Error('Missing valid cloud Postgres URL in CLOUD_DATABASE_URL/CLOUD_DIRECT_URL/DATABASE_URL');
  }

  const backupRoot = path.resolve(process.cwd(), '../../__safety_backups/cloud-player-merge-20260415-144955');
  const client = new Client({ connectionString: cloudCs, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    const players = (
      await client.query(`
        select
          p.id,
          p.name,
          p.role,
          p.photo,
          p."teamId",
          p."updatedAt",
          t.name as team_name,
          t.region,
          (select count(*) from "PlayerStatSnapshot" s where s."playerId" = p.id) as stat_refs,
          (select count(*) from "PlayerRankAccount" a where a."playerId" = p.id) as rank_refs,
          (select count(*) from "PlayerRankSnapshot" rs where rs."playerId" = p.id) as rank_snapshot_refs,
          (select count(*) from "PlayerRankRecentSummary" rr where rr."playerId" = p.id) as recent_refs,
          (select count(*) from "PlayerRankProfileCache" pc where pc."playerId" = p.id) as profile_refs
        from "Player" p
        join "Team" t on t.id = p."teamId"
      `)
    ).rows.map((row) => ({
      ...row,
      totalRefs:
        parseCount(row.stat_refs) +
        parseCount(row.rank_refs) +
        parseCount(row.rank_snapshot_refs) +
        parseCount(row.recent_refs) +
        parseCount(row.profile_refs),
    }));

    const groups = new Map();
    for (const row of players) {
      const key = `${normalizeName(row.name)}::${normalizeRole(row.role)}`;
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }

    const duplicateGroups = Array.from(groups.entries())
      .map(([key, rows]) => ({ key, rows }))
      .filter((entry) => entry.rows.length > 1);

    const mergePlan = [];
    const skipPlan = [];

    for (const entry of duplicateGroups) {
      const keeper = chooseKeeper(entry.rows);
      const canMerge = shouldMergeGroup(entry.rows, keeper);
      const payload = {
        key: entry.key,
        keeperId: keeper.id,
        keeperName: keeper.name,
        keeperTeam: keeper.team_name,
        keeperRegion: keeper.region,
        members: entry.rows.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          team: row.team_name,
          region: row.region,
          photo: row.photo,
          totalRefs: row.totalRefs,
        })),
      };

      if (canMerge) mergePlan.push(payload);
      else skipPlan.push(payload);
    }

    const summary = {
      mode: APPLY ? 'apply' : 'dry-run',
      totalPlayers: players.length,
      duplicateGroupCount: duplicateGroups.length,
      mergeGroupCount: mergePlan.length,
      skipGroupCount: skipPlan.length,
      mergePlan,
      skipPlan,
    };

    await exportSummary(backupRoot, summary);

    if (!APPLY) {
      console.log(JSON.stringify({
        mode: summary.mode,
        totalPlayers: summary.totalPlayers,
        duplicateGroupCount: summary.duplicateGroupCount,
        mergeGroupCount: summary.mergeGroupCount,
        skipGroupCount: summary.skipGroupCount,
      }, null, 2));
      return;
    }

    await client.query('BEGIN');

    let updatedSnapshotRefs = 0;
    let filledSnapshotPlayerIds = 0;
    let updatedRankAccountRefs = 0;
    let updatedRankSnapshotRefs = 0;
    let updatedRecentRefs = 0;
    let updatedProfileRefs = 0;
    let deletedPlayers = 0;
    let updatedKeepers = 0;

    for (const group of mergePlan) {
      const keeper = group.members.find((item) => item.id === group.keeperId);
      const duplicateIds = group.members.map((item) => item.id).filter((id) => id !== group.keeperId);
      if (duplicateIds.length === 0) continue;

      const bestPhoto = group.members.map((item) => String(item.photo || '').trim()).find(Boolean) || null;
      const bestRole = group.members.map((item) => normalizeRole(item.role)).find((value) => value !== 'UNKNOWN') || keeper?.role || 'UNKNOWN';

      if (bestPhoto || bestRole !== keeper?.role) {
        const updateRes = await client.query(
          `update "Player"
           set photo = coalesce(nullif($1, ''), photo),
               role = coalesce(nullif($2, ''), role),
               "updatedAt" = now()
           where id = $3`,
          [bestPhoto, bestRole, group.keeperId],
        );
        updatedKeepers += updateRes.rowCount || 0;
      }

      updatedSnapshotRefs += (await client.query(
        `update "PlayerStatSnapshot" set "playerId" = $1, "updatedAt" = now() where "playerId" = any($2::text[])`,
        [group.keeperId, duplicateIds],
      )).rowCount || 0;

      filledSnapshotPlayerIds += (await client.query(
        `update "PlayerStatSnapshot"
         set "playerId" = $1, "updatedAt" = now()
         where "playerId" is null
           and lower(trim("playerName")) = $2
           and upper(trim(role)) = any($3::text[])`,
        [group.keeperId, normalizeName(group.keeperName), roleAliases(normalizeRole(keeper?.role)).map((item) => item.toUpperCase())],
      )).rowCount || 0;

      updatedRankAccountRefs += (await client.query(
        `update "PlayerRankAccount" set "playerId" = $1, "updatedAt" = now() where "playerId" = any($2::text[])`,
        [group.keeperId, duplicateIds],
      )).rowCount || 0;

      updatedRankSnapshotRefs += (await client.query(
        `update "PlayerRankSnapshot" set "playerId" = $1 where "playerId" = any($2::text[])`,
        [group.keeperId, duplicateIds],
      )).rowCount || 0;

      updatedRecentRefs += (await client.query(
        `update "PlayerRankRecentSummary" set "playerId" = $1, "updatedAt" = now() where "playerId" = any($2::text[])`,
        [group.keeperId, duplicateIds],
      )).rowCount || 0;

      const keeperCache = (await client.query(
        `select id from "PlayerRankProfileCache" where "playerId" = $1 limit 1`,
        [group.keeperId],
      )).rows[0] || null;

      const duplicateCaches = (
        await client.query(
          `select id, "playerId", "confidenceScore", "updatedAt" from "PlayerRankProfileCache" where "playerId" = any($1::text[])`,
          [duplicateIds],
        )
      ).rows;

      if (!keeperCache && duplicateCaches.length > 0) {
        const cacheKeeper = duplicateCaches
          .slice()
          .sort((a, b) => parseCount(b.confidenceScore) - parseCount(a.confidenceScore) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
        updatedProfileRefs += (await client.query(
          `update "PlayerRankProfileCache" set "playerId" = $1, "updatedAt" = now() where id = $2`,
          [group.keeperId, cacheKeeper.id],
        )).rowCount || 0;
      }

      const duplicateCacheIds = duplicateCaches.map((item) => item.id);
      if (duplicateCacheIds.length > 0) {
        await client.query(`delete from "PlayerRankProfileCache" where id = any($1::text[]) and "playerId" <> $2`, [
          duplicateCacheIds,
          group.keeperId,
        ]);
      }

      deletedPlayers += (await client.query(`delete from "Player" where id = any($1::text[])`, [duplicateIds])).rowCount || 0;
    }

    const remainingDuplicates = (
      await client.query(`
        select count(*)::int as c
        from (
          select lower(trim(name)) as nk, role, count(*) as cnt
          from "Player"
          group by lower(trim(name)), role
          having count(*) > 1
        ) t
      `)
    ).rows[0]?.c || 0;

    await client.query('COMMIT');

    const applySummary = {
      mode: 'apply',
      totalPlayersBefore: players.length,
      duplicateGroupCountBefore: duplicateGroups.length,
      mergedGroupCount: mergePlan.length,
      skippedGroupCount: skipPlan.length,
      updatedSnapshotRefs,
      filledSnapshotPlayerIds,
      updatedRankAccountRefs,
      updatedRankSnapshotRefs,
      updatedRecentRefs,
      updatedProfileRefs,
      updatedKeepers,
      deletedPlayers,
      duplicateGroupsAfter: remainingDuplicates,
    };

    fs.writeFileSync(path.join(backupRoot, 'player-merge-apply-result.json'), JSON.stringify(applySummary, null, 2), 'utf8');
    console.log(JSON.stringify(applySummary, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
