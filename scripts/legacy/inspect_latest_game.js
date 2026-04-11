
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectGameData() {
    try {
        // Fetch the most recent game or a specific one if possible. 
        // Since we don't have the ID handy, let's get the latest updated game.
        const game = await prisma.game.findFirst({
            orderBy: { updatedAt: 'desc' },
            include: { match: true }
        });

        if (!game) {
            console.log("No game found.");
            return;
        }

        console.log(`Inspecting Game ID: ${game.id}`);
        console.log(`Match: ${game.match.message || game.match.id}`);

        console.log("--- Team A Stats (JSON) ---");
        if (game.teamAStats) {
            console.log(JSON.stringify(JSON.parse(game.teamAStats), null, 2));
        } else {
            console.log("None");
        }

        console.log("--- Analysis Data (JSON) ---");
        if (game.analysisData) {
            const ad = JSON.parse(game.analysisData);
            if (ad.damage_data) {
                console.log("damage_data sample:", ad.damage_data.slice(0, 2));
            } else {
                console.log("No damage_data found in analysisData");
                console.log("Keys:", Object.keys(ad));
            }
        } else {
            console.log("None");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

inspectGameData();
