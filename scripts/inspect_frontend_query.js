const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAnalysisQuery() {
    const players = await prisma.player.findMany({
        where: {
            split: { contains: "Split 1" },
            team: {
                region: "LPL"
            }
        },
        include: {
            team: true
        },
        orderBy: {
            team: {
                name: 'asc'
            }
        }
    });

    const duplicates = {};
    for (const p of players) {
        const id = p.name + '-' + p.teamId;
        if (!duplicates[id]) duplicates[id] = 0;
        duplicates[id]++;
    }

    let hasDups = false;
    for (const [id, count] of Object.entries(duplicates)) {
        if (count > 1) {
            console.log(`DUPLICATE FOUND IN ANALYSIS QUERY: ${id} x${count}`);
            hasDups = true;
        }
    }

    if (!hasDups) {
        console.log(`Query returned ${players.length} players. NO DUPLICATES FOUND!`);
        console.log(`Here are some players: ${players.slice(0, 5).map(p => p.name + " " + p.team.shortName).join(', ')}`);
    }
}
checkAnalysisQuery().finally(() => prisma.$disconnect());
