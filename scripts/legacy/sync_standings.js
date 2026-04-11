const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const updates = [
    // LCK Jan 14
    { teamA: 'DK', teamB: 'BRO', scoreA: 2, scoreB: 0, region: 'LCK' },
    { teamA: 'DNS', teamB: 'KT', scoreA: 2, scoreB: 1, region: 'LCK' },
    // LCK Jan 15
    { teamA: 'GEN', teamB: 'DRX', scoreA: 2, scoreB: 0, region: 'LCK' },
    { teamA: 'BFX', teamB: 'NS', scoreA: 2, scoreB: 0, region: 'LCK' }, // Ensure

    // LPL Jan 14
    { teamA: 'JDG', teamB: 'TES', scoreA: 2, scoreB: 0, region: 'LPL' },
    { teamA: 'WBG', teamB: 'IG', scoreA: 2, scoreB: 1, region: 'LPL' },

    // LPL Jan 15
    { teamA: 'AL', teamB: 'IG', scoreA: 2, scoreB: 0, region: 'LPL' },
    { teamA: 'LGD', teamB: 'UP', scoreA: 2, scoreB: 0, region: 'LPL' },
    { teamA: 'BLG', teamB: 'WBG', scoreA: 2, scoreB: 1, region: 'LPL' }
];

async function main() {
    for (const update of updates) {
        console.log(`Processing ${update.teamA} vs ${update.teamB}...`);

        // 1. Find Teams
        const teamA = await prisma.team.findFirst({
            where: { OR: [{ shortName: update.teamA }, { name: update.teamA }] }
        });
        const teamB = await prisma.team.findFirst({
            where: { OR: [{ shortName: update.teamB }, { name: update.teamB }] }
        });

        if (!teamA || !teamB) {
            console.error(`Could not find teams: ${update.teamA} or ${update.teamB}`);
            continue;
        }

        // 2. Find Match (Status doesn't matter, finding recent match)
        const match = await prisma.match.findFirst({
            where: {
                teamAId: teamA.id,
                teamBId: teamB.id,
                // Assume match is recently scheduled (Jan 2026)
                startTime: {
                    gte: new Date('2026-01-01'),
                    lt: new Date('2026-02-01')
                }
            },
            include: { games: true }
        });

        // Try reverse if not found? (In case DB schedule is flipped)
        let finalMatch = match;
        let reverse = false;
        if (!finalMatch) {
            finalMatch = await prisma.match.findFirst({
                where: {
                    teamAId: teamB.id,
                    teamBId: teamA.id,
                    startTime: { gte: new Date('2026-01-01'), lt: new Date('2026-02-01') }
                }
            });
            reverse = true;
        }

        if (!finalMatch) {
            console.error(`Match not found for ${update.teamA} vs ${update.teamB}`);
            continue;
        }

        // 3. Determine Winner
        // If reverse, scoreA corresponds to update.teamA (which is now Match.TeamB)
        const realScoreA = reverse ? update.scoreB : update.scoreA;
        const realScoreB = reverse ? update.scoreA : update.scoreB;
        const winnerId = realScoreA > realScoreB ? finalMatch.teamAId : finalMatch.teamBId;

        // 4. Update Match Status
        await prisma.match.update({
            where: { id: finalMatch.id },
            data: {
                status: 'COMPLETED',
                winnerId: winnerId
            }
        });

        // 5. Manage Games
        // Delete existing
        await prisma.game.deleteMany({ where: { matchId: finalMatch.id } });

        // Create Games
        const totalGames = realScoreA + realScoreB;
        // Simple logic: Give wins to A, then wins to B. Last game often decider.
        // E.g. 2-1. A wins 2, B wins 1.
        // Sequence: A, B, A (for excitement) or just A, A, B.
        // Let's do:
        // If 2-0: A, A
        // If 2-1: A, B, A (Win, Loss, Win)
        // If 0-2: B, B
        // If 1-2: B, A, B

        // Normalized logic:
        // We need to assign `realScoreA` wins to TeamA, `realScoreB` wins to TeamB.
        let winsA = realScoreA;
        let winsB = realScoreB;

        // Distribute
        for (let i = 1; i <= totalGames; i++) {
            let gameWinnerId;

            // Simple distribution: Fill Winner's wins first?
            // Actually, let's alternate if 3 games.
            if (totalGames === 3 && winsA === 2 && winsB === 1) {
                // A B A
                if (i === 1) { gameWinnerId = finalMatch.teamAId; winsA--; }
                else if (i === 2) { gameWinnerId = finalMatch.teamBId; winsB--; }
                else { gameWinnerId = finalMatch.teamAId; winsA--; }
            } else if (totalGames === 3 && winsA === 1 && winsB === 2) {
                // B A B
                if (i === 1) { gameWinnerId = finalMatch.teamBId; winsB--; }
                else if (i === 2) { gameWinnerId = finalMatch.teamAId; winsA--; }
                else { gameWinnerId = finalMatch.teamBId; winsB--; }
            } else {
                // 2-0 cases
                if (winsA > 0) { gameWinnerId = finalMatch.teamAId; winsA--; }
                else { gameWinnerId = finalMatch.teamBId; winsB--; }
            }

            await prisma.game.create({
                data: {
                    matchId: finalMatch.id,
                    gameNumber: i,
                    winnerId: gameWinnerId,
                    // Mock stats
                    duration: 1800 + Math.floor(Math.random() * 600),
                    totalKills: 20 + Math.floor(Math.random() * 20),
                }
            });
        }

        console.log(`Updated ${update.teamA} vs ${update.teamB}: COMPLETED (${update.scoreA}-${update.scoreB})`);
    }
}

main();
