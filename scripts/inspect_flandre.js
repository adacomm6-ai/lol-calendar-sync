const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkGame() {
    const game = await prisma.game.findUnique({
        where: { id: 'abcdb757-45b1-4da7-9173-c774923a4c37' }
    });

    if (!game) {
        console.log("Game not found");
        return;
    }

    console.log(`BlueSideTeamId: ${game.blueSideTeamId}`);
    console.log(`RedSideTeamId: ${game.redSideTeamId}`);
    try {
        const damageData = JSON.parse(game.analysisData).damage_data;
        console.log('Blue Stats:', damageData.filter(p => p.team === 'Blue').map(p => p.name || p.playerName));
        console.log('Red Stats:', damageData.filter(p => p.team === 'Red').map(p => p.name || p.playerName));
    } catch (e) {
        console.log(e);
    }
}

checkGame().catch(console.error).finally(() => prisma.$disconnect());
