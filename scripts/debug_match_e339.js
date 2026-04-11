
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matchId = 'e3398c79-79cb-4e1d-96b9-047a12703666';
    const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    if (!match) {
        console.log('Match not found');
        return;
    }

    console.log(`Match: ${match.teamA.name} (A) vs ${match.teamB.name} (B)`);
    console.log(`TeamA ID: ${match.teamAId}`);
    console.log(`TeamB ID: ${match.teamBId}`);

    for (const game of match.games) {
        console.log(`\n--- Game ${game.gameNumber} ---`);
        console.log(`Blue Side Team ID: ${game.blueSideTeamId}`);
        console.log(`Red Side Team ID: ${game.redSideTeamId}`);

        let statsA, statsB;
        try {
            statsA = JSON.parse(game.teamAStats);
            statsB = JSON.parse(game.teamBStats);
        } catch (e) {
            console.log('Error parsing stats JSON');
            continue;
        }

        console.log('Team A Stats Players:');
        statsA.forEach(p => console.log(`  - ${p.name} (Hero: ${p.hero}, PID: ${p.playerId})`));

        console.log('Team B Stats Players:');
        statsB.forEach(p => console.log(`  - ${p.name} (Hero: ${p.hero}, PID: ${p.playerId})`));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
