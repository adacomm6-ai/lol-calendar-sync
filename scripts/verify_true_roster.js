const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTrueRoster() {
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { analysisData: { not: null } },
                { teamAStats: { not: null } },
                { teamBStats: { not: null } }
            ]
        },
        include: { match: true }
    });

    const trueRoster = new Map();

    const addToRoster = (stats, tId, split) => {
        if (!stats || !tId) return;
        if (!trueRoster.has(tId)) trueRoster.set(tId, new Map());
        const teamMap = trueRoster.get(tId);

        for (const p of stats) {
            const name = p.name || p.playerName;
            if (!name) continue;
            const nameLower = name.trim().toLowerCase();
            if (!teamMap.has(nameLower)) {
                teamMap.set(nameLower, true);
            }
        }
    };

    for (const game of games) {
        const split = game.match.tournament || 'Unknown Tournament';
        let usedAnalysisData = false;

        if (game.analysisData) {
            try {
                const data = JSON.parse(game.analysisData);
                const damageData = data.damage_data || [];
                if (damageData.length > 0) {
                    const blueStats = damageData.filter((p) => p.team === 'Blue');
                    const redStats = damageData.filter((p) => p.team === 'Red');

                    addToRoster(blueStats, game.blueSideTeamId || game.match.teamAId, split);
                    addToRoster(redStats, game.redSideTeamId || game.match.teamBId, split);
                    usedAnalysisData = true;
                }
            } catch (e) { }
        }

        if (!usedAnalysisData) {
            if (game.teamAStats) {
                try { addToRoster(JSON.parse(game.teamAStats), game.match.teamAId, split); } catch (e) { }
            }
            if (game.teamBStats) {
                try { addToRoster(JSON.parse(game.teamBStats), game.match.teamBId, split); } catch (e) { }
            }
        }
    }

    const tId = '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a'; // IG
    console.log("IG Map:", trueRoster.get(tId)?.keys());
    console.log("Does IG have flandre?", trueRoster.get(tId)?.has('flandre'));
}

runTrueRoster().catch(console.error).finally(() => prisma.$disconnect());
