
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Find games for Demacia Cup match (Invictus vs LNG or similar, based on user screenshot)
    // Screenshot: Invictus (IG) vs LNG Esports. 
    // Jan 1, 17:00.

    const games = await prisma.game.findMany({
        where: {
            match: {
                teamA: { name: "Invictus Gaming" },
                teamB: { name: "LNG Esports" }
            }
        },
        include: { match: true }
    });

    console.log(`Found ${games.length} games.`);
    games.forEach(g => {
        console.log(`Game ${g.gameNumber}: WinnerId=${g.winnerId}, Duration=${g.duration}`);
        console.log(`AnalysisData Fragment: ${g.analysisData ? g.analysisData.substring(0, 100) : 'NULL'}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
