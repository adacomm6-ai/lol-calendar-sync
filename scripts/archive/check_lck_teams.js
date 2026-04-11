const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTeams() {
    const teams = await prisma.team.findMany({
        where: { region: 'LCK' }
    });
    console.log(`Found ${teams.length} LCK teams.`);
    teams.forEach(t => console.log(`- ${t.name} (${t.shortName})`));
}

checkTeams()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
