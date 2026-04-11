
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSplits() {
    // 1. Count current state
    const players = await prisma.player.groupBy({
        by: ['split', 'teamId'],
        _count: { id: true }
    });

    console.log("Current Split Distribution:");
    const tallies = {};
    players.forEach(p => {
        const s = p.split || 'Unknown';
        tallies[s] = (tallies[s] || 0) + p._count.id;
    });
    console.log(tallies);

    // 2. Find Teams playing in "2026 LPL第一赛段"
    const split1Matches = await prisma.match.findMany({
        where: {
            OR: [
                { tournament: { contains: 'LPL第一赛段' } },
                { tournament: { contains: 'Split 1' } }
            ]
        },
        select: { teamAId: true, teamBId: true, tournament: true }
    });

    const activeTeamIds = new Set();
    let isLPL = false;
    split1Matches.forEach(m => {
        activeTeamIds.add(m.teamAId);
        activeTeamIds.add(m.teamBId);
        if (m.tournament.includes('LPL')) isLPL = true;
    });

    console.log(`Found ${activeTeamIds.size} active teams in Split 1.`);

    // 3. Find Players in these teams who are currently "Cup"
    const targetPlayers = await prisma.player.findMany({
        where: {
            teamId: { in: Array.from(activeTeamIds) },
            OR: [
                { split: { contains: 'Cup' } },
                { split: { contains: '杯' } },
                { split: { contains: 'Demacia' } }
            ]
        }
    });

    console.log(`Found ${targetPlayers.length} players to migrate from Cup -> Split 1.`);

    // 4. Update them
    if (targetPlayers.length > 0) {
        // We set them to "2026 LPL第一赛段" (Assuming most are LPL if the matches found are LPL).
        // If mixed LCK/LPL, we need to be careful.
        // Let's check region via team?

        for (const p of targetPlayers) {
            // Determine target split based on Team Region?
            // Or just generic logic: if Cup -> 2026 LPL Split 1?
            // Actually, querying team region is safer.
        }

        // Optimized: Update many by ID? No, safer loop.
        const teams = await prisma.team.findMany({ where: { id: { in: Array.from(activeTeamIds) } } });
        const teamRegionMap = {};
        teams.forEach(t => teamRegionMap[t.id] = t.region);

        let updated = 0;
        for (const p of targetPlayers) {
            const region = teamRegionMap[p.teamId] || 'LPL';
            let newSplit = '2026 LPL第一赛段';
            if (region === 'LCK') newSplit = '2026 LCK第一赛段';

            // Only update if not already set
            if (p.split !== newSplit) {
                await prisma.player.update({
                    where: { id: p.id },
                    data: { split: newSplit }
                });
                updated++;
            }
        }
        console.log(`Updated ${updated} players.`);
    }
}

fixSplits()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
