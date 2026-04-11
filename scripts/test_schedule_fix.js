const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Simulate the fixed query for "其他赛区", "2026", "Split 1"
    const region = '其他赛区';
    const year = '2026';
    const stage = '第一赛段';  // mapping for Split 1

    const regionContainsTerms = ['其他', '其它'];

    const matches = await prisma.match.findMany({
        where: {
            AND: [
                { startTime: { gte: new Date('2025-12-01'), lt: new Date('2027-01-01') } },
                {
                    OR: [
                        ...regionContainsTerms.map(term => ({ teamA: { region: { contains: term } } })),
                        ...regionContainsTerms.map(term => ({ teamB: { region: { contains: term } } })),
                    ]
                },
                {
                    OR: [
                        { tournament: { contains: stage } },
                        { stage: { contains: stage } }
                    ]
                },
                // Exclude playoffs
                { NOT: { OR: [{ tournament: { contains: '季后赛' } }, { stage: { contains: '季后赛' } }] } },
                { NOT: { OR: [{ tournament: { contains: 'Playoffs' } }, { stage: { contains: 'Playoffs' } }] } },
            ]
        },
        include: { teamA: { select: { name: true, region: true } }, teamB: { select: { name: true, region: true } } },
        take: 10
    });

    console.log(`Found ${matches.length} matches for 其他赛区 2026 Split 1:`);
    matches.forEach(m => {
        console.log(`  - ${m.teamA?.name} vs ${m.teamB?.name} | tournament: "${m.tournament}"`);
    });

    // Also verify LPL still works with contains
    const lplMatches = await prisma.match.findMany({
        where: {
            AND: [
                { startTime: { gte: new Date('2025-12-01'), lt: new Date('2027-01-01') } },
                {
                    OR: [
                        { teamA: { region: { contains: 'LPL' } } },
                        { teamB: { region: { contains: 'LPL' } } },
                    ]
                },
                {
                    OR: [
                        { tournament: { contains: stage } },
                        { stage: { contains: stage } }
                    ]
                },
                { NOT: { OR: [{ tournament: { contains: '季后赛' } }, { stage: { contains: '季后赛' } }] } },
                { NOT: { OR: [{ tournament: { contains: 'Playoffs' } }, { stage: { contains: 'Playoffs' } }] } },
            ]
        },
        take: 3
    });
    console.log(`\nVerification: LPL 2026 Split 1 returns ${lplMatches.length}+ matches (sample)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
