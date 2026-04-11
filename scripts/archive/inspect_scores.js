
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matches = await prisma.match.findMany({
        where: { tournament: "2026 德玛西亚杯" },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    console.log(`Current Data for 2026 德玛西亚杯 (${matches.length} matches):`);
    matches.forEach(m => {
        // Calculate score from games
        const winsA = m.games.filter(g => g.winnerId === m.teamAId).length;
        const winsB = m.games.filter(g => g.winnerId === m.teamBId).length;
        console.log(`- ${m.teamA.name} vs ${m.teamB.name}: ${winsA}-${winsB} (Games: ${m.games.length})`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
