const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchRoleByPlayerName(playerName) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP",
        fields: "SP.Role",
        where: `SP.Name='${playerName.replace(/'/g, "\\'")}' OR SP.Link='${playerName.replace(/'/g, "\\'")}'`,
        order_by: "SP.DateTime_UTC DESC",
        limit: "1"
    });

    try {
        const res = await fetch(`${ENDPOINT}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = await res.json();
        if (data.cargoquery && data.cargoquery.length > 0) {
            return data.cargoquery[0].title.Role.toUpperCase();
        }

        // Try fallback with exact Title search across Players table if Scoreboard is empty
        const params2 = new URLSearchParams({
            action: "cargoquery",
            format: "json",
            tables: "Players=P",
            fields: "P.Role",
            where: `P.ID='${playerName.replace(/'/g, "\\'")}' OR P.Name='${playerName.replace(/'/g, "\\'")}'`,
            limit: "1"
        });
        const res2 = await fetch(`${ENDPOINT}?${params2.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data2 = await res2.json();

        if (data2.cargoquery && data2.cargoquery.length > 0) {
            return data2.cargoquery[0].title.Role.toUpperCase();
        }

        return null;
    } catch (e) {
        console.error(`Error fetching for ${playerName}:`, e.message);
        return null;
    }
}

async function main() {
    const allPlayers = await prisma.player.findMany({
        include: { team: true }
    });

    const unknownPlayers = allPlayers.filter(p => !p.role || p.role.trim().toUpperCase() === 'UNKNOWN');

    console.log(`Found ${unknownPlayers.length} players with UNKNOWN role. Starting deeper fallback queries...`);

    let fixCount = 0;
    for (const player of unknownPlayers) {
        let role = await fetchRoleByPlayerName(player.name);

        if (role) {
            if (role === 'BOT') role = 'ADC'; // Normalize
            console.log(`[FIXED]  ${player.name} (${player.team.name}) -> ${role}`);

            await prisma.player.updateMany({
                where: { name: player.name, teamId: player.teamId },
                data: { role: role }
            });
            fixCount++;
        } else {
            console.log(`[FAILED] ${player.name} (${player.team.name}) -> STILL UNKNOWN`);
        }

        // Anti-rate limit
        await new Promise(r => setTimeout(r, 600));
    }

    console.log(`\nLocal Deeper Bulk fix completed. Fixed ${fixCount}/${unknownPlayers.length} players.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
