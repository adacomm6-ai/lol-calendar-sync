# AGENTS.md

## Project Purpose
- LoL data platform with Next.js frontend + Node scripts + Prisma.
- This handoff package is intended for **local standalone usage** on another computer.

## Non-Negotiable Runtime Rule
- Always run in local mode unless explicitly asked otherwise.
- Local mode must use SQLite at `prisma/dev.db`.
- Do not run cloud write scripts during local validation.

## Working Directories
- Frontend/backend app code: `src/`
- Prisma schemas and local DB: `prisma/`
- Utility scripts: `scripts/`
- Operational docs and reports: `docs/`

## Standard Commands
- Prepare local DB/client:
  - `npm run prepare:local`
- Full sync cloud -> local (read-only cloud, full replace local):
  - `npm run sync:cloud-to-local:full`
- Local data integrity check:
  - `npm run check:local:data`
- Cloud/local count consistency check:
  - `npm run check:cloud-local:consistency`
- Build validation:
  - `npm run build`
- Local development:
  - `npm run dev:local`
  - or `start_local_portable.bat`
- Generate transfer packages:
  - `npm run package:local-transfer`

## Safety Rules
- Before full local overwrite, ensure local DB backup exists in `backups/local-db/`.
- Cloud access in this workflow is read-only for export/consistency checks.
- Keep `.env` protected when transferring packages.

## Common Issues
- Prisma engine lock on Windows (`query_engine-windows.dll.node` EPERM):
  - close running dev server/processes using Prisma, then retry.
- Wrong DB target:
  - verify `APP_DB_TARGET=local` and `DATABASE_URL=file:./prisma/dev.db`.
- Build vs local Prisma schema mismatch:
  - run `npm run prepare:local` before local checks.
