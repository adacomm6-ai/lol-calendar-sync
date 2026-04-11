const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const p = await prisma.player.findFirst({ where: { name: 'FENGYUE' } });
    if (!p) {
        // Try case insensitive logic or TES lookup
        console.log("FENGYUE not found directly, searching TES...");
        const tes = await prisma.team.findFirst({ where: { shortName: 'TES' }, include: { players: true } });
        const target = tes.players.find(pl => pl.name.toUpperCase() === 'FENGYUE');
        if (target) {
            await prisma.player.update({ where: { id: target.id }, data: { split: 'Split 1' } });
            console.log(`Updated FENGYUE (${target.name}) to Split 1`);
        } else {
            console.log("FENGYUE not found in TES.");
        }
    } else {
        await prisma.player.update({ where: { id: p.id }, data: { split: 'Split 1' } });
        console.log(`Updated FENGYUE to Split 1`);
    }
}

main();
