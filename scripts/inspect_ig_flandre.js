const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkIG() {
    // 9a2fb4e6-a267-4563-9b81-5ecd507e4d6a is IG
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { blueSideTeamId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' },
                { redSideTeamId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' },
                { match: { teamAId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' } },
                { match: { teamBId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' } }
            ]
        },
        include: { match: true }
    });

    for (const game of games) {
        let hasFlandre = false;
        if (game.analysisData && game.analysisData.includes('Flandre')) hasFlandre = true;
        if (game.teamAStats && game.teamAStats.includes('Flandre')) hasFlandre = true;
        if (game.teamBStats && game.teamBStats.includes('Flandre')) hasFlandre = true;

        if (hasFlandre) {
            console.log(`\nGame ID: ${game.id}, Match ID: ${game.matchId}`);
            console.log(`BlueSideId: ${game.blueSideTeamId}, RedSideId: ${game.redSideTeamId}`);
            console.log(`Match TeamA: ${game.match.teamAId}, Match TeamB: ${game.match.teamBId}`);

            if (game.analysisData) {
                const data = JSON.parse(game.analysisData);
                const blueStats = data.damage_data?.filter(p => p.team === 'Blue') || [];
                const redStats = data.damage_data?.filter(p => p.team === 'Red') || [];
                console.log('Analysis Blue:', blueStats.map(p => p.name || p.playerName));
                console.log('Analysis Red:', redStats.map(p => p.name || p.playerName));
            } else {
                console.log('TeamAStats:', game.teamAStats ? JSON.parse(game.teamAStats).map(p => p.name || p.playerName) : []);
                console.log('TeamBStats:', game.teamBStats ? JSON.parse(game.teamBStats).map(p => p.name || p.playerName) : []);
            }
        }
    }
}

checkIG().catch(console.error).finally(() => prisma.$disconnect());
