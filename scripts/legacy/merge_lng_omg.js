
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function mergeMatches() {
    try {
        console.log("Starting Merge: 'Bad' 288a4c26 -> 'Good' be3fcc1c");

        const badId = '288a4c26-695b-4591-ac89-1c8f6fba728b'; // LNG vs OMG (Bad Meta, Good Stats?)
        const goodId = 'be3fcc1c-80fd-41ae-81bc-ae7c74ade8a9'; // OMG vs LNG (Good Meta, 0 Stats)

        const badMatch = await prisma.match.findUnique({ where: { id: badId }, include: { games: true } });
        const goodMatch = await prisma.match.findUnique({ where: { id: goodId }, include: { games: true } });

        if (!badMatch || !goodMatch) {
            console.error("Match not found");
            return;
        }

        // Loop through games 1-5
        for (let i = 1; i <= 5; i++) {
            const badGame = badMatch.games.find(g => g.gameNumber === i);
            const goodGame = goodMatch.games.find(g => g.gameNumber === i);

            if (badGame && goodGame) {
                console.log(`\nProcessing Game ${i}...`);

                // Only migrate if badGame has stats
                if (badGame.totalKills > 0 || badGame.analysisData) {
                    console.log(`  Migrating stats (Total: ${badGame.totalKills})...`);

                    // Prepare update data
                    const updateData = {
                        totalKills: badGame.totalKills,
                        blueKills: badGame.blueKills,
                        redKills: badGame.redKills,
                        blueTenMinKills: badGame.blueTenMinKills,
                        redTenMinKills: badGame.redTenMinKills,
                        analysisData: badGame.analysisData,
                        teamAStats: badGame.teamAStats,
                        teamBStats: badGame.teamBStats,
                        // Preserve goodGame's side IDs!
                    };

                    // If badGame has specific screenshot, maybe take it?
                    if (badGame.screenshot && !goodGame.screenshot) {
                        updateData.screenshot = badGame.screenshot;
                    }

                    await prisma.game.update({
                        where: { id: goodGame.id },
                        data: updateData
                    });
                    console.log("  Updated Good Game.");
                } else {
                    console.log("  Bad Game has no stats, skipping.");
                }
            }
        }

        console.log("\nDeleting Bad Match...");
        await prisma.game.deleteMany({ where: { matchId: badId } });
        await prisma.match.delete({ where: { id: badId } });
        console.log("Done.");

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

mergeMatches();
