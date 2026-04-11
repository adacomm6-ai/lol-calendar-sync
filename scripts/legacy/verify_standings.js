const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const region = 'LPL';
    const year = '2026';
    const split = 'Split 1';

    const splitNames = {
        'Split 1': '第一赛季',
        'Split 2': '第二赛季',
        'Split 3': '第三赛季',
    };

    const tournamentFilter = `${year} ${region}${splitNames[split]}`;
    console.log(`Filter: "${tournamentFilter}"`);

    const matches = await prisma.match.findMany({
        where: {
            tournament: { contains: tournamentFilter },
            status: 'COMPLETED'
        },
        include: { games: true }
    });

    console.log(`Found ${matches.length} matches.`);
    matches.forEach(m => {
        console.log(`Match ${m.id}: Winner=${m.winnerId} Games=${m.games.length}`);
    });
}

main();
