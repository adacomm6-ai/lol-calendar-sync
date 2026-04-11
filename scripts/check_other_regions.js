const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Get distinct regions for teams that are NOT LPL or LCK
    const teams = await prisma.team.findMany({
        where: {
            region: {
                notIn: ['LPL', 'LCK']
            }
        },
        select: { name: true, shortName: true, region: true }
    });

    console.log('Teams with non-LPL/LCK regions:');
    teams.forEach(t => console.log(`  - ${t.shortName} (${t.name}): region="${t.region}"`));

    // Also check what regions are used in matches
    const matches = await prisma.match.findMany({
        where: {
            AND: [
                { tournament: { contains: '2026' } },
                {
                    OR: [
                        { teamA: { region: { notIn: ['LPL', 'LCK'] } } },
                        { teamB: { region: { notIn: ['LPL', 'LCK'] } } }
                    ]
                }
            ]
        },
        include: { teamA: { select: { name: true, region: true } }, teamB: { select: { name: true, region: true } } },
        take: 5
    });

    console.log('\nSample matches with other-region teams:');
    matches.forEach(m => {
        console.log(`  Match: ${m.teamA?.name} vs ${m.teamB?.name}`);
        console.log(`    TeamA region: "${m.teamA?.region}", TeamB region: "${m.teamB?.region}"`);
        console.log(`    Tournament: "${m.tournament}", Stage: "${m.stage}"`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
