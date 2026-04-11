const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("🧹 Starting Schedule Deduplication...");

    // Fetch matches in Dec/Jan window
    const matches = await prisma.match.findMany({
        where: {
            startTime: {
                gte: new Date('2025-12-01T00:00:00Z'),
                lt: new Date('2026-02-01T00:00:00Z')
            }
        },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    const getPairKey = (t1, t2) => {
        const names = [t1, t2].sort();
        return `${names[0]}_vs_${names[1]}`;
    };

    const grouped = new Map();
    for (const m of matches) {
        // Exclude LPL Split 1 if it appears here?
        // User wants to clean "Demacia Cup" redundant ones. 
        // If an LPL match happens to be same pair and empty?
        // Usually LPL matches have specific tournament tag.
        // Let's rely on the fact that redundant ones are likely from my recent seeding vs old data.
        if (m.tournament && m.tournament.includes("LPL")) continue;

        const key = getPairKey(m.teamA.id, m.teamB.id);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(m);
    }

    let deletedCount = 0;

    for (const [key, group] of grouped) {
        if (group.length > 1) {
            // Sort by Data Score
            const sorted = group.sort((a, b) => {
                const scoreA = calculateScore(a);
                const scoreB = calculateScore(b);
                return scoreB - scoreA; // Descending
            });

            const keeper = sorted[0];
            const victims = sorted.slice(1);

            console.log(`\nProcessing ${keeper.teamA.name} vs ${keeper.teamB.name}:`);
            console.log(`   ✅ KEEP: ${keeper.id} (Date: ${keeper.startTime.toISOString().split('T')[0]}, Score: ${calculateScore(keeper)})`);

            for (const v of victims) {
                console.log(`   ❌ DELETE: ${v.id} (Date: ${v.startTime.toISOString().split('T')[0]}, Score: ${calculateScore(v)})`);

                // Delete
                // Delete games first if cascade not set (though usually cascade is set)
                // We'll try delete match directly.
                try {
                    // Start transaction? Or just delete.
                    // Check for games
                    if (v.games.length > 0) {
                        await prisma.game.deleteMany({ where: { matchId: v.id } });
                    }
                    await prisma.match.delete({ where: { id: v.id } });
                    deletedCount++;
                } catch (e) {
                    console.error(`      Failed to delete ${v.id}: ${e.message}`);
                }
            }
        }
    }

    console.log(`\n✨ Deduplication Complete. Deleted ${deletedCount} matches.`);
}

function calculateScore(match) {
    return match.games.reduce((acc, g) => {
        let score = 0;
        if (g.analysisData) score += 10;
        if (g.manualGameInfo) score += 5;
        // Also check if result is set?
        if (g.winnerId) score += 1;
        return acc + score;
    }, 0);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
