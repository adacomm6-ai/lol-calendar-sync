
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetDateStart = new Date('2026-01-30T00:00:00.000Z');
    const targetDateEnd = new Date('2026-01-30T23:59:59.999Z');

    console.log('Searching for matches between BLG and TES on 2026-01-30...');

    // Find teams first to get IDs
    const blg = await prisma.team.findFirst({ where: { OR: [{ shortName: 'BLG' }, { name: 'Bilibili Gaming' }] } });
    const tes = await prisma.team.findFirst({ where: { OR: [{ shortName: 'TES' }, { name: 'Top Esports' }] } });

    if (!blg || !tes) {
        console.error('Could not find teams BLG or TES');
        return;
    }

    console.log(`BLG ID: ${blg.id}`);
    console.log(`TES ID: ${tes.id}`);

    // Search all matches between these two
    const matches = await prisma.match.findMany({
        where: {
            AND: [
                { OR: [{ teamAId: blg.id }, { teamBId: blg.id }] },
                { OR: [{ teamAId: tes.id }, { teamBId: tes.id }] }
            ]
        },
        include: {
            games: true
        },
        orderBy: { startTime: 'desc' }
    });

    console.log(`Found ${matches.length} matches between BLG and TES.`);

    for (const m of matches) {
        console.log(`\nMatch ID: ${m.id}`);
        console.log(`Date: ${m.startTime}`);
        console.log(`Status: ${m.status}`);
        console.log(`TeamA: ${m.teamAId === blg.id ? 'BLG' : 'TES'} vs TeamB: ${m.teamBId === blg.id ? 'BLG' : 'TES'}`);
        console.log(`WinnerId: ${m.winnerId}`);

        // Check if winnerId matches a team
        const winnerName = m.winnerId ? (m.winnerId === blg.id ? 'BLG' : (m.winnerId === tes.id ? 'TES' : 'Other')) : 'NULL';
        console.log(`Winner Name: ${winnerName}`);

        console.log(`Game Count: ${m.games.length}`);
        m.games.forEach(g => {
            console.log(`  Game ${g.gameNumber}: Winner=${g.winnerId}`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
