
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { format } = require('date-fns');

async function main() {
    // Search broadly around Jan 15
    const matches = await prisma.match.findMany({
        where: {
            startTime: {
                gte: new Date('2026-01-15T00:00:00Z'),
                lt: new Date('2026-01-16T00:00:00Z')
            }
        },
        include: { teamA: true, teamB: true },
        orderBy: { startTime: 'asc' }
    });

    console.log(`Matches on Jan 15 (UTC search): ${matches.length}`);
    matches.forEach(m => {
        console.log(`- ${m.teamA.name} vs ${m.teamB.name}`);
        console.log(`  Raw UTC: ${m.startTime.toISOString()}`);
        console.log(`  Local String: ${m.startTime.toString()}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
