const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const game = await prisma.game.findFirst({
        where: {
            analysisData: { not: null }
        }
    });

    if (game && game.analysisData) {
        console.log("Found game analysis data:");
        const data = JSON.parse(game.analysisData);
        // Print the first team's players if available
        if (data.teamA && data.teamA.players) {
            console.log(JSON.stringify(data.teamA.players.slice(0, 2), null, 2));
        } else if (data.damage_data) {
            console.log(JSON.stringify(data.damage_data.slice(0, 2), null, 2));
        } else {
            console.log(Object.keys(data));
        }
    } else {
        console.log("No analysis data found.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
