const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectMatch() {
    try {
        const matchId = '72ed915f-0e8d-4516-9f2e-b3886fd60767';
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { games: true, teamA: true, teamB: true }
        });

        if (!match) {
            console.log("Match not found");
            return;
        }

        console.log(`Match: ${match.teamA.name} (${match.teamAId}) vs ${match.teamB.name} (${match.teamBId})`);
        console.log(`Status: ${match.status}, Winner: ${match.winnerId}`);

        console.log("\nGames:");
        match.games.forEach(g => {
            console.log(`Game ${g.gameNumber} (ID: ${g.id})`);
            console.log(`  WinnerId: ${g.winnerId}`);
            console.log(`  Duration: ${g.duration}`);
            console.log(`  BlueSide: ${g.blueSideTeamId}, RedSide: ${g.redSideTeamId}`);

            let winnerName = "None";
            if (g.winnerId === match.teamAId) winnerName = "Team A (IG)";
            else if (g.winnerId === match.teamBId) winnerName = "Team B (LNG)";
            else winnerName = "Unknown/Mismatch";

            console.log(`  Winner Resolved: ${winnerName}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

inspectMatch();
