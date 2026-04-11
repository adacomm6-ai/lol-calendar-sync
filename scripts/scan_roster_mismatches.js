
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Scanning for roster mismatches (Team A having Team B players)...');

    const matches = await prisma.match.findMany({
        include: {
            teamA: { include: { players: true } },
            teamB: { include: { players: true } },
            games: true
        },
        orderBy: { createdAt: 'desc' } // Check recent first
    });

    const suspiciousGames = [];

    for (const match of matches) {
        if (!match.teamA || !match.teamB) continue;

        const teamAPlayerIds = new Set(match.teamA.players.map(p => p.id));
        const teamBPlayerIds = new Set(match.teamB.players.map(p => p.id));

        // Also map names for fuzzy matching if IDs missing (stats JSON sometimes lacks IDs or has old ones)
        const teamANames = new Set(match.teamA.players.map(p => p.name.toLowerCase()));
        const teamBNames = new Set(match.teamB.players.map(p => p.name.toLowerCase()));

        for (const game of match.games) {
            let statsA, statsB;
            try {
                statsA = JSON.parse(game.teamAStats || '[]');
                statsB = JSON.parse(game.teamBStats || '[]');
            } catch (e) {
                continue;
            }

            if (statsA.length === 0 || statsB.length === 0) continue;

            let scoreA_for_A = 0;
            let scoreA_for_B = 0;
            let scoreB_for_A = 0;
            let scoreB_for_B = 0;

            // Check Team A Stats
            for (const p of statsA) {
                const pid = p.playerId;
                const name = (p.name || p.playerName || '').toLowerCase();

                if (pid && teamAPlayerIds.has(pid)) scoreA_for_A++;
                else if (pid && teamBPlayerIds.has(pid)) scoreA_for_B++;
                else if (teamANames.has(name)) scoreA_for_A++;
                else if (teamBNames.has(name)) scoreA_for_B++;
            }

            // Check Team B Stats
            for (const p of statsB) {
                const pid = p.playerId;
                const name = (p.name || p.playerName || '').toLowerCase();

                if (pid && teamBPlayerIds.has(pid)) scoreB_for_B++;
                else if (pid && teamAPlayerIds.has(pid)) scoreB_for_A++;
                else if (teamBNames.has(name)) scoreB_for_B++;
                else if (teamANames.has(name)) scoreB_for_A++;
            }

            // Heuristic: If A's stats have more B-players AND B's stats have more A-players
            // It's a highly likely swap.
            // We use a threshold (e.g., at least 2 players matched to wrong team)

            if (scoreA_for_B > scoreA_for_A && scoreB_for_A > scoreB_for_B) {
                suspiciousGames.push({
                    matchId: match.id,
                    gameId: game.id,
                    gameNumber: game.gameNumber,
                    teamA: match.teamA.name,
                    teamB: match.teamB.name,
                    reason: `Stats A has ${scoreA_for_B} B-players (vs ${scoreA_for_A} A-players), Stats B has ${scoreB_for_A} A-players (vs ${scoreB_for_B} B-players)`
                });
            }
        }
    }

    if (suspiciousGames.length === 0) {
        console.log('No suspicious games found.');
    } else {
        console.log(`Found ${suspiciousGames.length} suspicious games:`);
        suspiciousGames.forEach(g => {
            console.log(`[Mismatch] Match ${g.matchId} (${g.teamA} vs ${g.teamB}) - Game ${g.gameNumber}: ${g.reason}`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
