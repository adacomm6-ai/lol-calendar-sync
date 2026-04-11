const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStrict() {
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { match: { teamAId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' }, teamAStats: { contains: 'Flandre' } },
                { match: { teamBId: '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a' }, teamBStats: { contains: 'Flandre' } }
            ]
        },
        include: { match: true }
    });

    console.log(`Found ${games.length} games where IG's explicitly assigned team stats contain Flandre.`);
    for (const game of games) {
        console.log(`Game: ${game.id}, MatchTeamA: ${game.match.teamAId}, MatchTeamB: ${game.match.teamBId}`);
        // Now verify if damage_data exists to see if usedAnalysisData will bypass it!
        let hasAnalysis = false;
        if (game.analysisData) {
            try { hasAnalysis = JSON.parse(game.analysisData).damage_data?.length > 0; } catch (e) { }
        }
        console.log(`Has Analysis Data: ${hasAnalysis}`);
    }
}
checkStrict().finally(() => prisma.$disconnect());
