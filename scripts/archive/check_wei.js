const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPlayer() {
    const players = await prisma.player.findMany({
        where: {
            name: {
                contains: 'Wei'
            }
        },
        include: {
            team: true
        }
    });

    console.log('Found Wei(s):');
    players.forEach(p => {
        console.log(`- ID: ${p.id} | Name: ${p.name} | Role: ${p.role} | Team: ${p.team.name} | Split: ${p.split}`);
    });

    // Also check the specific match if possible (ID from screenshot: 5f14585c...)
    // But exact ID is hard to read.
}

checkPlayer();
