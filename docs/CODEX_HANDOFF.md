# Codex Handoff Runbook

## Goal
Use this project as a local standalone environment with full data mirrored from cloud.

## Quick Start
1. `npm install`
2. `npm run prepare:local`
3. `npm run check:local:data`
4. `npm run dev:local` (or `start_local_portable.bat`)

## Full Refresh Workflow (Cloud -> Local)
1. `npm run sync:cloud-to-local:full`
2. `npm run check:local:data`
3. `npm run check:cloud-local:consistency`
4. `npm run build`

## Packaging Workflow
1. Ensure checks/build pass.
2. Run `npm run package:local-transfer`.
3. Deliver both outputs:
   - `LoLDataSystem_Source_YYYYMMDD-HHMMSS.zip`
   - `LoLDataSystem_Ready_YYYYMMDD-HHMMSS.zip`
4. Share `docs/transfer-manifest.md` with the package.

## Validation Targets
- Data checks:
  - unknown players = 0
  - finished matches missing winner = 0
  - finished matches missing games = 0
  - matches missing gameVersion = 0
- Count consistency across key tables:
  - Team, Player, Match, Game, Comment, TeamComment, Odds, Hero, GameVersionRule

## Notes
- Default operation must stay local-only.
- Cloud scripts in this flow are read-only.
