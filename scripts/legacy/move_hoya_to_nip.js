
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function moveHoya() {
    // 1. Find Hoya
    const player = await prisma.player.findFirst({
        where: { name: 'Hoya' },
        include: { team: true }
    });

    if (!player) {
        console.log("Hoya not found!");
        return;
    }

    console.log(`Found Hoya, currently in: ${player.team?.name || 'None'}`);

    // 2. Find NIP
    const nip = await prisma.team.findFirst({
        where: { OR: [{ name: 'Ninjas in Pyjamas' }, { shortName: 'NIP' }] }
    });

    if (!nip) {
        console.log("NIP not found!");
        return;
    }

    console.log(`Moving Hoya to ${nip.name}...`);

    await prisma.player.update({
        where: { id: player.id },
        data: { teamId: nip.id }
    });

    console.log("Done.");
}

moveHoya()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
