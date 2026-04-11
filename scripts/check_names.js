const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkNames() {
    const players = await prisma.player.findMany({
        include: {
            team: true
        }
    });

    const map = new Map();
    for (const p of players) {
        if (!map.has(p.name)) {
            map.set(p.name, []);
        }
        map.get(p.name).push(p);
    }

    let dupCount = 0;
    for (const [name, list] of map.entries()) {
        if (list.length > 1) {
            dupCount++;
            console.log(`Name: "${name}" appears ${list.length} times`);
            for (const item of list) {
                console.log(`   - ID: ${item.id}, Team: "${item.team?.name}" (ID: ${item.teamId})`);
            }
        }
    }

    console.log(`\nTotal names with multiple entries: ${dupCount}`);
}

checkNames()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
