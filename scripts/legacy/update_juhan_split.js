
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateJuhan() {
    const player = await prisma.player.findFirst({
        where: { name: { contains: 'Juhan', mode: 'insensitive' } }
    });

    if (!player) {
        console.log("Juhan not found");
        return;
    }

    console.log(`Updating Juhan (${player.name}) from "${player.split}" to "2026 LPL第一赛段"...`);

    await prisma.player.update({
        where: { id: player.id },
        data: { split: '2026 LPL第一赛段' }
    });

    console.log("Done.");
}

updateJuhan()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
