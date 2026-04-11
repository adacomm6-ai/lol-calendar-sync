const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Inspecting Demacia Cup Matches for Duplicates...");

    // Fetch all matches in the Demacia Cup window (Dec 2025 - Jan 2026)
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

    // Helper: Normalize team pair key
    const getPairKey = (t1, t2) => {
        const names = [t1, t2].sort();
        return `${names[0]}_vs_${names[1]}`;
    };

    const grouped = new Map();

    for (const m of matches) {
        // We only care about redundancy in THIS tournament
        // Some might use "Cup" vs "25-26德玛西亚杯"?
        // Let's grouping by Team Pair.
        const key = getPairKey(m.teamA.id, m.teamB.id);

        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(m);
    }

    let duplicatesFound = 0;

    for (const [key, group] of grouped) {
        if (group.length > 1) {
            console.log(`\n⚠️  Found ${group.length} matches for ${group[0].teamA.name} vs ${group[0].teamB.name}:`);
            duplicatesFound++;

            // Analyze each
            const analyzed = group.map(m => {
                const dataCount = m.games.reduce((acc, g) => {
                    let score = 0;
                    if (g.analysisData) score += 10;
                    if (g.manualGameInfo) score += 5;
                    // Check undefined/generic fields?
                    return acc + score;
                }, 0);

                return {
                    id: m.id,
                    date: m.startTime.toISOString(),
                    stage: m.tournament,
                    gameCount: m.games.length,
                    dataScore: dataCount
                };
            });

            // Sort by Data Score descending
            analyzed.sort((a, b) => b.dataScore - a.dataScore);

            console.table(analyzed);

            // Recommendation
            const keeper = analyzed[0];
            const toDelete = analyzed.slice(1);

            if (toDelete.length > 0) {
                console.log(`   👉 Recommendation: KEEP ${keeper.id} (Score: ${keeper.dataScore}), DELETE ${toDelete.length} others.`);
            }
        }
    }

    if (duplicatesFound === 0) {
        console.log("No duplicates found based on Team Pairs.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
