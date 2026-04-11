const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Get all distinct region values in team table
    const teams = await prisma.team.findMany({ select: { region: true } });
    const regionSet = [...new Set(teams.map(t => t.region).filter(Boolean))];
    console.log('== All team.region values in DB ==');
    regionSet.sort().forEach(r => console.log(`  "${r}"`));

    // Get all distinct tournament values
    const matches = await prisma.match.findMany({
        select: { tournament: true, stage: true },
        where: { startTime: { gte: new Date('2025-11-01') } }
    });
    const tournamentSet = [...new Set(matches.map(m => m.tournament).filter(Boolean))];
    const stageSet = [...new Set(matches.map(m => m.stage).filter(Boolean))];

    console.log('\n== All match.tournament values (2025-) ==');
    tournamentSet.sort().forEach(t => console.log(`  "${t}"`));

    console.log('\n== All match.stage values (2025-) ==');
    stageSet.sort().forEach(s => console.log(`  "${s}"`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
