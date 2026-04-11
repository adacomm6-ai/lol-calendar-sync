const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teamsToSearch = ['Team Liquid', 'RED Canids', 'FURIA'];

    console.log('--- Team Info ---');
    const teams = await prisma.team.findMany({
        where: { name: { in: teamsToSearch } },
        select: { id: true, name: true }
    });
    console.log(JSON.stringify(teams, null, 2));

    for (const teamName of teamsToSearch) {
        console.log(`\nMatches for ${teamName}:`);
        // Find the team object to get its ID
        const teamObj = teams.find(t => t.name === teamName);
        const searchId = teamObj ? teamObj.id : teamName;

        const matches = await prisma.match.findMany({
            where: {
                OR: [
                    { teamAId: searchId },
                    { teamBId: searchId }
                ]
            },
            take: 10,
            select: {
                id: true,
                teamAId: true,
                teamBId: true,
                format: true,
                status: true,
                tournament: true
            }
        });
        console.log(JSON.stringify(matches, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
