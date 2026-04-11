
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Fetching a Demacia Cup match to inspect player stats keys...");

    // Find a game with 'damage_data' (likely from recent Demacia Cup)
    const games = await prisma.game.findMany({
        where: {
            analysisData: {
                contains: 'damage_data'
            }
        },
        take: 1
    });

    if (games.length === 0) {
        console.log("No games with damage_data found.");
        return;
    }

    const game = games[0];
    try {
        const data = JSON.parse(game.analysisData);
        console.log("AnalysisData Keys:", Object.keys(data));

        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
                console.log(`\nKey '${key}' is an array of length ${data[key].length}. Sample[0]:`);
                console.log(JSON.stringify(data[key][0], null, 2));
            } else {
                console.log(`\nKey '${key}':`, typeof data[key]);
            }
        }

    } catch (e) {
        console.error("Error parsing JSON:", e);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
