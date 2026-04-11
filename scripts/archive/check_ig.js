const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkIG() {
    const ig = await prisma.team.findFirst({
        where: { name: { contains: 'Invictus' } },
        include: { players: true }
    });

    if (!ig) return console.log('IG not found');

    console.log(`Team: ${ig.name} (Players: ${ig.players.length})`);
    ig.players.forEach(p => {
        console.log(`- ${p.name} (${p.split}) [${p.id}]`);
    });
}

checkIG();
