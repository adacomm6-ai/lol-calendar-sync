const { Client } = require('pg');
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    console.log('--- Teams with UNKNOWN Roles ---');
    const res = await client.query('SELECT "teamId", COUNT(*) as count FROM "Player" WHERE role = \'UNKNOWN\' GROUP BY "teamId" ORDER BY count DESC');
    console.table(res.rows);

    await client.end();
}

main().catch(console.error);
