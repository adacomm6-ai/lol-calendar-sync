
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matchId = '9c13ff72-e4e9-4781-876d-c91bcfeea991';
    const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { games: true }
    });

    if (!match) {
        console.log('Match Not Found');
        return;
    }

    console.log(`Match: ${match.status}, Winner: ${match.winnerId}`);
    console.log(`TeamA: ${match.teamAId}, TeamB: ${match.teamBId}`);
    console.log(`Games Found: ${match.games.length}`);
    match.games.forEach(g => {
        console.log(` - GameID: ${g.id}, Num: ${g.gameNumber} (Type: ${typeof g.gameNumber}), Winner: ${g.winnerId}`);
        console.log(`   Stats: ${g.analysisData ? 'Yes' : 'No'}, TeamAStats: ${g.teamAStats ? 'Yes' : 'No'}`);
    });
}

main();
