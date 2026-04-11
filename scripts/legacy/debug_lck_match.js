
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matches = await prisma.match.findMany({
        where: {
            OR: [
                {
                    teamA: { name: { contains: 'Hanwha' } },
                    teamB: { name: { contains: 'DN' } } // DN Freecs
                },
                {
                    teamA: { name: { contains: 'Hanwha' } },
                    teamB: { name: { contains: 'Kwangdong' } } // KDF is sometimes Kwangdong
                }
            ]
        },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    if (matches.length === 0) {
        // Try reverse
        const matches2 = await prisma.match.findMany({
            where: {
                teamB: { name: { contains: 'Dplus' } },
                teamA: { name: { contains: 'Gen.G' } }
            },
            include: { teamA: true, teamB: true, games: true }
        });
        console.log('Found reverse matches:', matches2.length);
        matches.push(...matches2);
    }

    console.log(`Found ${matches.length} matches.`);

    for (const m of matches) {
        console.log(`\nMatch ID: ${m.id} | ${m.teamA.name} vs ${m.teamB.name}`);
        for (const g of m.games) {
            console.log(`  Game ${g.gameNumber}:`);
            console.log(`    Blue Side: ${g.blueSideTeamId}`);
            console.log(`    Red Side: ${g.redSideTeamId}`);
            if (g.analysisData) {
                const data = JSON.parse(g.analysisData);
                if (data.damage_data) {
                    console.log('    Damage Data Teams found:');
                    const teams = new Set(data.damage_data.map(d => d.team));
                    console.log('    ', Array.from(teams));

                    // Detail first item
                    console.log('    Sample Item:', JSON.stringify(data.damage_data[0]));
                } else {
                    console.log('    No damage_data in analysisData');
                }
            } else {
                console.log('    No analysisData');
            }
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
