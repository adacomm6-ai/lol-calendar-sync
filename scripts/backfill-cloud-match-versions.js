require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const KNOWN_REGIONS = ['LPL', 'LCK', 'LEC', 'LCS', 'PCS', 'VCS', 'CBLOL', 'LJL', 'LLA'];

function normalizeRegion(v) {
  return String(v || '').trim().toUpperCase() || 'GLOBAL';
}

function inferMatchRegion(tournament, teamARegion, teamBRegion) {
  const combined = [tournament, teamARegion, teamBRegion].filter(Boolean).join(' ').toUpperCase();
  for (const r of KNOWN_REGIONS) {
    if (combined.includes(r)) return r;
  }
  return 'GLOBAL';
}

function pickRule(rules, ts) {
  if (!rules.length) return null;
  let hit = rules.find((r) => r.effectiveFrom <= ts && (r.effectiveTo == null || r.effectiveTo >= ts));
  if (hit) return hit;
  hit = rules.find((r) => r.effectiveFrom <= ts);
  if (hit) return hit;
  return rules[rules.length - 1] || null;
}

function toVersionText(version) {
  const raw = String(version || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!m) return raw;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const minorText = major >= 20 ? String(minor).padStart(2, '0') : String(minor);
  return `${major}.${minorText}`;
}

function resolveCloudConnectionString() {
  const raw = process.env.CLOUD_DATABASE_URL || process.env.CLOUD_DIRECT_URL || process.env.DATABASE_URL || '';
  return raw.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
}

(async () => {
  const cs = resolveCloudConnectionString();
  if (!cs || !/^postgres(ql)?:\/\//i.test(cs)) {
    throw new Error('No valid cloud Postgres URL found.');
  }

  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const rulesRows = (await c.query(`
    select id, region, version, "effectiveFrom", "effectiveTo"
    from "GameVersionRule"
    order by region asc, "effectiveFrom" desc
  `)).rows;

  const rulesByRegion = new Map();
  for (const row of rulesRows) {
    const region = normalizeRegion(row.region);
    const normalized = {
      ...row,
      region,
      version: toVersionText(row.version),
      effectiveFrom: row.effectiveFrom ? new Date(row.effectiveFrom).getTime() : null,
      effectiveTo: row.effectiveTo ? new Date(row.effectiveTo).getTime() : null,
    };
    if (!rulesByRegion.has(region)) rulesByRegion.set(region, []);
    rulesByRegion.get(region).push(normalized);
  }

  const missingMatches = (await c.query(`
    select m.id, m.tournament, m."startTime", m."teamAId", m."teamBId", ta.region as "teamARegion", tb.region as "teamBRegion"
    from "Match" m
    left join "Team" ta on ta.id = m."teamAId"
    left join "Team" tb on tb.id = m."teamBId"
    where (m."gameVersion" is null or trim(m."gameVersion") = '')
      and m."startTime" is not null
    order by m."startTime" asc
  `)).rows;

  const backupDir = path.join(process.cwd(), 'backup', 'cloud-fixes');
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `cloud-match-version-backfill-pre-${ts}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ generatedAt: new Date().toISOString(), missingMatches }, null, 2), 'utf8');

  let updated = 0;
  await c.query('BEGIN');
  try {
    for (const m of missingMatches) {
      const st = new Date(m.startTime).getTime();
      if (!Number.isFinite(st)) continue;

      const inferred = inferMatchRegion(m.tournament, m.teamARegion, m.teamBRegion);
      const regionalRules = rulesByRegion.get(inferred) || [];
      const globalRules = rulesByRegion.get('GLOBAL') || [];

      const regionalHit = inferred !== 'GLOBAL' ? pickRule(regionalRules, st) : null;
      const globalHit = pickRule(globalRules, st);
      const rule = regionalHit || globalHit;
      if (!rule || !rule.version) continue;

      await c.query('update "Match" set "gameVersion"=$1, "updatedAt"=now() where id=$2', [rule.version, m.id]);
      updated++;
    }

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  const after = (await c.query('select count(*)::int as c from "Match" where "gameVersion" is null or trim("gameVersion") = \'\'' )).rows[0].c;

  console.log('backup=' + backupPath);
  console.log('rules_count=' + rulesRows.length);
  console.log('missing_before=' + missingMatches.length);
  console.log('updated=' + updated);
  console.log('missing_after=' + after);

  await c.end();
})().catch((e) => {
  console.error('ERR', e.message || String(e));
  process.exit(1);
});
