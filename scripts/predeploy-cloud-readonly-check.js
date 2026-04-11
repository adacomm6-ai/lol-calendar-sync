require('dotenv').config();
const { Client } = require('pg');

function resolveConnectionString() {
  const raw = process.env.CLOUD_DATABASE_URL || process.env.CLOUD_DIRECT_URL || process.env.DATABASE_URL || '';
  if (!raw) return '';
  return raw
    .replace(/([?&])sslmode=[^&]*/gi, '$1')
    .replace(/[?&]$/, '');
}

async function queryInt(client, sql) {
  const r = await client.query(sql);
  return Number(r.rows?.[0]?.c || 0);
}

async function main() {
  const cs = resolveConnectionString();
  if (!cs || !/^postgres(ql)?:\/\//i.test(cs)) {
    throw new Error('No valid cloud Postgres URL found in CLOUD_DATABASE_URL/CLOUD_DIRECT_URL/DATABASE_URL.');
  }

  const client = new Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('--- Cloud Readonly Predeploy Check ---');

  const checks = {
    match_table: await queryInt(client, "select count(*)::int as c from information_schema.tables where table_schema='public' and table_name='Match'"),
    game_table: await queryInt(client, "select count(*)::int as c from information_schema.tables where table_schema='public' and table_name='Game'"),
    comment_table: await queryInt(client, "select count(*)::int as c from information_schema.tables where table_schema='public' and table_name='Comment'"),
    teamcomment_table: await queryInt(client, "select count(*)::int as c from information_schema.tables where table_schema='public' and table_name='TeamComment'"),
    hero_table: await queryInt(client, "select count(*)::int as c from information_schema.tables where table_schema='public' and table_name='Hero'"),
    match_gameVersion_col: await queryInt(client, "select count(*)::int as c from information_schema.columns where table_schema='public' and table_name='Match' and column_name='gameVersion'"),
    gameVersionRule_table: await queryInt(client, "select count(*)::int as c from information_schema.tables where table_schema='public' and table_name='GameVersionRule'"),
  };

  for (const [k, v] of Object.entries(checks)) {
    console.log(`${k}=${v}`);
  }

  const counts = {
    rows_match: await queryInt(client, 'select count(*)::int as c from "Match"'),
    rows_game: await queryInt(client, 'select count(*)::int as c from "Game"'),
    rows_comment: await queryInt(client, 'select count(*)::int as c from "Comment"'),
    rows_teamComment: await queryInt(client, 'select count(*)::int as c from "TeamComment"'),
  };

  for (const [k, v] of Object.entries(counts)) {
    console.log(`${k}=${v}`);
  }

  const required = ['match_table', 'game_table', 'comment_table', 'teamcomment_table', 'hero_table', 'match_gameVersion_col', 'gameVersionRule_table'];
  const failed = required.filter((k) => checks[k] < 1);

  await client.end();

  if (failed.length) {
    throw new Error('Missing required cloud schema items: ' + failed.join(', '));
  }

  console.log('result=PASS');
}

main().catch((error) => {
  console.error('result=FAIL');
  console.error(error.message || String(error));
  process.exit(1);
});
