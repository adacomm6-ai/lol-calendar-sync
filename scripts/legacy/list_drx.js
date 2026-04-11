const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const team = await prisma.team.findFirst({ where: { shortName: 'DRX' }, include: { players: true } });
        console.log("DRX Players:", team.players.map(p => p.name));
    } catch (e) {
        console.error(e);
    }
}

main();
