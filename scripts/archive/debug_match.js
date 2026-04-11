
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Searching for match...");
    const matches = await prisma.match.findMany({
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    const targetMatch = matches.find(m =>
        (m.teamA.name.includes('Top') || m.teamA.name.includes('Invictus')) &&
        (m.teamB.name.includes('Top') || m.teamB.name.includes('Invictus'))
    );

    if (!targetMatch) {
        console.log("Match not found.");
        return;
    }

    console.log(`Found match: ${targetMatch.teamA.name} vs ${targetMatch.teamB.name} (Format: ${targetMatch.format})`);
    console.log(`Match ID: ${targetMatch.id}`);
    console.log(`Games found: ${targetMatch.games.length}`);

    targetMatch.games.sort((a, b) => a.gameNumber - b.gameNumber).forEach(g => {
        console.log(`\nGame ${g.gameNumber} (ID: ${g.id})`);
        console.log(`  - Has Analysis Data: ${g.analysisData ? 'YES (Length: ' + g.analysisData.length + ')' : 'NO'}`);
        console.log(`  - Has Team A Stats: ${g.teamAStats ? 'YES' : 'NO'}`);
        console.log(`  - Duration: ${g.duration}`);

        if (g.analysisData) {
            try {
                const parsed = JSON.parse(g.analysisData);
                console.log(`  - Analysis Valid JSON: YES`);
                console.log(`  - Total Kills: ${parsed.total_kills}`);
            } catch (e) {
                console.log(`  - Analysis Valid JSON: NO (Error: ${e.message})`);
            }
        }
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
