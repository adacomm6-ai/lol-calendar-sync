const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const game = await prisma.game.findUnique({ where: { id: '0f995edd-6b54-455a-8586-2822befc25e4' } });
    console.log(game.analysisData);
}
run().finally(() => prisma.$disconnect());
