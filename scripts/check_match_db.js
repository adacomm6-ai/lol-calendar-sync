const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSpecificMatch() {
    const matchId = 'cf9aae22-8d22-4394-8c6e-9145a6bfa663';
    console.log(`Checking Match: ${matchId}`);

    const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { games: true }
    });

    if (!match) {
        console.log('Match not found!');
        return;
    }

    console.log('Games found:', match.games.length);

    match.games.forEach((g, i) => {
        console.log(`\nGame ${i + 1} (${g.id}):`);
        if (g.teamAStats) {
            const stats = JSON.parse(g.teamAStats);
            console.log('  Team A Players:');
            stats.forEach(p => {
                console.log(`    - ${p.playerName || p.name}: ID=${p.playerId || 'NULL'}`);
            });
        }
    });
}

checkSpecificMatch();
