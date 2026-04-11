const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
    const team = await prisma.team.findFirst({
        where: { shortName: 'DNS' },
        include: { players: true }
    });

    if (!team) {
        console.log("DNS not found!");
        return;
    }

    console.log(`Team: ${team.name} (${team.shortName})`);
    console.log(`Players (${team.players.length}):`);
    team.players.forEach(p => console.log(`- ${p.name} [${p.role}] (${p.split})`));
}

verify()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
