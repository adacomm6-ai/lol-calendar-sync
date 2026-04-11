const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    // Check all playoff matches under 2026 LPL第一赛段
    const m = await p.match.findMany({
        where: {
            tournament: { contains: 'LPL' },
            OR: [
                { stage: { contains: 'Bracket' } },
                { stage: { contains: 'Final' } },
                { stage: { contains: 'Semifinal' } },
                { stage: { contains: 'Playoff' } },
            ]
        },
        select: {
            id: true, tournament: true, stage: true,
            teamAId: true, teamBId: true, winnerId: true,
            status: true, startTime: true,
            teamA: { select: { shortName: true } },
            teamB: { select: { shortName: true } }
        },
        orderBy: { startTime: 'asc' }
    });

    console.log('Found ' + m.length + ' LPL playoff matches:');
    for (const x of m) {
        const teamA = x.teamA ? x.teamA.shortName : 'TBD';
        const teamB = x.teamB ? x.teamB.shortName : 'TBD';
        const time = x.startTime ? new Date(x.startTime).toISOString().slice(0, 16) : 'no-time';
        console.log('[' + x.status + '] ' + time + ' | ' + teamA + ' vs ' + teamB + ' | t="' + x.tournament + '" s="' + x.stage + '" winner=' + (x.winnerId ? 'yes' : 'no'));
    }

    await p.$disconnect();
}

main().catch(console.error);
