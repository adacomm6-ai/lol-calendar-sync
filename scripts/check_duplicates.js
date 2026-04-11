const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
    const players = await prisma.player.findMany({
        include: {
            team: true
        }
    });

    const dupMap = new Map();
    for (const p of players) {
        const key = `${p.name}-${p.teamId}`;
        if (!dupMap.has(key)) {
            dupMap.set(key, [p]);
        } else {
            dupMap.get(key).push(p);
        }
    }

    let dupCount = 0;
    for (const [key, list] of dupMap.entries()) {
        if (list.length > 1) {
            dupCount++;
            console.log(`Duplicate Key: ${key} (Name: "${list[0].name}", Team: "${list[0].team?.name}") -> Count: ${list.length}`);
            for (const item of list) {
                console.log(`   - ID: ${item.id}, Name: "${item.name}", Split: "${item.split}"`);
            }
        }
    }

    console.log(`\nTotal unique players with duplicates: ${dupCount}`);
}

checkDuplicates()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
