
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addHoya() {
    const team = await prisma.team.findFirst({
        where: { name: 'EDward Gaming' }
    });
    if (!team) throw new Error("EDG not found");

    console.log(`Adding Hoya to ${team.name}...`);

    await prisma.player.create({
        data: {
            name: 'Hoya',
            role: 'TOP',
            teamId: team.id,
            split: '2026 LPL第一赛段',
            photo: ''
        }
    });

    console.log("Done.");
}

addHoya()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
