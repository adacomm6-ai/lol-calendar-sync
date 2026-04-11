const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkIGStats() {
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { match: { teamAId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' }, teamAStats: { contains: 'Flandre' } },
                { match: { teamBId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' }, teamBStats: { contains: 'Flandre' } },
                { blueSideTeamId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a', analysisData: { contains: 'Flandre' } },
                { redSideTeamId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a', analysisData: { contains: 'Flandre' } }
            ]
        },
        include: { match: true }
    });

    console.log(`Found ${games.length} games where IG explicitly contains Flandre in their assigned stats.`);
    for (const game of games) {
        console.log(game.id, game.matchId);
    }
}

checkIGStats().catch(console.error).finally(() => prisma.$disconnect());
