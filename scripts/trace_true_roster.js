const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function traceDuplicates() {
    const games = await prisma.game.findMany({
        include: {
            match: true
        }
    });

    const trueRoster = new Map();
    const addToRoster = (stats, tId, gameId) => {
        if (!stats || !tId) return;
        if (!trueRoster.has(tId)) trueRoster.set(tId, new Map());
        const teamMap = trueRoster.get(tId);

        for (const p of stats) {
            const name = p.name || p.playerName;
            if (!name) continue;
            // Let's trace Flandre
            if (name.toLowerCase() === 'flandre' || name.toLowerCase() === 'knight') {
                if (!teamMap.has(name)) teamMap.set(name, []);
                teamMap.get(name).push(gameId);
            }
        }
    };

    for (const game of games) {
        const blueTeamId = game.blueSideTeamId || game.match?.teamAId;
        const redTeamId = game.redSideTeamId || game.match?.teamBId;

        let blueStats = null;
        let redStats = null;

        if (game.analysisData) {
            try {
                const data = JSON.parse(game.analysisData);
                const damageData = data.damage_data || [];
                if (damageData.length > 0) {
                    blueStats = damageData.filter(p => p.team === 'Blue');
                    redStats = damageData.filter(p => p.team === 'Red');
                }
            } catch (e) { }
        }

        if (!blueStats || blueStats.length === 0) {
            if (game.teamAStats) { try { blueStats = JSON.parse(game.teamAStats); } catch (e) { } }
        }
        if (!redStats || redStats.length === 0) {
            if (game.teamBStats) { try { redStats = JSON.parse(game.teamBStats); } catch (e) { } }
        }

        addToRoster(blueStats, blueTeamId, game.id);
        addToRoster(redStats, redTeamId, game.id);
    }

    // Print results
    for (const [tId, teamMap] of trueRoster.entries()) {
        for (const [name, gameIds] of teamMap.entries()) {
            console.log(`Team: ${tId} | Name: ${name} | Found in ${gameIds.length} games: ${gameIds.slice(0, 3).join(', ')}...`);
            // Get team name
            const t = await prisma.team.findUnique({ where: { id: tId } });
            console.log(`  -> Team Name: ${t?.name}`);
        }
    }
}

traceDuplicates()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
