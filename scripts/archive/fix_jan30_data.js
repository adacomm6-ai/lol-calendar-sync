
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Fixing BLG vs TES Match (Jan 30 2026)...');

    // 1. Find Teams
    const blg = await prisma.team.findFirst({ where: { OR: [{ shortName: 'BLG' }, { name: 'Bilibili Gaming' }] } });
    const tes = await prisma.team.findFirst({ where: { OR: [{ shortName: 'TES' }, { name: 'Top Esports' }] } });

    if (!blg || !tes) {
        console.error('Could not find teams BLG or TES');
        return;
    }
    console.log(`BLG: ${blg.id}, TES: ${tes.id}`);

    // 2. Find Match on Jan 30
    const match = await prisma.match.findFirst({
        where: {
            startTime: {
                gte: new Date('2026-01-30T00:00:00.000Z'),
                lte: new Date('2026-01-30T23:59:59.999Z')
            },
            AND: [
                { OR: [{ teamAId: blg.id }, { teamBId: blg.id }] },
                { OR: [{ teamAId: tes.id }, { teamBId: tes.id }] }
            ]
        },
        include: { games: true }
    });

    if (!match) {
        console.error('Match not found on Jan 30!');
        // Ideally we could create it, but better to warn
        return;
    }

    console.log(`Found Match: ${match.id} Status: ${match.status} Winner: ${match.winnerId}`);

    // 3. Update Match Result: TES Wins (2-1)
    console.log('Updating Match Winner to TES...');
    await prisma.match.update({
        where: { id: match.id },
        data: {
            winnerId: tes.id,
            status: 'FINISHED'
        }
    });

    // 4. Update/Create Games (TES 2-1 BLG)
    // Assuming Game 1: TES, Game 2: BLG, Game 3: TES
    const existingGames = await prisma.game.findMany({ where: { matchId: match.id }, orderBy: { gameNumber: 'asc' } });

    const gameResults = [
        { num: 1, winner: tes.id, blue: tes.id, red: blg.id },
        { num: 2, winner: blg.id, blue: blg.id, red: tes.id },
        { num: 3, winner: tes.id, blue: tes.id, red: blg.id }
    ];

    for (const outcome of gameResults) {
        const existing = existingGames.find(g => g.gameNumber === outcome.num);
        if (existing) {
            console.log(`Updating Game ${outcome.num}...`);
            await prisma.game.update({
                where: { id: existing.id },
                data: {
                    winnerId: outcome.winner,
                    // Ensure side teams are set if missing (optional, but good for display)
                    blueSideTeamId: existing.blueSideTeamId || outcome.blue,
                    redSideTeamId: existing.redSideTeamId || outcome.red
                }
            });
        } else {
            console.log(`Creating Game ${outcome.num}...`);
            await prisma.game.create({
                data: {
                    matchId: match.id,
                    gameNumber: outcome.num,
                    winnerId: outcome.winner,
                    blueSideTeamId: outcome.blue,
                    redSideTeamId: outcome.red,
                    duration: 1800 // default 30m
                }
            });
        }
    }

    console.log('Fix Complete! TES 2-1 BLG Recorded.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
