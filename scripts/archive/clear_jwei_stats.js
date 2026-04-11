const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matchId = 'cb611377-160e-4da3-a1d1-fcc01cbc01da';
    const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { games: true }
    });

    if (!match) {
        console.log('Match not found');
        return;
    }

    for (const game of match.games) {
        let updated = false;
        let analysis = null;
        try {
            analysis = JSON.parse(game.analysisData || '{}');
        } catch (e) { continue; }

        // Function to clean player list
        const cleanList = (list) => {
            return list.map(p => {
                const name = (p.name || p.player || p.player_name || '').toUpperCase();
                if (name.includes('JWEI')) {
                    // Check if data looks suspicious (same as generic Wei or just reset it)
                    // We'll just reset it to allow manual fix
                    console.log(`Resetting JWEI stats in Game ${game.gameNumber}`);
                    updated = true;
                    return {
                        ...p,
                        hero: 'Unknown',
                        kills: 0,
                        deaths: 0,
                        assists: 0,
                        damage: 0,
                        kda: '0/0/0'
                    };
                }
                return p;
            });
        };

        if (analysis.damage_data) {
            analysis.damage_data = cleanList(analysis.damage_data);
        }

        // Also check legacy formats if necessary, but damage_data is primary

        if (updated) {
            await prisma.game.update({
                where: { id: game.id },
                data: {
                    analysisData: JSON.stringify(analysis)
                }
            });
            console.log(`Updated Game ${game.gameNumber}`);
        }
    }
}

main();
