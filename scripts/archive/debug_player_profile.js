
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Searching for player XIAOXU...");
    // Find player loosely
    console.log("Searching for ALL players named XIAOXU...");
    const players = await prisma.player.findMany({
        where: { name: { contains: 'XIAOXU' } },
        include: { team: true }
    });

    if (players.length === 0) {
        console.log("No players found!");
        return;
    }

    // Pick the one that is likely the 'Demacia Cup' one (2026 Season Cup)
    // But list all first
    for (const p of players) {
        console.log(`\nPlayer: ${p.name} (ID: ${p.id})`);
        console.log(`  Team: ${p.team.name} (ID: ${p.teamId})`);
        console.log(`  Split: ${p.split}`);

        // Search matches for THIS player's team
        const games = await prisma.game.findMany({
            where: {
                OR: [
                    { match: { teamAId: p.teamId } },
                    { match: { teamBId: p.teamId } }
                ]
            },
            take: 1
        });
        console.log(`  Games found for Team ${p.teamId}: ${games.length}`);
    }

    console.log("\nSearching for recent matches for this team...");
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { match: { teamAId: player.teamId } },
                { match: { teamBId: player.teamId } }
            ]
        },
        include: {
            match: { include: { teamA: true, teamB: true } }
        },
        orderBy: { match: { startTime: 'desc' } },
        take: 5
    });

    console.log(`Found ${games.length} games.`);

    for (const game of games) {
        console.log(`\nGame ID: ${game.id}`);
        console.log(`Match: ${game.match.teamA.name} vs ${game.match.teamB.name}`);
        console.log(`Tournament: ${game.match.tournament}`);

        if (!game.analysisData) {
            console.log("  No analysisData present.");
            continue;
        }

        try {
            const data = JSON.parse(game.analysisData);
            console.log("  Players in analysisData:");

            // Extract players from new or old structure
            let players = [];
            if (data.damage_data) {
                players = data.damage_data.map(d => d.player || d.player_name || d.name);
            } else if (data.teamA?.players) {
                players = [...data.teamA.players, ...data.teamB.players].map(p => p.name);
            }

            console.log("    " + players.join(", "));

            const normalize = (str) => str?.toLowerCase().replace(/\s+/g, '') || '';
            const pNameNorm = normalize(player.name);
            const match = players.find(p => normalize(p) === pNameNorm);

            console.log(`  Match Result for '${player.name}': ${match ? 'MATCHED (' + match + ')' : 'NO MATCH'}`);

        } catch (e) {
            console.log("  Error parsing analysisData:", e.message);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
