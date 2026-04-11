
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function undoMerge() {
    try {
        const matchId = 'be3fcc1c-80fd-41ae-81bc-ae7c74ade8a9'; // OMG vs LNG
        console.log(`Reverting stats for Match ${matchId}...`);

        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { games: true }
        });

        if (!match) {
            console.log("Match not found.");
            return;
        }

        // We suspect the 'bad' data polluted Games 1, 2, 4, 5. Game 3 was 0 anyway.
        // We will reset stats for ALL games in this match to be safe, 
        // as the user stated the source data was "completely wrong".

        for (const game of match.games) {
            console.log(`Clearing stats for Game ${game.gameNumber}...`);
            await prisma.game.update({
                where: { id: game.id },
                data: {
                    totalKills: 0,
                    blueKills: 0,
                    redKills: 0,
                    blueTenMinKills: 0,
                    redTenMinKills: 0,
                    // Resetting to null or empty is safer to remove the garbage lineups
                    teamAStats: null,
                    teamBStats: null,
                    // We keep analysisData simplified or null to avoid displaying wrong info
                    // If it was previously present but empty, we can set it to a minimal valid JSON or null.
                    // Setting null is safest.
                    analysisData: null
                }
            });
        }
        console.log("Revert complete. Stats cleared.");

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

undoMerge();
