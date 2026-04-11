
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const players = await prisma.player.findMany({
        where: { name: { in: ['HOYA', 'Guwon', 'Care', 'Assum', 'Zhuo'] } },
        include: { team: true }
    });
    console.log('Old TT Players placement:');
    players.forEach(p => console.log(` - ${p.name}: ${p.team?.name} (${p.team?.shortName})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
