
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTT() {
    const team = await prisma.team.findFirst({
        where: {
            OR: [{ name: 'TT' }, { shortName: 'TT' }]
        }
    });

    if (!team) {
        console.log("Team TT not found.");
        return;
    }

    console.log(`Team: ${team.name} (${team.id})`);

    const players = await prisma.player.findMany({
        where: { teamId: team.id }
    });

    console.log(`Found ${players.length} players:`);
    players.forEach(p => {
        console.log(`- ${p.name} (${p.role}): Split="${p.split}"`);
    });

    // Specific check for Keshi / Heru name match
    const keshi = players.find(p => p.name.toLowerCase().includes('keshi'));
    const heru = players.find(p => p.name.toLowerCase().includes('heru'));

    if (!keshi) console.log("!! Keshi not found in TT roster !!");
    if (!heru) console.log("!! Heru not found in TT roster !!");
}

checkTT()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
