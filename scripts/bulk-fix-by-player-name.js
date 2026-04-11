const { Client } = require('pg');

const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';
const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchPlayerLatestRole(playerName) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP",
        fields: "SP.Role, SP.DateTime_UTC",
        where: `SP.Name='${playerName.replace(/'/g, "\\'")}'`,
        order_by: "SP.DateTime_UTC DESC",
        limit: "1"
    });

    try {
        const res = await fetch(`${ENDPOINT}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = await res.json();
        if (!data.cargoquery || data.cargoquery.length === 0) return null;
        return data.cargoquery[0].title.Role.toUpperCase();
    } catch (e) {
        console.error(`Error fetching for player ${playerName}:`, e.message);
        return null;
    }
}

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    // 1. Get all unknown players
    const res = await client.query('SELECT name, "teamId" FROM "Player" WHERE role = \'UNKNOWN\'');
    const players = res.rows;
    console.log(`Total unknown players to process: ${players.length}`);

    let fixed = 0;
    for (const p of players) {
        process.stdout.write(`Checking ${p.name}... `);
        const role = await fetchPlayerLatestRole(p.name);
        if (role) {
            console.log(`Matched: ${role}`);
            await client.query(
                'UPDATE "Player" SET role = $1 WHERE name = $2 AND "teamId" = $3',
                [role, p.name, p.teamId]
            );
            fixed++;
        } else {
            console.log(`Not found.`);
        }

        // Sleep to avoid rate limit
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\nFixed ${fixed}/${players.length} players.`);
    await client.end();
}

main().catch(console.error);
