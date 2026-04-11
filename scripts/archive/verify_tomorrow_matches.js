const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { addDays, startOfDay, endOfDay } = require('date-fns');

async function verify() {
    try {
        const today = new Date();
        const tomorrow = addDays(today, 1);
        const start = startOfDay(tomorrow);
        const end = endOfDay(tomorrow);

        console.log(`Checking matches between ${start.toISOString()} and ${end.toISOString()}...`);

        const matches = await prisma.match.findMany({
            where: {
                startTime: {
                    gte: start,
                    lte: end
                }
            },
            include: {
                teamA: true,
                teamB: true,
                games: true,
                odds: true
            },
            orderBy: {
                startTime: 'asc'
            }
        });

        console.log(`Found ${matches.length} matches.`);

        for (const m of matches) {
            console.log(`\nMatch: ${m.teamA.name} vs ${m.teamB.name}`);
            console.log(`- Time: ${m.startTime.toLocaleString()}`);
            console.log(`- Games Created: ${m.games.length} (${m.games.map(g => `G${g.gameNumber}`).join(', ')})`);
            console.log(`- Odds Records: ${m.odds.length}`);

            const oddsByGame = {};
            m.odds.forEach(o => {
                if (!oddsByGame[o.gameNumber]) oddsByGame[o.gameNumber] = 0;
                oddsByGame[o.gameNumber]++;
            });

            Object.entries(oddsByGame).forEach(([gameNum, count]) => {
                console.log(`  - Game ${gameNum}: ${count} odds entries`);
            });

            if (m.odds.length === 0) {
                console.warn(`  [WARNING] No odds found for this match!`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
