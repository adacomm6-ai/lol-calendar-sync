const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    // Delete all "2026 LPL Spring Playoffs" matches (cascade all related records)
    const dupes = await p.match.findMany({
        where: { tournament: '2026 LPL Spring Playoffs' }
    });

    console.log('Found', dupes.length, 'duplicate records to delete:');
    for (const d of dupes) {
        console.log('  Deleting:', d.stage);
        try {
            // Delete all possible child records first
            await p.game.deleteMany({ where: { matchId: d.id } });
            await p.match.delete({ where: { id: d.id } });
        } catch (e) {
            console.log('    Failed, trying with raw SQL...');
            try {
                await p.$executeRawUnsafe('DELETE FROM "Match" WHERE id = $1', d.id);
                console.log('    Deleted via raw SQL');
            } catch (e2) {
                console.log('    Still failed:', e2.message);
            }
        }
    }

    // Verify final state
    const remaining = await p.match.findMany({
        where: {
            tournament: { contains: 'LPL' },
            OR: [
                { stage: { contains: 'Bracket' } },
                { stage: { contains: 'Final' } },
                { stage: { contains: 'Semifinal' } },
                { stage: { contains: 'Playoff' } },
            ]
        },
        select: { tournament: true, stage: true, teamAId: true, teamBId: true, status: true },
        orderBy: { startTime: 'asc' }
    });

    console.log('\nRemaining LPL playoff matches:', remaining.length);
    for (const m of remaining) {
        const tbd = (!m.teamAId || !m.teamBId) ? 'TBD' : 'HAS_TEAMS';
        console.log('  [' + m.status + '] ' + m.tournament + ' | ' + m.stage + ' | ' + tbd);
    }

    await p.$disconnect();
}

main().catch(console.error);
