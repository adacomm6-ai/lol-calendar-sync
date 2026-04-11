
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEDG() {
    const team = await prisma.team.findFirst({
        where: { name: 'EDward Gaming' } // Or shortName EDG
    });
    if (!team) {
        console.log("EDG not found? Checking shortName...");
        const team2 = await prisma.team.findFirst({ where: { shortName: 'EDG' } });
        if (!team2) { console.log("EDG Missing!"); return; }
        console.log(`Found EDG: ${team2.name} (${team2.id})`);
        inspectRoster(team2.id);
    } else {
        console.log(`Found EDG: ${team.name} (${team.id})`);
        inspectRoster(team.id);
    }
}

async function inspectRoster(teamId) {
    const players = await prisma.player.findMany({ where: { teamId } });
    console.log(`EDG Roster (${players.length}):`);
    players.forEach(p => console.log(`- ${p.name} (${p.role}) Split="${p.split}"`));

    const hoya = players.find(p => p.name.toLowerCase().includes('hoya'));
    if (!hoya) {
        console.log("!! HOYA NOT FOUND !!");
    } else {
        console.log("Hoya is present.");
    }
}

checkEDG()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
