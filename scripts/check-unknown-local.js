const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const unknownPlayers = await prisma.player.count({
        where: { role: 'UNKNOWN' }
    });

    const teamsWithUnknown = await prisma.player.groupBy({
        by: ['teamId'],
        where: { role: 'UNKNOWN' },
        _count: { _all: true }
    });

    console.log('--- Local SQLite Status ---');
    console.log('Total players with UNKNOWN role:', unknownPlayers);
    console.log('Number of teams with UNKNOWN players:', teamsWithUnknown.length);
    if (teamsWithUnknown.length > 0) {
        console.log('Samples:', teamsWithUnknown.slice(0, 5));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
