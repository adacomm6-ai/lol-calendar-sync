const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Find Kingen and Clear
    const kingen = await prisma.player.findFirst({
        where: { name: 'Kingen', split: 'Split 1' },
        include: { team: true }
    });
    const clear = await prisma.player.findFirst({
        where: { name: 'Clear', split: 'Split 1' },
        include: { team: true }
    });

    console.log(`Kingen Team: ${kingen?.team?.shortName} (${kingen?.team?.name})`);
    console.log(`Clear Team: ${clear?.team?.shortName} (${clear?.team?.name})`);

    // 2. Fix Rosters if needed
    // User says: BFX Top = Clear, NS Top = Kingen.
    // So Kingen should be NS. Clear should be BFX.

    // Find Teams BFX and NS
    const bfx = await prisma.team.findFirst({ where: { shortName: 'BFX' } });
    const ns = await prisma.team.findFirst({ where: { shortName: 'NS' } }); // Assuming NS shortname is correct

    if (kingen && ns && kingen.teamId !== ns.id) {
        console.log('Moving Kingen to NS...');
        await prisma.player.update({ where: { id: kingen.id }, data: { teamId: ns.id } });
    }

    if (clear && bfx && clear.teamId !== bfx.id) {
        console.log('Moving Clear to BFX...');
        await prisma.player.update({ where: { id: clear.id }, data: { teamId: bfx.id } });
    }

    // 3. Fix Match Sides (Jan 15)
    console.log('Re-evaluating Jan 15 Match Sides...');
    const match = await prisma.match.findFirst({
        where: {
            startTime: {
                gte: new Date('2026-01-15T00:00:00.000Z'),
                lte: new Date('2026-01-15T23:59:59.000Z')
            },
            OR: [
                { teamA: { shortName: 'BFX' } },
                { teamB: { shortName: 'BFX' } }
            ]
        },
        include: { games: true, teamA: true, teamB: true }
    });

    if (match) {
        // Teams
        const teamA = match.teamA;
        const teamB = match.teamB;
        const bfxId = teamA.shortName === 'BFX' ? teamA.id : teamB.id;
        const nsId = teamA.shortName === 'BFX' ? teamB.id : teamA.id;

        for (const game of match.games) {
            let analysis = null;
            try { analysis = JSON.parse(game.analysisData); } catch (e) { }

            if (analysis && analysis.damage_data) {
                const bluePlayers = analysis.damage_data.filter(p => p.team === 'Blue');
                if (bluePlayers.length > 0) {
                    const p1 = (bluePlayers[0].name || '').toLowerCase();
                    console.log(`Game ${game.gameNumber} Blue P1: ${p1}`);

                    if (p1 === 'kingen') {
                        // User says Kingen is NS. So Blue is NS.
                        console.log('=> Blue is NS (Kingen).');
                        await prisma.game.update({ where: { id: game.id }, data: { blueSideTeamId: nsId, redSideTeamId: bfxId } });
                    }
                    else if (p1 === 'clear') {
                        // User says Clear is BFX. So Blue is BFX.
                        console.log('=> Blue is BFX (Clear).');
                        await prisma.game.update({ where: { id: game.id }, data: { blueSideTeamId: bfxId, redSideTeamId: nsId } });
                    }
                }
            }
        }
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
