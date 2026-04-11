const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function identifyTeams() {
    try {
        const ids = [
            '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a', // Match Team A (IG)
            '21e288a8-ecca-495f-b32d-369313749b48', // Match Team B (LNG)
            '67434ed6-2152-4a9f-931e-f0f0f307d525', // Game 2/3 Blue (Unknown)
            'eb8f33c4-f5ea-4707-8971-443880e34913'  // Game 2/3 Red/Winner (Unknown)
        ];

        const teams = await prisma.team.findMany({
            where: { id: { in: ids } }
        });

        console.log("Team Identification:");
        teams.forEach(t => {
            console.log(`ID: ${t.id} -> Name: ${t.name}, ShortName: ${t.shortName}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

identifyTeams();
