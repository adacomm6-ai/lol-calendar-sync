
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function inspectDuplicates() {
    try {
        const ids = ['288a4c26-695b-4591-ac89-1c8f6fba728b', 'be3fcc1c-80fd-41ae-81bc-ae7c74ade8a9'];

        for (const id of ids) {
            const m = await prisma.match.findUnique({
                where: { id },
                include: { teamA: true, teamB: true, games: { orderBy: { gameNumber: 'asc' } } }
            });

            if (!m) {
                console.log(`Match ${id} NOT FOUND.`);
                continue;
            }

            console.log(`\n=== MATCH: ${m.teamA.name} vs ${m.teamB.name} (${id}) ===`);
            console.log(`Tournament: ${m.tournament}`);
            console.log(`Stage: ${m.stage}`);
            console.log(`Status: ${m.status}`);
            console.log(`Format: ${m.format}`);
            console.log(`Time: ${m.startTime}`);
            console.log(`Game Count: ${m.games.length}`);

            m.games.forEach(g => {
                console.log(`  Game ${g.gameNumber}:`);
                console.log(`    Sides: Blue=${g.blueSideTeamId} / Red=${g.redSideTeamId}`);
                console.log(`    Winner: ${g.winnerId}`);
                console.log(`    Stats: TotalKills=${g.totalKills}, Duration=${g.duration}`);
                if (g.analysisData) console.log(`    Analysis: ${g.analysisData.substring(0, 50)}...`);
            });
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

inspectDuplicates();
