const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Search exact first, then case insensitive
    let p = await prisma.player.findFirst({ where: { name: 'Willer' } });
    if (!p) {
        // Try upper
        p = await prisma.player.findFirst({ where: { name: 'WILLER' } });
    }

    if (p) {
        await prisma.player.update({ where: { id: p.id }, data: { split: 'Split 1' } });
        console.log(`Updated WILLER to Split 1`);
    } else {
        console.log("WILLER not found directly, searching DRX...");
        const drx = await prisma.team.findFirst({ where: { shortName: 'DRX' }, include: { players: true } });
        if (drx) {
            const target = drx.players.find(pl => pl.name.toUpperCase() === 'WILLER');
            if (target) {
                await prisma.player.update({ where: { id: target.id }, data: { split: 'Split 1' } });
                console.log(`Updated WILLER (${target.name}) to Split 1`);
            } else {
                console.log("WILLER not found in DRX.");
            }
        }
    }
}

main();
