
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matchId = 'e3398c79-79cb-4e1d-96b9-047a12703666';
    const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { games: true }
    });

    if (!match) {
        console.log('Match not found');
        return;
    }

    console.log(`Fixing rosters for Match ${matchId}...`);

    for (const game of match.games) {
        let statsA, statsB;
        try {
            statsA = JSON.parse(game.teamAStats);
            statsB = JSON.parse(game.teamBStats);
        } catch (e) {
            console.log(`Game ${game.gameNumber}: Error parsing stats, skipping.`);
            continue;
        }

        if (statsA.length < 5 || statsB.length < 5) {
            console.log(`Game ${game.gameNumber}: Insufficient players, skipping.`);
            continue;
        }

        // Swap ENTIRE Team A and Team B stats
        // because Team A is IG but statsA contains TES players
        // and Team B is TES but statsB contains IG players
        console.log(`Game ${game.gameNumber}: Swapping ENTIRE Team A and Team B stats...`);

        // Perform Swap
        const tempStats = statsA;
        statsA = statsB;
        statsB = tempStats;

        // Save back
        await prisma.game.update({
            where: { id: game.id },
            data: {
                teamAStats: JSON.stringify(statsA),
                teamBStats: JSON.stringify(statsB)
            }
        });
    }
    console.log('Fix complete.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
