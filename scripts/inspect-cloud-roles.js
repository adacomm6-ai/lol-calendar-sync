const { Client } = require('pg');
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();
    const res = await client.query('SELECT DISTINCT role FROM "Player"');
    console.log('Distinct Roles in Cloud DB:');
    console.table(res.rows);
    await client.end();
}

main().catch(console.error);
