const { Client } = require('pg');

const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';
const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchLpRoles(teamName) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP, ScoreboardGames=SG",
        join_on: "SP.GameId=SG.GameId",
        fields: "SP.Name, SP.Role, SG.DateTime_UTC",
        where: `(SG.Team1='${teamName.replace(/'/g, "\\'")}' OR SG.Team2='${teamName.replace(/'/g, "\\'")}') AND SP.Team='${teamName.replace(/'/g, "\\'")}'`,
        order_by: "SG.DateTime_UTC DESC",
        limit: "20"
    });

    try {
        const res = await fetch(`${ENDPOINT}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = await res.json();
        if (!data.cargoquery) return {};

        const roles = {};
        data.cargoquery.forEach(item => {
            const { Name, Role } = item.title;
            if (!roles[Name]) {
                roles[Name] = Role.toUpperCase();
            }
        });
        return roles;
    } catch (e) {
        console.error(`Error fetching for ${teamName}:`, e.message);
        return {};
    }
}

async function main() {
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    // 1. Get mapping
    const res = await client.query(`
        SELECT p.name as player_name, p."teamId", t.name as team_name
        FROM "Player" p
        JOIN "Team" t ON p."teamId" = t.id
        WHERE p.role = 'UNKNOWN'
    `);

    const teams = {};
    res.rows.forEach(row => {
        if (!teams[row.team_name]) teams[row.team_name] = { id: row.teamId, players: [] };
        teams[row.team_name].players.push(row.player_name);
    });

    console.log(`Processing ${Object.keys(teams).length} teams...`);

    for (const [teamName, data] of Object.entries(teams)) {
        console.log(`\n--- Team: ${teamName} ---`);
        const lpRoles = await fetchLpRoles(teamName);

        for (const playerName of data.players) {
            let role = lpRoles[playerName];

            // Fallback for case sensitivity or minor name mismatches in API
            if (!role) {
                // Try case-insensitive search in the keys we got
                const key = Object.keys(lpRoles).find(k => k.toLowerCase() === playerName.toLowerCase());
                if (key) role = lpRoles[key];
            }

            if (role) {
                console.log(`   [MATCH] ${playerName} -> ${role}`);
                await client.query(
                    'UPDATE "Player" SET role = $1 WHERE name = $2 AND "teamId" = $3',
                    [role, playerName, data.id]
                );
            } else {
                console.log(`   [SKIP]  ${playerName} (Not found in recent games)`);
            }
        }

        // Anti-rate limit
        await new Promise(r => setTimeout(r, 500));
    }

    await client.end();
    console.log('\nBulk fix completed.');
}

main().catch(console.error);
