
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tt = await prisma.team.findFirst({
        where: { shortName: 'TT' },
        include: { players: true }
    });
    console.log('TT Roster:');
    tt.players.forEach(p => console.log(' - ' + p.name + ' (' + p.role + ')'));
}

main().catch(console.error).finally(() => prisma.$disconnect());
