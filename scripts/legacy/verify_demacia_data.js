
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function verifyData() {
    try {
        console.log("Fetching Demacia Cup 2026 Matches...");

        // Fetch matches that might be related. 
        const matches = await prisma.match.findMany({
            where: {
                OR: [
                    { tournament: { contains: 'Demacia' } },
                    { tournament: { contains: '德玛西亚' } },
                    { tournament: { contains: '2026' } } // Broaden search
                ]
            },
            include: {
                games: true,
                teamA: true,
                teamB: true
            },
            orderBy: { startTime: 'desc' }
        });

        console.log(`Found ${matches.length} matches.`);

        const issues = [];
        const matchSignatures = new Set();

        for (const match of matches) {
            // DUPLICATE CHECK
            const sig = `${match.teamAId}-${match.teamBId}-${new Date(match.startTime).toISOString().slice(0, 10)}`; // Duplicate if same teams same day
            if (matchSignatures.has(sig)) {
                issues.push(`POTENTIAL DUPLICATE MATCH: ${match.teamA.name} vs ${match.teamB.name} on ${match.startTime} (ID: ${match.id})`);
            }
            matchSignatures.add(sig);

            // Basic Info
            // console.log(`\nMatch: ${match.teamA.name} vs ${match.teamB.name} [${match.stage}] - ${match.status} (ID: ${match.id})`);

            // GAME CHECKS
            for (const game of match.games) {
                // 1. Zero Stats Check
                if (game.totalKills === 0 && game.winnerId) {
                    issues.push(`Match ${match.id} (${match.teamA.name} vs ${match.teamB.name}) Game ${game.gameNumber}: Total Kills is 0.`);
                }

                // 2. Side Intregrity
                if (!game.blueSideTeamId || !game.redSideTeamId) {
                    issues.push(`Match ${match.id} (${match.teamA.name} vs ${match.teamB.name}) Game ${game.gameNumber}: Missing Side Team IDs.`);
                }
            }
        }

        console.log("\n---------------------------------------------------");
        console.log("AUDIT REPORT SUMMARY");
        console.log("---------------------------------------------------");

        if (issues.length === 0) {
            console.log("No obvious data anomalies found.");
        } else {
            console.log(`Found ${issues.length} potential issues:`);
            issues.forEach((issue, idx) => console.log(`${idx + 1}. ${issue}`));
        }

    } catch (e) {
        console.error("Error verifying data:", e);
    } finally {
        await prisma.$disconnect();
    }
}

verifyData();
