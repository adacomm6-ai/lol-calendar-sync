# Project Transfer Instructions

This project supports two transfer modes for another Windows machine.

## Prerequisites (Target Machine)
- Windows
- Node.js LTS installed (v20 or v22)
- `node -v` and `npm -v` must work in a new terminal

## Package Commands

### Fast mode (recommended)
```powershell
npm run package:local-transfer
```
- Generates only `LoLDataSystem_Source_YYYYMMDD-HHMMSS.zip`
- Best for speed and smallest package time
- Target machine will auto-install dependencies on first start

### Offline ready mode (slower)
```powershell
npm run package:local-transfer:ready
```
- Generates both:
  - `LoLDataSystem_Source_YYYYMMDD-HHMMSS.zip`
  - `LoLDataSystem_Ready_YYYYMMDD-HHMMSS.zip`
- Ready package includes `node_modules` and is much slower to build

Manifest is generated at:
- `docs/transfer-manifest.md`

## Included Content
- Source and assets: `src`, `public`, `backend`, `scripts`, `docs`, `.agent`
- Prisma and local database: `prisma` (including `prisma/dev.db`)
- Configs and lockfile: `package.json`, `package-lock.json`, TS/Next/PostCSS/ESLint configs
- Runtime files: `.env`, `.env.local_sqlite`, `start_local_portable.bat`, common root `.bat` scripts

## Target Machine Usage

### From source package (fast mode)
1. Unzip package
2. Double-click `start_local_portable.bat`

`start_local_portable.bat` will:
- set local-mode env vars
- check Node/npm availability
- run `npm install` (if `node_modules` is missing)
- run `npm run prepare:local`
- run `npm run dev:local`

### From ready package (offline mode)
1. Unzip package
2. Double-click `start_local_portable.bat`

## Local-Only Safety
Recommended runtime values:
- `APP_DB_TARGET=local`
- `DATABASE_URL=file:./dev.db`

## Troubleshooting
1. `'npm' is not recognized`
- Install Node.js LTS from https://nodejs.org/
- Reopen terminal and verify: `node -v` and `npm -v`

2. Prisma EPERM (`query_engine-windows.dll.node` locked)
- Stop running Node/Next dev processes, then retry.

3. DB not found
- Ensure `prisma/dev.db` exists after unzip.

4. Build/type mismatch after transfer
- Run `npm run prepare:local` before `npm run build`.

