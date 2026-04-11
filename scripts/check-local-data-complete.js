const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'prisma', 'dev.db');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

function queryInt(db, sql) {
  const row = db.prepare(sql).get();
  return Number(row?.c || 0);
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

function writeReport(report) {
  ensureDir(DOCS_DIR);
  const stamp = nowStamp();
  const latestPath = path.join(DOCS_DIR, 'local-data-check.latest.json');
  const archivePath = path.join(DOCS_DIR, `local-data-check-${stamp}.json`);

  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(archivePath, JSON.stringify(report, null, 2), 'utf8');
}

function main() {
  const db = new DatabaseSync(DB_PATH);
  try {
    const tableCounts = {
      Team: queryInt(db, 'select count(*) as c from "Team"'),
      Player: queryInt(db, 'select count(*) as c from "Player"'),
      Match: queryInt(db, 'select count(*) as c from "Match"'),
      Game: queryInt(db, 'select count(*) as c from "Game"'),
      Comment: queryInt(db, 'select count(*) as c from "Comment"'),
      TeamComment: queryInt(db, 'select count(*) as c from "TeamComment"'),
      Odds: queryInt(db, 'select count(*) as c from "Odds"'),
      Hero: queryInt(db, 'select count(*) as c from "Hero"'),
      GameVersionRule: queryInt(db, 'select count(*) as c from "GameVersionRule"'),
    };

    const checks = {
      unknown_players: queryInt(db, "select count(*) as c from \"Player\" where role='UNKNOWN'"),
      finished_missing_winner: queryInt(
        db,
        "select count(*) as c from \"Match\" where status='FINISHED' and (winnerId is null or trim(winnerId)='')"
      ),
      finished_missing_games: queryInt(
        db,
        "select count(*) as c from \"Match\" m where status='FINISHED' and not exists (select 1 from \"Game\" g where g.matchId = m.id)"
      ),
      matches_missing_gameVersion: queryInt(
        db,
        "select count(*) as c from \"Match\" where gameVersion is null or trim(gameVersion)=''"
      ),
    };

    const report = {
      checkedAt: new Date().toISOString(),
      dbPath: DB_PATH,
      tableCounts,
      checks,
      pass: checks.unknown_players === 0 &&
        checks.finished_missing_winner === 0 &&
        checks.finished_missing_games === 0 &&
        checks.matches_missing_gameVersion === 0,
    };

    writeReport(report);

    console.log('--- Local Data Completeness Check ---');
    for (const [k, v] of Object.entries(tableCounts)) {
      console.log(`count_${k}=${v}`);
    }
    for (const [k, v] of Object.entries(checks)) {
      console.log(`${k}=${v}`);
    }
    console.log(`result=${report.pass ? 'PASS' : 'FAIL'}`);

    if (!report.pass) {
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

main();
