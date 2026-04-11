
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const matches = await prisma.match.findMany({
            orderBy: { startTime: 'desc' },
            take: 5,
            include: { games: true, teamA: true, teamB: true }
        });

        console.log(`Found ${matches.length} matches.`);
        matches.forEach(m => {
            console.log(`Match: ${m.id} | ${m.teamA.name} vs ${m.teamB.name} | Status: ${m.status}`);
            m.games.forEach(g => {
                console.log(`  - Game: ${g.id} #${g.gameNumber} (Winner: ${g.winnerId})`);
            });
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
