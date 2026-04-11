
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function main() {
    console.log('Fixing WEI stats for IG vs JDG matches...');

    // We look for matches between IG and JDG around Jan 3 2026.
    // Match IDs might be stable, but let's find by teams.

    const matches = await prisma.match.findMany({
        where: {
            OR: [
                { teamA: { name: 'Invictus Gaming' }, teamB: { name: 'JD Gaming' } },
                { teamA: { name: 'JD Gaming' }, teamB: { name: 'Invictus Gaming' } }
            ],
            startTime: {
                gte: new Date('2026-01-01'),
                lte: new Date('2026-01-10')
            }
        },
        include: {
            games: true,
            teamA: true,
            teamB: true
        }
    });

    if (matches.length === 0) {
        console.log('No IG vs JDG match found.');
        return;
    }

    const match = matches[0]; // Assuming only one series (Finals)
    console.log(`Found match: ${match.id} (Games: ${match.games.length})`);

    // Target Stats (from User Image)
    // Game 3: Wei (JarvanIV, 2/4/9)
    // Game 2: Wei (Qiyana, 15/2/8)
    // Game 1: Wei (Ambessa, 9/0/4)

    const updates = [
        { gameNumber: 1, hero: 'Ambessa', k: 9, d: 0, a: 4 },
        { gameNumber: 2, hero: 'Qiyana', k: 15, d: 2, a: 8 },
        { gameNumber: 3, hero: 'JarvanIV', k: 2, d: 4, a: 9 },
    ];

    for (const update of updates) {
        const game = match.games.find(g => g.gameNumber === update.gameNumber);
        if (!game) {
            console.log(`Game ${update.gameNumber} not found.`);
            continue;
        }

        // Parse teamAStats/teamBStats/analysisData to find WEI
        // Wei is on IG. IG is likely Blue or Red.
        // In G1, IG was Blue (per search result: IG banned first?).
        // Search result: "IG banned Jayce..." -> usually Blue side?
        // Let's check team IDs.

        // We update both stats arrays to be safe, searching for "Wei".
        const updateStats = (statsStr) => {
            if (!statsStr) return statsStr;
            try {
                const stats = JSON.parse(statsStr);
                let updated = false;
                const newStats = stats.map(p => {
                    const name = p.name || p.player_name;
                    if (name && (name.toLowerCase() === 'wei' || name.toLowerCase().includes('wei'))) {
                        console.log(`Updating Wei in Game ${update.gameNumber}: ${update.hero} ${update.k}/${update.d}/${update.a}`);
                        // Preserve damage if exists, else keep existing or invalid
                        // If existing hero is Unknown, update it.
                        updated = true;
                        return {
                            ...p,
                            hero: update.hero,
                            kills: update.k,
                            deaths: update.d,
                            assists: update.a,
                            // If damage is 0, we leave it 0 unless we have data (we don't)
                        };
                    }
                    return p;
                });
                if (updated) return JSON.stringify(newStats);
                return statsStr;
            } catch (e) {
                return statsStr;
            }
        };

        const newTeamA = updateStats(game.teamAStats);
        const newTeamB = updateStats(game.teamBStats);
        let newAnalysis = game.analysisData;

        if (newAnalysis) {
            try {
                const ana = JSON.parse(newAnalysis);
                if (ana.damage_data) {
                    // Update inside damage_data array
                    ana.damage_data = JSON.parse(updateStats(JSON.stringify(ana.damage_data)));
                    newAnalysis = JSON.stringify(ana);
                }
            } catch (e) { }
        }

        await prisma.game.update({
            where: { id: game.id },
            data: {
                teamAStats: newTeamA,
                teamBStats: newTeamB,
                analysisData: newAnalysis
            }
        });
    }
}

main();
