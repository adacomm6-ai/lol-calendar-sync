# Local / Cloud Isolation Workflow

## Goal
- Local development uses only local DB and local data.
- Cloud site uses only cloud DB and cloud data.
- Local testing and fixes must not affect cloud production data.

## Runtime Rules
- `APP_DB_TARGET=local` (or unset in development): use `DATABASE_URL` only.
- `APP_DB_TARGET=cloud`: force cloud DB (`CLOUD_DATABASE_URL` preferred, fallback `DATABASE_URL` if postgres).
- Production: prefer postgres `DATABASE_URL`, fallback `CLOUD_DATABASE_URL`.

Implemented in: `src/lib/db.ts`.

## Prisma Schemas
- Cloud schema: `prisma/schema.prisma` (PostgreSQL)
- Local schema: `prisma/schema.local.prisma` (SQLite)

## Commands
- Local dev (safe default):
  - `npm run dev`
  - or `npm run dev:local`
- Cloud-mode dev (for cloud verification only):
  - `npm run dev:cloud`
- Local prepare (migration + generate + db push):
  - `npm run prepare:local`
- Local game-version backfill/fix:
  - `npm run fix:local:game-version`
- Cloud prepare (generate cloud client):
  - `npm run prepare:cloud`

## Release Flow (Recommended)
1. Local mode development and regression tests (`npm run dev:local`).
2. Feature complete and verified locally.
3. Commit / PR review.
4. Cloud deploy (build runs `prepare:cloud` automatically).
5. Post-deploy smoke test on cloud URLs.

## Note
- Local migration script: `scripts/migrate-local-player-model.js`
  - Runs only when local `Player` table is in old `PlayerRegistry` shape.
  - Creates a timestamped backup in `prisma/` before migration.
