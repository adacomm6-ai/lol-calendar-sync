const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
    console.log("Starting Match Data Audit...");

    // Fetch matches with games
    const matches = await prisma.match.findMany({
        where: {
            status: 'FINISHED',
            games: { some: {} } // Matches that have at least one game
        },
        include: {
            teamA: { include: { players: true } },
            teamB: { include: { players: true } },
            games: true
        },
        orderBy: { startTime: 'desc' },
        take: 50 // Check last 50 matches for performance
    });

    console.log(`Found ${matches.length} recent matches with data.`);

    const stats = {
        totalGames: 0,
        clean: 0,
        fixedByAlignment: 0,
        hasInvalidIds: 0,
        unfixable: 0
    };

    const report = [];

    for (const match of matches) {
        for (const game of match.games) {
            stats.totalGames++;

            let teamAStats = [];
            let teamBStats = [];
            try {
                teamAStats = JSON.parse(game.teamAStats || '[]');
                teamBStats = JSON.parse(game.teamBStats || '[]');
            } catch (e) {
                continue;
            }

            if (teamAStats.length === 0 && teamBStats.length === 0) continue;

            // Logic from GameSummaryPanel
            let aStatsForA = 0, aStatsForB = 0;
            let bStatsForA = 0, bStatsForB = 0;

            const teamAIds = new Set(match.teamA.players.map(p => p.id));
            const teamBIds = new Set(match.teamB.players.map(p => p.id));

            const teamANames = new Set(match.teamA.players.map(p => p.name.toLowerCase()));
            const teamBNames = new Set(match.teamB.players.map(p => p.name.toLowerCase()));

            const allRosterIds = new Set([...teamAIds, ...teamBIds]);

            let invalidIdCount = 0;

            // Check Team A Stats alignment
            teamAStats.forEach(p => {
                const pId = p.playerId;
                const pName = (p.playerName || p.name || '').toLowerCase();

                if (pId && !allRosterIds.has(pId)) invalidIdCount++;

                if (pId) {
                    if (teamAIds.has(pId)) { aStatsForA += 2; return; }
                    if (teamBIds.has(pId)) { aStatsForB += 2; return; }
                }
                if (pName) {
                    if (teamANames.has(pName)) aStatsForA += 1;
                    else if (teamBNames.has(pName)) aStatsForB += 1;
                }
            });

            // Check Team B Stats alignment
            teamBStats.forEach(p => {
                const pId = p.playerId;
                const pName = (p.playerName || p.name || '').toLowerCase();

                if (pId && !allRosterIds.has(pId)) invalidIdCount++;

                if (pId) {
                    if (teamAIds.has(pId)) { bStatsForA += 2; return; }
                    if (teamBIds.has(pId)) { bStatsForB += 2; return; }
                }
                if (pName) {
                    if (teamANames.has(pName)) bStatsForA += 1;
                    else if (teamBNames.has(pName)) bStatsForB += 1;
                }
            });

            const needsSwap = (aStatsForB > aStatsForA && bStatsForA > bStatsForB);

            if (invalidIdCount > 0) stats.hasInvalidIds++;

            if (needsSwap) {
                stats.fixedByAlignment++;
                report.push(`[Corected] Match ${match.id.substring(0, 8)} Game ${game.gameNumber}: Swapped stats. Invalid IDs: ${invalidIdCount}`);
            } else if (aStatsForA === 0 && aStatsForB === 0 && bStatsForA === 0 && bStatsForB === 0) {
                stats.unfixable++;
                report.push(`[Unfixable] Match ${match.id.substring(0, 8)} Game ${game.gameNumber}: No roster match found.`);
            } else {
                stats.clean++;
            }
        }
    }

    console.log("\n--- Audit Summary ---");
    console.log(`Total Games Analyzed: ${stats.totalGames}`);
    console.log(`Clean (Correctly Aligned): ${stats.clean}`);
    console.log(`Fixed by Smart Alignment: ${stats.fixedByAlignment}`);
    console.log(`Contains Invalid IDs (Would fail w/o fix): ${stats.hasInvalidIds}`);
    console.log(`Unmappable (Unknown Players): ${stats.unfixable}`);

    console.log("\n--- Details ---");
    report.forEach(r => console.log(r));
}

audit()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
