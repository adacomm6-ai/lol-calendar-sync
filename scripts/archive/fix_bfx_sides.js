const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Find Match (Jan 15, BFX vs NS)
    const matches = await prisma.match.findMany({
        where: {
            startTime: {
                gte: new Date('2026-01-15T00:00:00.000Z'),
                lte: new Date('2026-01-15T23:59:59.000Z')
            },
            OR: [
                { teamA: { name: { contains: 'FEARX' } } },
                { teamB: { name: { contains: 'FEARX' } } }
            ]
        },
        include: { teamA: true, teamB: true, games: true }
    });

    if (matches.length === 0) {
        console.log('No matches found.');
        return;
    }

    const match = matches[0];
    console.log(`Match: ${match.teamA.name} vs ${match.teamB.name}`);

    const teamA = match.teamA;
    const teamB = match.teamB;

    console.log(`Team A: ${teamA.name} (${teamA.id})`);
    console.log(`Team B: ${teamB.name} (${teamB.id})`);

    // 2. Iterate Games and Fix Sides
    // Logic: Look at analysisData or some fallback?
    // Actually, based on screenshot:
    // G1 (Game Number 1?): Left is Kingen (BFX). So Blue = BFX.
    // G2 (Game Number 2?): Left is Clear (NS). So Blue = NS.

    // We can also check existing analysisData string to see players... 
    // But simplistic approach:

    for (const game of match.games) {
        console.log(`Game ${game.gameNumber}: Current Blue=${game.blueSideTeamId}, Red=${game.redSideTeamId}`);

        let newBlueId = null;
        let newRedId = null;

        // Naive assumption based on screenshot order, but risky if game numbers differ.
        // Let's check teamAStats/teamBStats or analysisData content.
        let analysis = null;
        try { analysis = JSON.parse(game.analysisData); } catch (e) { }

        if (analysis) {
            // Check first player of 'Blue' team in analysis
            const bluePlayers = analysis.damage_data?.filter(p => p.team === 'Blue') || [];
            if (bluePlayers.length > 0) {
                const p1 = bluePlayers[0].name || bluePlayers[0].player_name;
                console.log(`  Analysis Blue Player 1: ${p1}`);

                // Kingen/Sponge/Scout/Taeyoon/Lehends => BFX
                // Clear/Raptor/Vicla/Diablo/Taeyoon? => NS

                const isBfxPlayer = (name) => ['kingen', 'sponge', 'scout', 'taeyoon', 'lehends'].includes(name.toLowerCase());
                const isNsPlayer = (name) => ['clear', 'raptor', 'vicla', 'jiwoo', 'peter', 'diablo', 'kellin'].includes(name.toLowerCase());

                if (isBfxPlayer(p1)) {
                    console.log(`  => Blue is BFX.`);
                    // Find BFX ID
                    const bfxId = teamA.name.includes('FEARX') ? teamA.id : teamB.id;
                    const nsId = teamA.name.includes('FEARX') ? teamB.id : teamA.id;
                    newBlueId = bfxId;
                    newRedId = nsId;
                } else if (isNsPlayer(p1)) {
                    console.log(`  => Blue is NS.`);
                    const nsId = teamA.name.includes('FEARX') ? teamB.id : teamA.id;
                    const bfxId = teamA.name.includes('FEARX') ? teamA.id : teamB.id;
                    newBlueId = nsId;
                    newRedId = bfxId;
                } else {
                    console.log(`  => Unknown player: ${p1}`);
                }
            } else {
                // Fallback: Check Team A Stats string?
                console.log('  No explicit Blue players in analysis.');
            }
        }

        if (newBlueId && newRedId) {
            await prisma.game.update({
                where: { id: game.id },
                data: { blueSideTeamId: newBlueId, redSideTeamId: newRedId }
            });
            console.log(`  Updated Game ${game.gameNumber} sides.`);
        }
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
