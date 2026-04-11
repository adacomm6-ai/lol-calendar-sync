const { Client } = require('pg');

const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';
const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchTeamGamePlayers(teamName) {
    // 1. Get latest game ID for this team
    const params1 = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        fields: "SG.GameId, SG.DateTime_UTC",
        where: `SG.Team1='${teamName.replace(/'/g, "\\'")}' OR SG.Team2='${teamName.replace(/'/g, "\\'")}'`,
        order_by: "SG.DateTime_UTC DESC",
        limit: "1"
    });

    try {
        const res1 = await fetch(`${ENDPOINT}?${params1.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data1 = await res1.json();
        if (!data1.cargoquery || data1.cargoquery.length === 0) return null;

        const gameId = data1.cargoquery[0].title.GameId;

        // 2. Fetch all players for that specific game and team
        const params2 = new URLSearchParams({
            action: "cargoquery",
            format: "json",
            tables: "ScoreboardPlayers=SP",
            fields: "SP.Name, SP.Role, SP.Link",
            where: `SP.GameId='${gameId}' AND SP.Team='${teamName.replace(/'/g, "\\'")}'`,
            limit: "10"
        });

        const res2 = await fetch(`${ENDPOINT}?${params2.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data2 = await res2.json();
        if (!data2.cargoquery) return null;

        const mapping = {};
        data2.cargoquery.forEach(item => {
            const { Name, Role, Link } = item.title;
            // Map by Name (Nickname)
            mapping[Name.toLowerCase()] = Role.toUpperCase();
            // Map by Link (Often matches our Name better)
            if (Link) mapping[Link.toLowerCase()] = Role.toUpperCase();
        });
        return mapping;
    } catch (e) {
        console.error(`Error for ${teamName}:`, e.message);
        return null;
    }
}

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    // 1. Get all teams with UNKNOWN players
    const teamRes = await client.query(`
        SELECT DISTINCT t.name, t.id
        FROM "Player" p
        JOIN "Team" t ON p."teamId" = t.id
        WHERE p.role = 'UNKNOWN'
    `);

    console.log(`Found ${teamRes.rowCount} teams with unknown roles.`);

    for (const team of teamRes.rows) {
        const teamName = team.name;
        console.log(`\n--- Processing: ${teamName} ---`);

        const playerRoles = await fetchTeamGamePlayers(teamName);
        if (!playerRoles) {
            console.log(`   [FAIL] Could not retrieve game data for ${teamName}`);
            continue;
        }

        // 2. Get UNKNOWN players for THIS team
        const playerRes = await client.query(
            'SELECT name FROM "Player" WHERE "teamId" = $1 AND role = \'UNKNOWN\'',
            [team.id]
        );

        for (const player of playerRes.rows) {
            const pName = player.name;
            const role = playerRoles[pName.toLowerCase()];

            if (role) {
                console.log(`   [PATCH] ${pName} -> ${role}`);
                await client.query(
                    'UPDATE "Player" SET role = $1 WHERE name = $2 AND "teamId" = $3',
                    [role, pName, team.id]
                );
            } else {
                console.log(`   [SKIP]  ${pName} (Not in recent game)`);
            }
        }

        await new Promise(r => setTimeout(r, 400));
    }

    await client.end();
    console.log('\nFinal Cloud Roster Fix Completed.');
}

main().catch(console.error);
