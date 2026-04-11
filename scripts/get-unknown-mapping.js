const { Client } = require('pg');
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    // Get all players with UNKNOWN role along with their team names
    const res = await client.query(`
        SELECT p.name as player_name, p."teamId", t.name as team_name
        FROM "Player" p
        JOIN "Team" t ON p."teamId" = t.id
        WHERE p.role = 'UNKNOWN'
    `);

    console.log('Total players to fix:', res.rowCount);

    const teamGroups = {};
    res.rows.forEach(row => {
        if (!teamGroups[row.team_name]) teamGroups[row.team_name] = [];
        teamGroups[row.team_name].push(row.player_name);
    });

    console.log('Teams affected:', Object.keys(teamGroups).length);
    console.log(JSON.stringify(teamGroups, null, 2));

    await client.end();
}

main().catch(console.error);
