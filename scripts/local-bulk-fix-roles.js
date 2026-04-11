const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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
        limit: "50"
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
    // 1. Get mapping using exact filter for various "unknown" states
    const allPlayers = await prisma.player.findMany({
        include: { team: true }
    });

    const unknownPlayers = allPlayers.filter(p => !p.role || p.role.trim().toUpperCase() === 'UNKNOWN');

    const teams = {};
    unknownPlayers.forEach(p => {
        if (!p.team) return; // safety check
        if (!teams[p.team.name]) teams[p.team.name] = { id: p.teamId, players: [] };
        teams[p.team.name].players.push(p.name);
    });

    console.log(`Processing ${Object.keys(teams).length} teams locally covering ${unknownPlayers.length} players...`);

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
                if (role.toUpperCase() === 'BOT') role = 'ADC'; // Normalize to ADC
                role = role.toUpperCase(); // Ensure standard casing

                console.log(`   [MATCH] ${playerName} -> ${role}`);

                await prisma.player.updateMany({
                    where: { name: playerName, teamId: data.id },
                    data: { role: role }
                });
            } else {
                console.log(`   [SKIP]  ${playerName} (Not found in recent games on LP)`);
            }
        }

        // Anti-rate limit
        await new Promise(r => setTimeout(r, 600));
    }

    console.log('\nLocal Bulk fix completed.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
