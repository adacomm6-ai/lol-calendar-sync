const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        let p = await prisma.player.findFirst({ where: { name: 'JIAQI' } });
        if (!p) {
            console.log("JIAQI not found, listing TES players...");
            const tes = await prisma.team.findFirst({ where: { shortName: 'TES' }, include: { players: true } });
            console.log("TES Players:", tes.players.map(pl => pl.name));
            p = tes.players.find(pl => pl.name.toUpperCase() === 'JIAQI');
        }
        console.log('Player Found:', p);
        if (p) {
            console.log('Split:', p.split);
            // Also Check if he has any Matches in Split 1
            const games = await prisma.game.count({
                where: {
                    match: { tournament: { contains: 'Split 1' } },
                    analysisData: { contains: 'Jiaqi' } // Loose check
                }
            });
            console.log('Games in Split 1 (approx):', games);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
