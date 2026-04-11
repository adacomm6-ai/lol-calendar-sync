const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugRoster() {
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

    const addToRoster = (stats, tId, split, info, gameId) => {
        if (!stats || !tId) return;
        if (!trueRoster.has(tId)) trueRoster.set(tId, new Map());
        const teamMap = trueRoster.get(tId);

        for (const p of stats) {
            const name = p.name || p.playerName;
            if (!name) continue;
            const nameLower = name.trim().toLowerCase();

            if (nameLower === 'flandre' || nameLower === 'knight') {
                if (!teamMap.has(nameLower)) teamMap.set(nameLower, []);
                teamMap.get(nameLower).push({ info, split, gameId });
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

                    addToRoster(blueStats, game.blueSideTeamId || game.match.teamAId, split, 'BlueStats (analysis)', game.id);
                    addToRoster(redStats, game.redSideTeamId || game.match.teamBId, split, 'RedStats (analysis)', game.id);
                    usedAnalysisData = true;
                }
            } catch (e) { }
        }

        if (!usedAnalysisData) {
            if (game.teamAStats) {
                try { addToRoster(JSON.parse(game.teamAStats), game.match.teamAId, split, 'teamAStats (fallback)', game.id); } catch (e) { }
            }
            if (game.teamBStats) {
                try { addToRoster(JSON.parse(game.teamBStats), game.match.teamBId, split, 'teamBStats (fallback)', game.id); } catch (e) { }
            }
        }
    }

    for (const [tId, teamMap] of trueRoster.entries()) {
        for (const [name, traces] of teamMap.entries()) {
            console.log(`\nTeam ID: ${tId}`);
            console.log(`Player: ${name}`);
            for (const trace of traces) {
                console.log(`  <- Game: ${trace.gameId} via ${trace.info}`);
            }
        }
    }
}

debugRoster().catch(console.error).finally(() => prisma.$disconnect());
