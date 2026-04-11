const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matches = await prisma.match.findMany({
        include: { games: true, teamA: true, teamB: true }
    });

    for (const match of matches) {
        if (!match.games || match.games.length === 0) continue;

        let winsA = 0;
        let winsB = 0;

        match.games.forEach(g => {
            if (g.winnerId === match.teamAId || g.winnerId === match.teamA.id) winsA++;
            else if (g.winnerId === match.teamBId || g.winnerId === match.teamB.id) winsB++;
            // Check Blue/Red side logic if winnerId is side-based (though previous scripts used TeamID)
            else if (g.winnerId === match.teamA.name) winsA++; // Just in case
            else if (g.winnerId === match.teamB.name) winsB++;
        });

        if (winsA === 0 && winsB === 0) continue;

        let calculatedWinnerId = null;
        if (winsA > winsB) calculatedWinnerId = match.teamAId;
        else if (winsB > winsA) calculatedWinnerId = match.teamBId;

        if (calculatedWinnerId && calculatedWinnerId !== match.winnerId) {
            console.log(`Mismatch Match ${match.id} (${match.teamA.shortName} vs ${match.teamB.shortName})`);
            console.log(`  Current Winner: ${match.winnerId}`);
            console.log(`  Calculated Winner: ${calculatedWinnerId} (Score: ${winsA}-${winsB})`);

            await prisma.match.update({
                where: { id: match.id },
                data: { winnerId: calculatedWinnerId }
            });
            console.log(`  FIXED.`);
        }
    }
}

main();
