const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
    const players = await prisma.player.findMany({
        where: {
            name: {
                in: ['Flandre', 'FLANDRE', 'Knight', 'KNIGHT', 'Tarzan', 'TARZAN', '369']
            }
        },
        include: {
            team: true
        }
    });

    console.log('Found players matching test names:');
    for (const p of players) {
        console.log(`- ID: ${p.id} | Name: "${p.name}" | Team: ${p.team?.name} (${p.team?.shortName}) [ID: ${p.teamId}] | Split: "${p.split}"`);
    }
}

checkDuplicates()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
