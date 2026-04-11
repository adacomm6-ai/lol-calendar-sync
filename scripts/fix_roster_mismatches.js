
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Fixing roster mismatches (Team A having Team B players)...');

    const matches = await prisma.match.findMany({
        include: {
            teamA: { include: { players: true } },
            teamB: { include: { players: true } },
            games: true
        }
    });

    let fixedCount = 0;

    for (const match of matches) {
        if (!match.teamA || !match.teamB) continue;

        const teamAPlayerIds = new Set(match.teamA.players.map(p => p.id));
        const teamBPlayerIds = new Set(match.teamB.players.map(p => p.id));

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

            // Threshold: If A's stats have strictly more B-players AND B's stats have strictly more A-players
            if (scoreA_for_B > scoreA_for_A && scoreB_for_A > scoreB_for_B) {
                console.log(`[FIXING] Match ${match.id} (${match.teamA.name} vs ${match.teamB.name}) - Game ${game.gameNumber}`);
                console.log(`  Reason: Stats A has ${scoreA_for_B} B-players, Stats B has ${scoreB_for_A} A-players. Swapping...`);

                // SWAP
                await prisma.game.update({
                    where: { id: game.id },
                    data: {
                        teamAStats: JSON.stringify(statsB), // A gets B's content
                        teamBStats: JSON.stringify(statsA)  // B gets A's content
                    }
                });
                fixedCount++;
            }
        }
    }

    console.log(`-----------------------------------`);
    console.log(`Scan & Fix complete. Fixed ${fixedCount} games.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
