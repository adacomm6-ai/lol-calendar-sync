const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkGame() {
    const game = await prisma.game.findUnique({
        where: { id: '0f995edd-6b54-455a-8586-2822befc25e4' },
        include: { match: { include: { teamA: true, teamB: true } } }
    });

    console.log(`TeamA (${game.match.teamA.name}) Stats:`, JSON.parse(game.teamAStats).map(p => p.name));
    console.log(`TeamB (${game.match.teamB.name}) Stats:`, JSON.parse(game.teamBStats).map(p => p.name));
}

checkGame().catch(console.error).finally(() => prisma.$disconnect());
