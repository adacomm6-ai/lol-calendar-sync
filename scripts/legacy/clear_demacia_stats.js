
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function main() {
    console.log('Clearing stats for Demacia Cup matches...');

    const matches = await prisma.match.findMany({
        where: {
            OR: [
                { tournament: { contains: 'Demacia' } },
                { tournament: { contains: '德玛西亚' } }
            ]
        },
        include: { games: true }
    });

    if (matches.length === 0) {
        console.log('No Demacia Cup matches found.');
        return;
    }

    console.log(`Found ${matches.length} Demacia Cup matches.`);
    let gameCount = 0;

    for (const match of matches) {
        console.log(`Processing Match: ${match.id} (${match.tournament})`);

        // Reset stats for all games in this match
        const result = await prisma.game.updateMany({
            where: {
                matchId: match.id
            },
            data: {
                teamAStats: '[]', // Empty JSON array
                teamBStats: '[]', // Empty JSON array
                analysisData: null,
                totalKills: null,
                blueKills: null,
                redKills: null
            }
        });
        gameCount += result.count;
    }

    console.log(`Successfully cleared stats for ${gameCount} games.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
