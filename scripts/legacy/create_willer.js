const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const drx = await prisma.team.findFirst({ where: { shortName: 'DRX' } });
    if (!drx) {
        console.error("DRX not found");
        return;
    }

    const p = await prisma.player.create({
        data: {
            name: 'Willer',
            role: 'JUNGLE',
            teamId: drx.id,
            split: 'Split 1'
        }
    });
    console.log("Created Willer:", p.id);
}

main();
