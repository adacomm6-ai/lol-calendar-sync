require('dotenv').config();
const { Client } = require('pg');

function resolveCloudUrl() {
  const raw = process.env.CLOUD_DATABASE_URL || process.env.CLOUD_DIRECT_URL || process.env.DIRECT_URL || '';
  return raw.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
}

async function main() {
  const cloudUrl = resolveCloudUrl();
  if (!cloudUrl) {
    throw new Error('Missing CLOUD_DATABASE_URL/CLOUD_DIRECT_URL/DIRECT_URL.');
  }

  const client = new Client({
    connectionString: cloudUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const stale = await client.query(`
    SELECT pid, now() - xact_start AS tx_age
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND usename = current_user
      AND state = 'idle in transaction'
      AND xact_start IS NOT NULL
      AND now() - xact_start > interval '5 minutes'
    ORDER BY xact_start ASC
  `);

  console.log('--- Cloud Preflight Maintenance ---');
  console.log('stale idle-in-transaction sessions:', stale.rowCount);

  let terminated = 0;
  for (const row of stale.rows) {
    const result = await client.query('SELECT pg_terminate_backend($1) AS terminated', [row.pid]);
    if (result.rows[0] && result.rows[0].terminated) {
      terminated++;
      console.log(`terminated pid=${row.pid}`);
    }
  }

  console.log(`terminated sessions: ${terminated}`);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
