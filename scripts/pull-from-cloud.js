require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { Client, types } = require('pg');
const { PrismaClient } = require('@prisma/client');

// Parse timestamp without timezone as UTC.
types.setTypeParser(1114, (value) => new Date(`${value}Z`));

const ROOT_DIR = path.join(__dirname, '..');
const LOCAL_DB_PATH = path.join(ROOT_DIR, 'prisma', 'dev.db');
const BACKUP_DIR = path.join(ROOT_DIR, 'backups', 'local-db');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const FULL_REPLACE = !process.argv.includes('--no-full-replace');

const TABLES = [
  { key: 'team', pg: 'Team' },
  { key: 'hero', pg: 'Hero' },
  { key: 'userProfile', pg: 'UserProfile' },
  { key: 'systemSettings', pg: 'SystemSettings' },
  { key: 'gameVersionRule', pg: 'GameVersionRule' },
  { key: 'player', pg: 'Player' },
  { key: 'match', pg: 'Match' },
  { key: 'game', pg: 'Game' },
  { key: 'comment', pg: 'Comment' },
  { key: 'teamComment', pg: 'TeamComment' },
  { key: 'odds', pg: 'Odds' },
];

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

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

function maskPostgresUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//***@${url.host}${url.pathname}`;
  } catch {
    return '<masked-url>';
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function backupLocalDb() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    return null;
  }

  ensureDir(BACKUP_DIR);
  const backupPath = path.join(BACKUP_DIR, `dev-before-cloud-sync-${nowStamp()}.db`);
  fs.copyFileSync(LOCAL_DB_PATH, backupPath);
  return backupPath;
}

function sanitizeRow(row) {
  const cleaned = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function getPrismaDelegates(prisma) {
  return {
    team: prisma.team,
    hero: prisma.hero,
    userProfile: prisma.userProfile,
    systemSettings: prisma.systemSettings,
    gameVersionRule: prisma.gameVersionRule,
    player: prisma.player,
    match: prisma.match,
    game: prisma.game,
    comment: prisma.comment,
    teamComment: prisma.teamComment,
    odds: prisma.odds,
  };
}

async function clearLocalData(delegates) {
  const reverse = [...TABLES].reverse();
  const stats = {};

  for (const table of reverse) {
    const delegate = delegates[table.key];
    if (!delegate) {
      throw new Error(`Missing Prisma delegate for table key: ${table.key}`);
    }

    const existing = await delegate.count();
    if (existing > 0) {
      await delegate.deleteMany({});
    }

    stats[table.key] = { cleared: existing };
  }

  return stats;
}

async function insertRows(delegate, rows) {
  if (rows.length === 0) {
    return { inserted: 0, failed: 0, mode: 'none' };
  }

  try {
    const result = await delegate.createMany({ data: rows });
    return {
      inserted: Number(result.count || 0),
      failed: rows.length - Number(result.count || 0),
      mode: 'createMany',
    };
  } catch (error) {
    let inserted = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await delegate.create({ data: row });
        inserted += 1;
      } catch {
        failed += 1;
      }
    }

    return { inserted, failed, mode: 'create' };
  }
}

function writeReports(report) {
  ensureDir(DOCS_DIR);

  const timestamp = nowStamp();
  const jsonPath = path.join(DOCS_DIR, `cloud-to-local-sync-report-${timestamp}.json`);
  const latestJsonPath = path.join(DOCS_DIR, 'cloud-to-local-sync-report.latest.json');
  const mdPath = path.join(DOCS_DIR, 'cloud-to-local-sync-report.latest.md');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), 'utf8');

  const lines = [
    '# Cloud To Local Sync Report',
    '',
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Duration ms: ${report.durationMs}`,
    `- Full replace: ${report.fullReplace}`,
    `- Cloud: ${report.cloud}`,
    `- Local DB: ${report.localDb}`,
    `- Backup: ${report.localBackupPath || 'none'}`,
    `- Total fetched: ${report.totalFetched}`,
    `- Total inserted: ${report.totalInserted}`,
    `- Total failed: ${report.totalFailed}`,
    '',
    '| Table | Cleared | Fetched | Inserted | Failed | Mode |',
    '|---|---:|---:|---:|---:|---|',
  ];

  for (const row of report.tables) {
    lines.push(`| ${row.table} | ${row.cleared} | ${row.fetched} | ${row.inserted} | ${row.failed} | ${row.insertMode} |`);
  }

  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
  return { jsonPath, latestJsonPath, mdPath };
}

async function main() {
  const start = performance.now();
  const startedAt = new Date().toISOString();

  const cloudUrl = resolveCloudUrl();
  const cloudClient = new Client({
    connectionString: cloudUrl,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300000,
  });

  const prisma = new PrismaClient({
    datasources: {
      db: { url: `file:${LOCAL_DB_PATH}` },
    },
  });

  const report = {
    startedAt,
    finishedAt: null,
    durationMs: 0,
    fullReplace: FULL_REPLACE,
    cloud: maskPostgresUrl(cloudUrl),
    localDb: LOCAL_DB_PATH,
    localBackupPath: null,
    totalFetched: 0,
    totalInserted: 0,
    totalFailed: 0,
    tables: [],
  };

  try {
    console.log('==========================================');
    console.log('  Cloud -> Local SQLite Full Sync');
    console.log('==========================================');

    report.localBackupPath = backupLocalDb();
    if (report.localBackupPath) {
      console.log(`Backup created: ${report.localBackupPath}`);
    }

    await cloudClient.connect();
    console.log(`Cloud connected: ${report.cloud}`);

    const delegates = getPrismaDelegates(prisma);
    const clearStats = FULL_REPLACE ? await clearLocalData(delegates) : {};

    for (const table of TABLES) {
      const delegate = delegates[table.key];
      const rowResult = await cloudClient.query(`SELECT * FROM "${table.pg}"`);
      const rows = rowResult.rows.map(sanitizeRow);

      const insertResult = await insertRows(delegate, rows);
      const row = {
        table: table.pg,
        cleared: clearStats[table.key]?.cleared || 0,
        fetched: rows.length,
        inserted: insertResult.inserted,
        failed: insertResult.failed,
        insertMode: insertResult.mode,
      };

      report.tables.push(row);
      report.totalFetched += row.fetched;
      report.totalInserted += row.inserted;
      report.totalFailed += row.failed;

      console.log(
        `${table.pg.padEnd(16)} fetched=${row.fetched} inserted=${row.inserted} failed=${row.failed} mode=${row.insertMode}`
      );
    }

    report.finishedAt = new Date().toISOString();
    report.durationMs = Math.round(performance.now() - start);
    const paths = writeReports(report);

    console.log('------------------------------------------');
    console.log(`Total fetched : ${report.totalFetched}`);
    console.log(`Total inserted: ${report.totalInserted}`);
    console.log(`Total failed  : ${report.totalFailed}`);
    console.log(`Report json   : ${paths.latestJsonPath}`);
    console.log(`Report md     : ${paths.mdPath}`);

    if (report.totalFailed > 0) {
      throw new Error(`Sync completed with ${report.totalFailed} failed rows.`);
    }

    console.log('Sync result: PASS');
  } finally {
    await cloudClient.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Sync result: FAIL');
  console.error(error.message || String(error));
  process.exit(1);
});
