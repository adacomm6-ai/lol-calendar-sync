const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function resolveCloudConnectionString() {
  const raw = process.env.CLOUD_DATABASE_URL || process.env.CLOUD_DIRECT_URL || process.env.DATABASE_URL || '';
  return raw.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
}

function chooseLatest(rows) {
  const sorted = [...rows].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return sorted[0];
}

function toPgTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value > 1e10 ? value : value * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const str = String(value).trim();
  if (!str) return null;

  if (/^\d+$/.test(str)) {
    const n = Number(str);
    const ms = n > 1e12 ? n : n > 1e10 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  return str;
}

async function main() {
  const cloudCs = resolveCloudConnectionString();
  if (!cloudCs || !/^postgres(ql)?:\/\//i.test(cloudCs)) {
    throw new Error('Missing valid cloud Postgres URL in CLOUD_DATABASE_URL/CLOUD_DIRECT_URL/DATABASE_URL');
  }

  const localDbPath = path.join(process.cwd(), 'prisma', 'dev.db');
  if (!fs.existsSync(localDbPath)) {
    throw new Error(`Local sqlite not found: ${localDbPath}`);
  }

  const localDb = new DatabaseSync(localDbPath);
  const cloud = new Client({ connectionString: cloudCs, ssl: { rejectUnauthorized: false } });

  try {
    await cloud.connect();

    const localRules = localDb
      .prepare('select id, region, version, effectiveFrom, effectiveTo, note, createdAt, updatedAt from "GameVersionRule" order by region, effectiveFrom')
      .all();

    const localPlayers = localDb
      .prepare('select id, name, role, split, teamId, photo, createdAt, updatedAt from "Player"')
      .all();

    const localCanonicalByKey = new Map();
    for (const p of localPlayers) {
      const key = `${p.teamId}::${normalizeName(p.name)}`;
      const prev = localCanonicalByKey.get(key);
      if (!prev) {
        localCanonicalByKey.set(key, p);
      } else {
        const winner = chooseLatest([prev, p]);
        localCanonicalByKey.set(key, winner);
      }
    }

    const cloudRulesBefore = (await cloud.query('select * from "GameVersionRule" order by region, "effectiveFrom"')).rows;
    const cloudPlayersBefore = (await cloud.query('select id, name, role, split, "teamId" as "teamId", photo, "createdAt" as "createdAt", "updatedAt" as "updatedAt" from "Player"')).rows;

    const groups = new Map();
    for (const p of cloudPlayersBefore) {
      const key = `${p.teamId}::${normalizeName(p.name)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);

    const backupDir = path.join(process.cwd(), 'backup', 'cloud-fixes');
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `cloud-fix-pre-${ts}.json`);

    const dupIdSet = new Set(duplicateGroups.flatMap(([, rows]) => rows.map((r) => r.id)));
    const backupPayload = {
      generatedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      summary: {
        localGameVersionRule: localRules.length,
        cloudGameVersionRuleBefore: cloudRulesBefore.length,
        cloudPlayersBefore: cloudPlayersBefore.length,
        cloudDuplicateGroupsBefore: duplicateGroups.length,
      },
      cloudGameVersionRuleBefore: cloudRulesBefore,
      cloudDuplicatePlayersBefore: cloudPlayersBefore.filter((p) => dupIdSet.has(p.id)),
    };
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');

    console.log('backup=' + backupPath);
    console.log('local_gameVersionRule=' + localRules.length);
    console.log('cloud_gameVersionRule_before=' + cloudRulesBefore.length);
    console.log('cloud_players_before=' + cloudPlayersBefore.length);
    console.log('cloud_duplicate_groups_before=' + duplicateGroups.length);

    if (DRY_RUN) {
      console.log('mode=DRY_RUN');
      return;
    }

    await cloud.query('BEGIN');

    await cloud.query('DELETE FROM "GameVersionRule"');
    for (const r of localRules) {
      await cloud.query(
        `insert into "GameVersionRule" (id, region, version, "effectiveFrom", "effectiveTo", note, "createdAt", "updatedAt")
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          r.id,
          r.region,
          r.version,
          toPgTimestamp(r.effectiveFrom),
          toPgTimestamp(r.effectiveTo),
          r.note,
          toPgTimestamp(r.createdAt) || new Date().toISOString(),
          toPgTimestamp(r.updatedAt) || new Date().toISOString(),
        ],
      );
    }

    let deletedPlayers = 0;
    let updatedKeepers = 0;

    for (const [key, rows] of duplicateGroups) {
      const canonical = localCanonicalByKey.get(key);
      let keeper = null;
      if (canonical) {
        keeper = rows.find((r) => r.name === canonical.name) || null;
      }
      if (!keeper) keeper = chooseLatest(rows);

      if (canonical) {
        const needUpdate =
          keeper.name !== canonical.name ||
          (keeper.role || '') !== (canonical.role || '') ||
          (keeper.split || '') !== (canonical.split || '') ||
          (keeper.photo || '') !== (canonical.photo || '');

        if (needUpdate) {
          await cloud.query(
            `update "Player"
             set name=$1, role=$2, split=$3, photo=$4, "updatedAt"=now()
             where id=$5`,
            [canonical.name, canonical.role, canonical.split, canonical.photo, keeper.id],
          );
          updatedKeepers++;
        }
      }

      const removeIds = rows.filter((r) => r.id !== keeper.id).map((r) => r.id);
      if (removeIds.length) {
        await cloud.query('delete from "Player" where id = any($1::text[])', [removeIds]);
        deletedPlayers += removeIds.length;
      }
    }

    const cloudPlayersAfterDedupe = (await cloud.query('select id, name, role, split, "teamId" as "teamId", photo from "Player"')).rows;

    let alignedPlayers = 0;
    for (const p of cloudPlayersAfterDedupe) {
      const key = `${p.teamId}::${normalizeName(p.name)}`;
      const canonical = localCanonicalByKey.get(key);
      if (!canonical) continue;

      const needAlign =
        p.name !== canonical.name ||
        (p.role || '') !== (canonical.role || '') ||
        (p.split || '') !== (canonical.split || '') ||
        (p.photo || '') !== (canonical.photo || '');

      if (!needAlign) continue;

      await cloud.query(
        `update "Player"
         set name=$1, role=$2, split=$3, photo=$4, "updatedAt"=now()
         where id=$5`,
        [canonical.name, canonical.role, canonical.split, canonical.photo, p.id],
      );
      alignedPlayers++;
    }

    await cloud.query('CREATE UNIQUE INDEX IF NOT EXISTS "Player_teamId_name_nocase_key" ON "Player" ("teamId", lower(trim(name)))');

    await cloud.query('COMMIT');

    const cloudRulesAfter = (await cloud.query('select count(*)::int as c from "GameVersionRule"')).rows[0].c;
    const cloudPlayersAfter = (await cloud.query('select count(*)::int as c from "Player"')).rows[0].c;
    const dupAfter = (await cloud.query(`
      select count(*)::int as c
      from (
        select lower(trim(name)) as nk, "teamId", count(*) as cnt
        from "Player"
        group by lower(trim(name)), "teamId"
        having count(*) > 1
      ) t
    `)).rows[0].c;

    console.log('cloud_gameVersionRule_after=' + cloudRulesAfter);
    console.log('cloud_players_after=' + cloudPlayersAfter);
    console.log('cloud_duplicate_groups_after=' + dupAfter);
    console.log('deleted_players=' + deletedPlayers);
    console.log('updated_duplicate_keepers=' + updatedKeepers);
    console.log('aligned_players=' + alignedPlayers);
    console.log('result=PASS');
  } catch (error) {
    try { await cloud.query('ROLLBACK'); } catch (_) {}
    console.error('result=FAIL');
    console.error(error.message || String(error));
    process.exitCode = 1;
  } finally {
    try { await cloud.end(); } catch (_) {}
    try { localDb.close(); } catch (_) {}
  }
}

main();
