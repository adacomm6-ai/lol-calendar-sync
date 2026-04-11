
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teamId = '020ad6e7-54e8-495a-9e44-5cf83e6c4b8d';
    const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { players: true }
    });

    if (!team) {
        console.log(`Team ${teamId} not found`);
        return;
    }

    console.log(`Team: ${team.name} (${team.shortName})`);
    team.players.forEach(p => console.log(` - ${p.name} (${p.role}) Split: ${p.split}`));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
