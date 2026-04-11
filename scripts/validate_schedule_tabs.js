const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simulate the new getCachedScheduleMatches for each region tab
async function queryForRegion(region, year, stageKeyword) {
    let regionFilter;
    if (region === 'LPL') {
        regionFilter = {
            OR: [
                { teamA: { region: { contains: 'LPL' } } },
                { teamB: { region: { contains: 'LPL' } } },
                { tournament: { contains: 'LPL' } }
            ]
        };
    } else if (region === 'LCK') {
        regionFilter = {
            OR: [
                { teamA: { region: { contains: 'LCK' } } },
                { teamB: { region: { contains: 'LCK' } } },
                { tournament: { contains: 'LCK' } }
            ]
        };
    } else if (region === '其他赛区' || region === '其它赛区') {
        regionFilter = {
            AND: [
                {
                    OR: [
                        { teamA: { region: { contains: '其他' } } },
                        { teamA: { region: { contains: '其它' } } },
                        { teamB: { region: { contains: '其他' } } },
                        { teamB: { region: { contains: '其它' } } },
                        { tournament: { contains: 'LEC' } },
                        { tournament: { contains: 'LCS' } },
                        { tournament: { contains: '其他' } },
                        { tournament: { contains: '其它' } },
                    ]
                },
                { NOT: { teamA: { region: { contains: 'LPL' } } } },
                { NOT: { teamA: { region: { contains: 'LCK' } } } },
            ]
        };
    } else if (region === '世界赛') {
        regionFilter = {
            OR: [
                { tournament: { contains: 'MSI' } },
                { tournament: { contains: 'Worlds' } },
                { tournament: { contains: '世界赛' } },
            ]
        };
    }

    const matches = await prisma.match.findMany({
        where: {
            AND: [
                regionFilter,
                { startTime: { gte: new Date('2025-11-01'), lt: new Date('2027-01-01') } },
                {
                    OR: [
                        { tournament: { contains: stageKeyword } },
                        { stage: { contains: stageKeyword } }
                    ]
                },
                { NOT: { OR: [{ tournament: { contains: '季后赛' } }, { stage: { contains: '季后赛' } }] } }
            ]
        },
        include: { teamA: { select: { name: true, region: true } }, teamB: { select: { name: true, region: true } } },
        take: 3
    });
    return matches;
}

async function main() {
    const tabs = ['LPL', 'LCK', '其他赛区', '世界赛'];
    for (const tab of tabs) {
        const results = await queryForRegion(tab, '2026', '第一赛段');
        console.log(`\n== ${tab} (Split 1 / 第一赛段) - ${results.length} matches ==`);
        results.forEach(m => {
            console.log(`  ${m.teamA?.name} (${m.teamA?.region}) vs ${m.teamB?.name} (${m.teamB?.region})`);
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
