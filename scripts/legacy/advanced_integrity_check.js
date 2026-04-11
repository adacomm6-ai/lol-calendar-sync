
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function main() {
    console.log('--- Advanced System Health Check ---');

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // 1. Logic Checks: Match Status vs Game Count
    const matches = await prisma.match.findMany({
        include: { games: true, teamA: true, teamB: true }
    });

    let logicErrors = 0;
    console.log(`Scanning ${matches.length} matches for logic errors...`);

    for (const m of matches) {
        // Check 1: FINISHED but no games
        if (m.status === 'FINISHED' && m.games.length === 0) {
            console.warn(`[WARN] Match ${m.id} (${m.teamA.shortName} vs ${m.teamB.shortName}) is FINISHED but has 0 games.`);
            logicErrors++;
        }

        // Check 2: ONGOING but started long ago (> 24h)
        if (m.status === 'ONGOING') {
            const diffHours = (now - new Date(m.startTime)) / (1000 * 60 * 60);
            if (diffHours > 24) {
                console.warn(`[WARN] Match ${m.id} (${m.teamA.shortName} vs ${m.teamB.shortName}) is ONGOING but started ${diffHours.toFixed(1)} hours ago.`);
                logicErrors++;
            }
        }
    }

    if (logicErrors === 0) console.log('[OK] Match Status Logic seems correct.');

    // 2. Data Quality: Unknown Players/Teams in Games
    const games = await prisma.game.findMany({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } // Check games created today first
    });

    console.log(`\nScanning ${games.length} games created Today for Unknown entities...`);

    let qualityIssues = 0;
    for (const g of games) {
        // Parse Analysis Data
        let analysis = null;
        try {
            if (g.analysisData) analysis = JSON.parse(g.analysisData);
            else if (g.teamAStats && g.teamBStats) {
                analysis = { damage_data: [...JSON.parse(g.teamAStats), ...JSON.parse(g.teamBStats)] };
            }
        } catch (e) {
            console.error(`[ERR] Failed to parse data for Game ${g.id}`);
            qualityIssues++;
            continue;
        }

        if (analysis && analysis.damage_data) {
            const unknownPlayers = analysis.damage_data.filter(p => !p.name || p.name === 'Unknown' || p.hero === 'Unknown');
            if (unknownPlayers.length > 0) {
                console.warn(`[WARN] Game ${g.id} (Game ${g.gameNumber}) contains ${unknownPlayers.length} incomplete player records.`);
                unknownPlayers.forEach(p => console.log(`      - Name: ${p.name}, Hero: ${p.hero}`));
                qualityIssues++;
            }
        }
    }

    if (qualityIssues === 0) console.log('[OK] Recent game data quality looks good (No "Unknown" players found).');


    // 3. Comments Check
    const comments = await prisma.comment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log(`\nLatest 5 Comments Check:`);
    comments.forEach(c => {
        console.log(`[${c.createdAt.toISOString()}] Game ${c.gameNumber}: ${c.content.substring(0, 30)}...`);
    });

}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
