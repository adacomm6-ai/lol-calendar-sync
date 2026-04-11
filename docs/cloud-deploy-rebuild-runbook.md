# Cloud Rebuild And Deploy Runbook

Last updated: 2026-03-08

## 1. Scope

This runbook is for deploying local changes to cloud after the player schema refactor (`Player + PlayerRegistry`) and avoiding destructive one-click rebuild mistakes.

## 2. Required Environment Variables

Set at least one of the following to a **PostgreSQL** cloud URL:

- `CLOUD_DATABASE_URL` (recommended)
- `CLOUD_DIRECT_URL`
- `DIRECT_URL`

Notes:

- Local `DATABASE_URL=file:./dev.db` is for SQLite only.
- Cloud sync and schema push now reject non-Postgres URLs.

## 3. Local Preflight (must pass)

```bash
npm run lint
npx tsc --noEmit
npm run build
node scripts/diagnose_data.mts
```

Expected:

- No TypeScript errors
- Build succeeds
- Diagnostics end with `[PASS]`

## 4. Safe Deploy Flow

Preferred script:

```bash
force_deploy.bat
```

What it does now:

- Creates a safety backup
- Stages + commits changes
- Pushes to `origin/main` (optionally `--force-with-lease` only if you confirm)
- Runs cloud schema sync in safe mode (`scripts/push_schema.js`)

What it no longer does:

- Does **not** delete `.git`
- Does **not** auto-force push by default
- Does **not** mutate `schema.prisma` provider during deploy

## 5. Cloud Schema Sync Rules

Default safe sync:

```bash
node scripts/push_schema.js
```

Dangerous mode (manual override only):

```bash
node scripts/push_schema.js --allow-data-loss
```

Use `--allow-data-loss` only when all conditions are true:

- You have a verified cloud backup
- You have a maintenance window
- You explicitly accept destructive changes

## 6. Legacy Rebuild Or Data Migration

If cloud schema is still legacy and cannot be migrated in place:

1. Export snapshot from legacy cloud schema.
2. Transform snapshot to new model (`PlayerRegistry`).
3. Import into new schema.
4. Re-run diagnostics and compare table counts.

Never run drop-table scripts directly in production without backup + maintenance approval.

## 7. Post-Deploy Validation

- Open app health pages and key admin pages
- Run read-only cloud checks
- Confirm `PlayerRegistry` records are present and player pages resolve current team/role correctly

## 8. Fast Rollback

If deploy is bad:

1. Roll back application code to previous known-good commit
2. Restore cloud data from latest verified backup
3. Re-run preflight and post-deploy checks before reopening writes
