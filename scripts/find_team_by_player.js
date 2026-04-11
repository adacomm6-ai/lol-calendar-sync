
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const players = await prisma.player.findMany({
        where: {
            name: { in: ['Flandre', 'Tarzan', 'Hope'] }
        },
        include: { team: true }
    });

    if (players.length === 0) {
        console.log('No players found');
    } else {
        players.forEach(p => {
            console.log(`Found ${p.name} in Team: ${p.team.name} (ID: ${p.team.id})`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
