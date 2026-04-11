
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Searching for recent finished match between IG and TES...");

    // Find the specific match that is FINISHED and has 4 games (as identified in debug step)
    const match = await prisma.match.findFirst({
        where: {
            AND: [
                {
                    OR: [
                        { teamA: { name: { contains: 'Invictus' } } },
                        { teamA: { name: { contains: 'Top' } } }
                    ]
                },
                {
                    OR: [
                        { teamB: { name: { contains: 'Invictus' } } },
                        { teamB: { name: { contains: 'Top' } } }
                    ]
                },
                { status: 'FINISHED' }
            ]
        },
        include: { games: true }
    });

    if (!match) {
        console.log("Match not found.");
        return;
    }

    console.log(`Found match: ${match.id} with ${match.games.length} games.`);
    console.log(`Current Game Numbers: ${match.games.map(g => g.gameNumber).join(', ')}`);

    // Sort by creation time to preserve order
    const sortedGames = match.games.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    console.log("Renumbering games...");

    for (let i = 0; i < sortedGames.length; i++) {
        const game = sortedGames[i];
        const newNumber = i + 1;

        console.log(`Game ID ${game.id}: ${game.gameNumber} -> ${newNumber}`);

        await prisma.game.update({
            where: { id: game.id },
            data: { gameNumber: newNumber }
        });
    }

    console.log("Renumbering complete.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
