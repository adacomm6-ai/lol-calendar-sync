
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matches = await prisma.match.findMany({
        where: {
            startTime: {
                gte: new Date('2026-01-19T00:00:00Z'),
                lte: new Date('2026-01-19T23:59:59Z')
            }
        },
        include: {
            games: true,
            teamA: true,
            teamB: true
        }
    });

    for (const m of matches) {
        console.log(`\nMatch ID: ${m.id} (${m.teamA?.shortName} vs ${m.teamB?.shortName})`);
        console.log(`Tournament: ${m.tournament}`);
        for (const g of m.games) {
            console.log(`  Game ${g.gameNumber} (ID: ${g.id})`);
            console.log(`    Blue Team ID: ${g.blueSideTeamId}`);
            console.log(`    Red Team ID: ${g.redSideTeamId}`);

            // Check players in stats
            try {
                const statsA = JSON.parse(g.teamAStats || '[]');
                const statsB = JSON.parse(g.teamBStats || '[]');
                console.log(`    Team A Stats Players: ${statsA.map(p => p.name).join(', ')}`);
                console.log(`    Team B Stats Players: ${statsB.map(p => p.name).join(', ')}`);
            } catch (e) {
                console.log("    Error parsing stats JSON");
            }
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
