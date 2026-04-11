const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Get all players in Demacia Cup
    const demaciaPlayers = await prisma.player.findMany({
        where: { split: '2026 Season Cup' },
        include: { team: true }
    });

    console.log(`Found ${demaciaPlayers.length} players in Demacia Cup.`);

    const missing = [];

    // 2. Check each for Split 1
    for (const p of demaciaPlayers) {
        const split1 = await prisma.player.findFirst({
            where: {
                name: p.name, // strict name match
                teamId: p.teamId, // same team
                split: 'Split 1'
            }
        });

        if (!split1) {
            missing.push({
                team: p.team.shortName,
                name: p.name,
                role: p.role,
                teamId: p.teamId
            });
        }
    }

    // Group by Team
    const byTeam = {};
    for (const m of missing) {
        if (!byTeam[m.team]) byTeam[m.team] = [];
        byTeam[m.team].push(m.name);
    }

    console.log('\n--- Missing Split 1 Profiles ---');
    for (const [team, names] of Object.entries(byTeam)) {
        console.log(`${team}: ${names.join(', ')}`);
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
