const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbFile = path.join(process.cwd(), 'prisma', 'dev.db');
if (!fs.existsSync(dbFile)) {
  console.log('[local-player-migrate] dev.db not found, skip.');
  process.exit(0);
}

function hasTable(db, table) {
  const row = db.prepare("select name from sqlite_master where type='table' and name=?").get(table);
  return !!row;
}

const db = new DatabaseSync(dbFile);
try {
  if (!hasTable(db, 'Player')) {
    console.log('[local-player-migrate] Player table not found, skip.');
    process.exit(0);
  }

  const playerCols = db.prepare('pragma table_info("Player")').all().map((r) => r.name);
  const isNewShape = playerCols.includes('role') && playerCols.includes('teamId') && playerCols.includes('split');
  if (isNewShape) {
    console.log('[local-player-migrate] Player table already in direct model shape, skip.');
    process.exit(0);
  }

  if (!hasTable(db, 'PlayerRegistry')) {
    throw new Error('Player table is old shape but PlayerRegistry is missing. Cannot migrate safely.');
  }

  const dangling = db
    .prepare('select count(*) as c from "Player" p left join "PlayerRegistry" r on r.playerId = p.id where r.id is null')
    .get().c;
  if (dangling > 0) {
    throw new Error(`Found ${dangling} Player rows without PlayerRegistry mapping. Migration aborted.`);
  }

  const backupPath = path.join(
    process.cwd(),
    'prisma',
    `dev.before-player-direct.${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  );
  fs.copyFileSync(dbFile, backupPath);
  console.log(`[local-player-migrate] Backup created: ${backupPath}`);

  db.exec('PRAGMA foreign_keys=OFF;');
  db.exec('BEGIN;');

  db.exec('ALTER TABLE "Player" RENAME TO "Player_legacy";');

  db.exec(`
    CREATE TABLE "Player_new" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "split" TEXT NOT NULL DEFAULT 'Split 1',
      "teamId" TEXT NOT NULL,
      "photo" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);

  db.exec(`
    WITH base AS (
      SELECT
        r.id AS rid,
        p.name AS name,
        COALESCE(NULLIF(r.role, ''), 'UNKNOWN') AS role,
        COALESCE(NULLIF(r.split, ''), 'Split 1') AS split,
        r.teamId AS teamId,
        p.photo AS photo,
        COALESCE(r.createdAt, p.createdAt, CURRENT_TIMESTAMP) AS createdAt,
        COALESCE(r.updatedAt, p.updatedAt, CURRENT_TIMESTAMP) AS updatedAt,
        CASE WHEN r.isCurrent IN (1, '1', 'true', 'TRUE') THEN 1 ELSE 0 END AS currentFlag
      FROM "PlayerRegistry" r
      INNER JOIN "Player_legacy" p ON p.id = r.playerId
    ),
    dedup AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY lower(name), teamId
          ORDER BY currentFlag DESC, updatedAt DESC, createdAt DESC, rid DESC
        ) AS rn
      FROM base
    )
    INSERT INTO "Player_new" (id, name, role, split, teamId, photo, createdAt, updatedAt)
    SELECT rid, name, role, split, teamId, photo, createdAt, updatedAt
    FROM dedup
    WHERE rn = 1;
  `);

  db.exec('DROP TABLE "PlayerRegistry";');
  db.exec('DROP TABLE "Player_legacy";');
  db.exec('ALTER TABLE "Player_new" RENAME TO "Player";');
  db.exec('CREATE UNIQUE INDEX "Player_name_teamId_key" ON "Player"("name", "teamId");');

  db.exec('COMMIT;');
  db.exec('PRAGMA foreign_keys=ON;');

  const migratedCount = db.prepare('select count(*) as c from "Player"').get().c;
  console.log(`[local-player-migrate] Migration completed. Player rows: ${migratedCount}`);
} catch (error) {
  try {
    db.exec('ROLLBACK;');
  } catch {}
  db.exec('PRAGMA foreign_keys=ON;');
  console.error('[local-player-migrate] ERROR:', error.message || String(error));
  process.exit(1);
} finally {
  db.close();
}
