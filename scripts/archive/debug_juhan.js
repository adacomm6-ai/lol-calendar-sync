
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkJuhan() {
    // 1. Find Player ID
    const player = await prisma.player.findFirst({
        where: { name: { contains: 'Juhan', mode: 'insensitive' } }
    });

    if (!player) {
        console.log("Player Juhan not found!");
        return;
    }

    console.log(`Found Player: ${player.name} (${player.id})`);

    // 2. Find Games
    // Matches where player is in teamAStats or teamBStats (JSON)
    const games = await prisma.game.findMany({
        include: {
            match: true
        },
        orderBy: {
            match: { startTime: 'desc' }
        }
    });

    console.log(`Total Games Scanned: ${games.length}`);

    let count = 0;
    for (const g of games) {
        const statsA = JSON.parse(g.teamAStats || '[]');
        const statsB = JSON.parse(g.teamBStats || '[]');
        const allStats = [...statsA, ...statsB];

        const text = JSON.stringify(allStats).toLowerCase();
        if (text.includes('juhan')) {
            console.log(`- Match: ${g.match.startTime.toISOString().split('T')[0]} | ${g.match.tournament} | Game ${g.gameNumber}`);
            // Check exact name match in stats
            const pStat = allStats.find(s => (s.player_name || s.name || '').toLowerCase().includes('juhan'));
            if (pStat) {
                console.log(`  > Found Stat Name: "${pStat.player_name || pStat.name}" (Team: ${pStat.team})`);
            }
            count++;
        }
    }
    console.log(`Total Games for Juhan: ${count}`);
}

checkJuhan()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
