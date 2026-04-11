require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const LOCAL_DB_PATH = path.join(ROOT_DIR, 'prisma', 'dev.db');

const TABLES = [
  'Team',
  'UserProfile',
  'SystemSettings',
  'Player',
  'Match',
  'Game',
  'Comment',
  'TeamComment',
  'Odds',
  'ManualOddsRecord',
  'Hero',
  'GameVersionRule',
  'PlayerStatSnapshot',
  'PlayerRankAccount',
  'PlayerRankAccountAlias',
  'PlayerRankSnapshot',
  'PlayerRankRecentSummary',
  'PlayerRankProfileCache',
];

function resolveCloudUrl() {
  const raw =
    process.env.CLOUD_DATABASE_URL ||
    process.env.CLOUD_DIRECT_URL ||
    process.env.DIRECT_URL ||
    '';

  const cleaned = raw
    .replace(/([?&])sslmode=[^&]*/gi, '$1')
    .replace(/[?&]$/, '');

  if (!/^postgres(ql)?:\/\//i.test(cleaned)) {
    throw new Error('No valid cloud Postgres URL found in CLOUD_DATABASE_URL/CLOUD_DIRECT_URL/DIRECT_URL.');
  }

  return cleaned;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function localTableExists(db, table) {
  const row = db.prepare('select name from sqlite_master where type = ? and name = ?').get('table', table);
  return Boolean(row?.name);
}

function queryLocalCount(db, table) {
  if (!localTableExists(db, table)) return 0;
  const row = db.prepare(`select count(*) as c from "${table}"`).get();
  return Number(row?.c || 0);
}

async function queryCloudCount(client, table) {
  const result = await client.query(`select count(*)::int as c from "${table}"`);
  return Number(result.rows?.[0]?.c || 0);
}

function writeReport(report) {
  ensureDir(DOCS_DIR);
  const stamp = nowStamp();
  fs.writeFileSync(path.join(DOCS_DIR, 'cloud-local-consistency.latest.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(DOCS_DIR, `cloud-local-consistency-${stamp}.json`), JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const cloudUrl = resolveCloudUrl();
  const cloudClient = new Client({
    connectionString: cloudUrl,
    ssl: { rejectUnauthorized: false },
  });

  const localDb = new DatabaseSync(LOCAL_DB_PATH);
  const rows = [];

  try {
    await cloudClient.connect();

    for (const table of TABLES) {
      const localCount = queryLocalCount(localDb, table);
      const cloudCount = await queryCloudCount(cloudClient, table);

      rows.push({
        table,
        local: localCount,
        cloud: cloudCount,
        match: localCount === cloudCount,
      });
    }

    const mismatches = rows.filter((r) => !r.match);
    const report = {
      checkedAt: new Date().toISOString(),
      localDb: LOCAL_DB_PATH,
      tables: rows,
      mismatchCount: mismatches.length,
      pass: mismatches.length === 0,
    };

    writeReport(report);

    console.log('--- Cloud / Local Consistency Check ---');
    for (const row of rows) {
      console.log(`${row.table}: cloud=${row.cloud}, local=${row.local}, match=${row.match}`);
    }
    console.log(`result=${report.pass ? 'PASS' : 'FAIL'}`);

    if (!report.pass) {
      process.exit(1);
    }
  } finally {
    localDb.close();
    await cloudClient.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Consistency check failed:', error.message || String(error));
  process.exit(1);
});
