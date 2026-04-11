const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkGameExt() {
    const game = await prisma.game.findUnique({ where: { id: '0f995edd-6b54-455a-8586-2822befc25e4' } });
    console.log(game.teamAStats?.includes('Flandre'));
    console.log(game.teamBStats?.includes('Flandre'));
    console.log(game.analysisData?.includes('Flandre'));
}
checkGameExt().catch(console.error).finally(() => prisma.$disconnect());
