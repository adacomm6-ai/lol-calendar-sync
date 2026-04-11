const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Match Data
// Format: Date, TeamA, TeamB, ScoreA, ScoreB, Stage
const matches = [
    // Quarters
    { date: '2025-12-28T17:00:00Z', teamA: 'LGD', teamB: 'AL', scoreA: 3, scoreB: 0, stage: '25-26德玛西亚杯' },
    { date: '2025-12-28T19:00:00Z', teamA: 'JDG', teamB: 'EDG', scoreA: 3, scoreB: 1, stage: '25-26德玛西亚杯' },
    { date: '2025-12-29T17:00:00Z', teamA: 'IG', teamB: 'TES', scoreA: 3, scoreB: 1, stage: '25-26德玛西亚杯' },
    { date: '2025-12-29T19:00:00Z', teamA: 'LNG', teamB: 'OMG', scoreA: 3, scoreB: 2, stage: '25-26德玛西亚杯' },
    // Semis
    { date: '2026-01-01T17:00:00Z', teamA: 'JDG', teamB: 'LGD', scoreA: 3, scoreB: 0, stage: '25-26德玛西亚杯' },
    { date: '2026-01-01T19:00:00Z', teamA: 'IG', teamB: 'LNG', scoreA: 3, scoreB: 0, stage: '25-26德玛西亚杯' },
    // Final
    { date: '2026-01-03T17:00:00Z', teamA: 'IG', teamB: 'JDG', scoreA: 3, scoreB: 0, stage: '25-26德玛西亚杯' }
];

async function main() {
    console.log("🌱 Seeding Demacia Cup Knockout Matches...");

    // 1. Resolve Teams
    const teams = await prisma.team.findMany();
    const teamMap = new Map();
    teams.forEach(t => {
        teamMap.set(t.name.toUpperCase(), t.id);
        if (t.shortName) teamMap.set(t.shortName.toUpperCase(), t.id);
    });

    for (const m of matches) {
        const teamAId = teamMap.get(m.teamA);
        const teamBId = teamMap.get(m.teamB);

        if (!teamAId || !teamBId) {
            console.error(`❌ Could not find team IDs for ${m.teamA} vs ${m.teamB}`);
            continue;
        }

        // Check if exists
        const exists = await prisma.match.findFirst({
            where: {
                teamAId,
                teamBId,
                startTime: new Date(m.date)
            }
        });

        if (exists) {
            console.log(`⚠️ Match ${m.teamA} vs ${m.teamB} already exists.`);
            continue;
        }

        console.log(`Creating Match: ${m.teamA} vs ${m.teamB} (${m.scoreA}-${m.scoreB})`);

        // Create Match
        const newMatch = await prisma.match.create({
            data: {
                startTime: new Date(m.date),
                teamAId,
                teamBId,
                tournament: m.stage,
                stage: "Knockout",
                format: "BO5",
                status: "FINISHED"
            }
        });

        // Create Games (Winner set by score)
        const totalGames = m.scoreA + m.scoreB;
        // Logic to assign winners match the score (e.g. if 3-0, A wins 3)
        // Order: A wins first scoreA games? Or random? 
        // Let's assume A wins first M games if scoreA > scoreB? No, realistically spread.
        // But for seeding empty games, we just need to ensure Count is correct.
        // Let's alternate or just fill. BO5 usually ends when one reaches 3.

        let winsA = 0;
        let winsB = 0;

        for (let i = 1; i <= totalGames; i++) {
            let winnerId = null;
            if (winsA < m.scoreA) {
                winnerId = teamAId;
                winsA++;
            } else {
                winnerId = teamBId;
                winsB++;
            }

            // Game
            await prisma.game.create({
                data: {
                    matchId: newMatch.id,
                    gameNumber: i,
                    winnerId: winnerId,
                    blueSideTeamId: (i % 2 !== 0) ? teamAId : teamBId, // Alternate sides
                    redSideTeamId: (i % 2 !== 0) ? teamBId : teamAId,
                    duration: 1800 // default
                }
            });
        }
    }
    console.log("✅ Seeding Complete.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
