const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTeamPlayers() {
    try {
        const teams = await prisma.team.findMany({
            include: {
                players: true,
            },
            orderBy: {
                name: 'asc',
            },
        });

        console.log(JSON.stringify(teams, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkTeamPlayers();
