const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkGameData() {
    const games = await prisma.game.findMany({
        where: {
            analysisData: {
                contains: '"Knight"'
            }
        },
        include: {
            match: true
        },
        take: 5
    });

    for (const game of games) {
        console.log(`\nGame ID: ${game.id}`);
        console.log(`BlueSideTeamId DB: ${game.blueSideTeamId}`);
        console.log(`RedSideTeamId DB: ${game.redSideTeamId}`);
        console.log(`Match TeamA: ${game.match?.teamAId}`);
        console.log(`Match TeamB: ${game.match?.teamBId}`);

        // Check damage data
        try {
            const data = JSON.parse(game.analysisData);
            const damageData = data.damage_data || [];
            console.log('--- Damage Data Blue ---');
            console.log(damageData.filter(p => p.team === 'Blue').map(p => `${p.playerName || p.name} (${p.championName || p.hero})`).join(', '));
            console.log('--- Damage Data Red ---');
            console.log(damageData.filter(p => p.team === 'Red').map(p => `${p.playerName || p.name} (${p.championName || p.hero})`).join(', '));
        } catch (e) {
            console.log('Error parsing JSON');
        }
    }
}

checkGameData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
