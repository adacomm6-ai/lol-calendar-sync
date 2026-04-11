const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teams = await prisma.team.findMany({
        where: { region: 'LPL' },
        include: {
            players: {
                where: { split: 'Split 1' }
            }
        }
    });

    console.log('LPL Split 1 Roster Counts:');
    let bloated = [];

    for (const t of teams) {
        const count = t.players.length;
        if (count > 7) {
            bloated.push(`${t.shortName}: ${count} players`);
            // List names to help diagnosis
            const names = t.players.map(p => p.name).join(', ');
            console.log(`[!] ${t.shortName} has ${count} players: ${names}`);
        } else {
            console.log(`- ${t.shortName}: ${count}`);
        }
    }

    if (bloated.length === 0) {
        console.log('No unusually large rosters found (>7).');
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
