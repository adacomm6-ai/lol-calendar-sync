const { Client } = require('pg');
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    const res = await client.query('SELECT COUNT(*) FROM "Player" WHERE role = \'UNKNOWN\'');
    console.log('--- Cloud Postgres Status ---');
    console.log('Total players with UNKNOWN role:', res.rows[0].count);

    const teamsWithUnknown = await client.query(`
        SELECT t.name, COUNT(p.id) as count
        FROM "Player" p
        JOIN "Team" t ON p."teamId" = t.id
        WHERE p.role = 'UNKNOWN'
        GROUP BY t.name
        ORDER BY count DESC
    `);

    console.log('Number of teams with UNKNOWN players:', teamsWithUnknown.rowCount);
    console.log('Top teams with most UNKNOWN players:');
    console.table(teamsWithUnknown.rows.slice(0, 10));

    await client.end();
}

main().catch(console.error);
