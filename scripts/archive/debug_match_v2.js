
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Searching for ALL matches between IG and TES...");
    const matches = await prisma.match.findMany({
        where: {
            AND: [
                {
                    teamA: {
                        name: { contains: 'Invictus' }
                    }
                },
                {
                    teamB: {
                        name: { contains: 'Top' }
                    }
                }
            ]
        },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    // Also try swapped info
    const matchesSwapped = await prisma.match.findMany({
        where: {
            AND: [
                {
                    teamA: {
                        name: { contains: 'Top' }
                    }
                },
                {
                    teamB: {
                        name: { contains: 'Invictus' }
                    }
                }
            ]
        },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    const allMatches = [...matches, ...matchesSwapped];

    if (allMatches.length === 0) {
        console.log("No matches found.");
        return;
    }

    console.log(`Found ${allMatches.length} matches.`);

    allMatches.forEach(m => {
        console.log(`\n------------------------------------------------`);
        console.log(`Match ID: ${m.id}`);
        console.log(`Format: ${m.format}`);
        console.log(`Teams: ${m.teamA.name} vs ${m.teamB.name}`);
        console.log(`Status: ${m.status}`);
        console.log(`Games Count: ${m.games.length}`);

        m.games.sort((a, b) => a.gameNumber - b.gameNumber).forEach(g => {
            let parsed = null;
            if (g.analysisData) {
                try { parsed = JSON.parse(g.analysisData); } catch (e) { }
            }
            console.log(`  Game ${g.gameNumber} (ID: ${g.id})`);
            console.log(`    - Has Analysis Data: ${!!g.analysisData}`);
            console.log(`    - Winner ID: ${g.winnerId}`);
            console.log(`    - Kills: ${g.blueKills} (B) vs ${g.redKills} (R)`);
        });
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
