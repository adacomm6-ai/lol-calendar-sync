import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const targets = [
        { t1: 'JD Gaming', t2: 'EDward Gaming', g: 4 },
        { t1: 'Anyone\'s Legend', t2: 'LGD Gaming', g: 3 },
        { t1: 'Invictus Gaming', t2: 'LNG Esports', g: 3 },
        { t1: 'Invictus Gaming', t2: 'LNG Esports', g: 2 },
        { t1: 'LGD Gaming', t2: 'JD Gaming', g: 3 }
    ];

    console.log("Searching for target games...");

    for (const t of targets) {
        // Find team IDs first to be safe, or search match by name
        // Let's search matches with include
        const matches = await prisma.match.findMany({
            where: {
                OR: [
                    { teamA: { name: t.t1 }, teamB: { name: t.t2 } },
                    { teamA: { name: t.t2 }, teamB: { name: t.t1 } }
                ]
            },
            include: { games: true, teamA: true, teamB: true }
        });

        for (const m of matches) {
            const game = m.games.find(g => g.gameNumber === t.g);
            if (game) {
                console.log(`FOUND: ${m.teamA?.name} vs ${m.teamB?.name} (G${t.g})`);
                console.log(`  Game ID: ${game.id}`);
                console.log(`  Screenshot: ${game.screenshot || 'NULL'}`);
                // Check hero data sample
                if (game.analysisData) {
                    const d = JSON.parse(game.analysisData);
                    const heroes = (d.damage_data || []).map((p: any) => p.hero).join(', ');
                    console.log(`  Heroes: ${heroes}`);
                }
            }
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
