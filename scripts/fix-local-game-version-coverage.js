const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const db = new DatabaseSync(dbPath);

const KNOWN_REGIONS = ['LPL', 'LCK', 'LEC', 'LCS', 'PCS', 'VCS', 'CBLOL', 'LJL', 'LLA'];

function normalizeRegion(value) {
  return (value || '').trim().toUpperCase() || 'GLOBAL';
}

function inferMatchRegion(tournament, teamARegion, teamBRegion) {
  const combined = [tournament, teamARegion, teamBRegion].filter(Boolean).join(' ').toUpperCase();
  for (const region of KNOWN_REGIONS) {
    if (combined.includes(region)) return region;
  }
  return 'GLOBAL';
}

function pickRule(rules, ts) {
  // Strict hit first
  let hit = rules.find((r) => r.effectiveFrom <= ts && (r.effectiveTo == null || r.effectiveTo >= ts));
  if (hit) return hit;
  // Fallback: nearest previous rule
  hit = rules.find((r) => r.effectiveFrom <= ts);
  if (hit) return hit;
  // Fallback: earliest rule
  return rules[rules.length - 1] || null;
}

try {
  db.exec('BEGIN;');

  const regions = db.prepare('select distinct region from "GameVersionRule"').all().map((r) => normalizeRegion(r.region));

  // Ensure the newest rule in each region stays open-ended for future matches.
  for (const region of regions) {
    const latest = db.prepare('select id, effectiveTo from "GameVersionRule" where region=? order by effectiveFrom desc limit 1').get(region);
    if (latest && latest.effectiveTo != null) {
      db.prepare('update "GameVersionRule" set effectiveTo=null, updatedAt=CURRENT_TIMESTAMP where id=?').run(latest.id);
    }
  }

  const rulesRows = db
    .prepare('select id, region, version, effectiveFrom, effectiveTo from "GameVersionRule" order by region asc, effectiveFrom desc')
    .all();

  const rulesByRegion = new Map();
  for (const row of rulesRows) {
    const region = normalizeRegion(row.region);
    if (!rulesByRegion.has(region)) rulesByRegion.set(region, []);
    rulesByRegion.get(region).push(row);
  }

  const teamRows = db.prepare('select id, region from "Team"').all();
  const teamRegionById = new Map(teamRows.map((t) => [t.id, t.region || '']));

  const missingMatches = db
    .prepare('select id, tournament, startTime, teamAId, teamBId from "Match" where gameVersion is null or trim(gameVersion)=\'\' order by startTime asc')
    .all();

  let updated = 0;
  for (const m of missingMatches) {
    const ts = Number(m.startTime);
    if (!Number.isFinite(ts)) continue;

    const teamARegion = teamRegionById.get(m.teamAId) || '';
    const teamBRegion = teamRegionById.get(m.teamBId) || '';
    const inferred = inferMatchRegion(m.tournament, teamARegion, teamBRegion);

    const regionalRules = rulesByRegion.get(inferred) || [];
    const globalRules = rulesByRegion.get('GLOBAL') || [];

    const regionalHit = inferred !== 'GLOBAL' ? pickRule(regionalRules, ts) : null;
    const globalHit = pickRule(globalRules, ts);
    const rule = regionalHit || globalHit;

    if (!rule || !rule.version) continue;

    db.prepare('update "Match" set gameVersion=?, updatedAt=CURRENT_TIMESTAMP where id=?').run(rule.version, m.id);
    updated += 1;
  }

  const remain = db.prepare('select count(*) as c from "Match" where gameVersion is null or trim(gameVersion)=\'\'').get().c;

  db.exec('COMMIT;');
  console.log(`[local-game-version-fix] updated=${updated} remaining=${remain}`);
} catch (e) {
  try { db.exec('ROLLBACK;'); } catch {}
  console.error('[local-game-version-fix] ERROR:', e.message || String(e));
  process.exit(1);
} finally {
  db.close();
}
