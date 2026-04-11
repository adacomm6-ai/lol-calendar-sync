const { Client } = require('pg');
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    const teamRes = await client.query('SELECT id, name FROM "Team" WHERE name = \'FURIA\'');
    if (teamRes.rows.length === 0) {
        console.log('FURIA not found');
        await client.end();
        return;
    }

    const furiaId = teamRes.rows[0].id;
    console.log(`FURIA ID: ${furiaId}`);

    const playerRes = await client.query('SELECT name, role FROM "Player" WHERE "teamId" = $1', [furiaId]);
    console.log('FURIA Players:');
    console.table(playerRes.rows);

    await client.end();
}

main().catch(console.error);
