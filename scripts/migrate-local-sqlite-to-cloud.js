require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.join(__dirname, '..');
const LOCAL_DB_PATH = path.join(ROOT_DIR, 'prisma', 'dev.db');

const TABLES_IN_INSERT_ORDER = [
  'Team',
  'UserProfile',
  'Hero',
  'GameVersionRule',
  'SystemSettings',
  'Player',
  'Match',
  'TeamComment',
  'Comment',
  'Game',
  'Odds',
  'ManualOddsRecord',
  'PlayerStatSnapshot',
  'PlayerRankAccount',
  'PlayerRankAccountAlias',
  'PlayerRankSnapshot',
  'PlayerRankRecentSummary',
  'PlayerRankProfileCache',
];

function resolveCloudUrl() {
  const raw =
    process.env.CLOUD_DIRECT_URL ||
    process.env.DIRECT_URL ||
    process.env.CLOUD_DATABASE_URL ||
    '';

  const cleaned = raw
    .replace(/([?&])sslmode=[^&]*/gi, '$1')
    .replace(/([?&])pgbouncer=true/gi, '$1')
    .replace(/([?&])connection_limit=[^&]*/gi, '$1')
    .replace(/[?&]$/, '');

  if (!/^postgres(ql)?:\/\//i.test(cleaned)) {
    throw new Error('No valid cloud Postgres URL found in CLOUD_DIRECT_URL/DIRECT_URL/CLOUD_DATABASE_URL.');
  }

  return cleaned;
}

function ensureLocalDbExists() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    throw new Error(`Local sqlite not found: ${LOCAL_DB_PATH}`);
  }
}

function tableExists(db, tableName) {
  const row = db
    .prepare('select name from sqlite_master where type = ? and name = ?')
    .get('table', tableName);
  return Boolean(row?.name);
}

function getTableColumns(db, tableName) {
  return db.prepare(`pragma table_info("${tableName}")`).all();
}

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
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

function normalizeValueByColumn(column, value) {
  if (value === undefined) return null;
  if (value === null) return null;

  const type = String(column.type || '').toUpperCase();

  if (type.includes('BOOLEAN')) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    if (['1', 'true', 't', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'f', 'no'].includes(normalized)) return false;
  }

  if (type.includes('DATE') || type.includes('TIME')) {
    return toPgTimestamp(value);
  }

  return value;
}

async function truncateCloudTables(client, existingTables) {
  const tableList = existingTables.map((table) => quoteIdentifier(table)).join(', ');
  if (!tableList) return;
  await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

async function insertTableRows(client, db, tableName) {
  if (!tableExists(db, tableName)) {
    console.log(`[migrate-cloud] skip missing local table: ${tableName}`);
    return 0;
  }

  const columns = getTableColumns(db, tableName);
  const columnNames = columns.map((column) => column.name);
  const rows = db.prepare(`select * from "${tableName}"`).all();

  if (!rows.length) {
    console.log(`[migrate-cloud] ${tableName}: 0 rows`);
    return 0;
  }

  const quotedColumns = columnNames.map((name) => quoteIdentifier(name)).join(', ');
  const placeholders = columnNames.map((_, index) => `$${index + 1}`).join(', ');
  const sql = `insert into ${quoteIdentifier(tableName)} (${quotedColumns}) values (${placeholders})`;

  for (const row of rows) {
    const values = columns.map((column) => normalizeValueByColumn(column, row[column.name]));
    await client.query(sql, values);
  }

  console.log(`[migrate-cloud] ${tableName}: ${rows.length} rows`);
  return rows.length;
}

async function main() {
  ensureLocalDbExists();

  const localDb = new DatabaseSync(LOCAL_DB_PATH);
  const cloudClient = new Client({
    connectionString: resolveCloudUrl(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await cloudClient.connect();
    await cloudClient.query('BEGIN');

    const existingTables = TABLES_IN_INSERT_ORDER.filter((table) => tableExists(localDb, table)).reverse();
    await truncateCloudTables(cloudClient, existingTables);

    let totalRows = 0;
    for (const tableName of TABLES_IN_INSERT_ORDER) {
      totalRows += await insertTableRows(cloudClient, localDb, tableName);
    }

    await cloudClient.query('COMMIT');
    console.log(`[migrate-cloud] total_rows=${totalRows}`);
    console.log('[migrate-cloud] result=PASS');
  } catch (error) {
    try {
      await cloudClient.query('ROLLBACK');
    } catch (_) {}
    console.error('[migrate-cloud] result=FAIL');
    console.error(error.message || String(error));
    process.exitCode = 1;
  } finally {
    try {
      localDb.close();
    } catch (_) {}
    await cloudClient.end().catch(() => {});
  }
}

main();
