// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const badMatchId = '1a40f53b-a474-4b93-9f52-d84302fd5ab8';
    const badTeamId = '07ba1bb3-08a8-46ca-bc45-8e78d1a8909d'; // The duplicate "TES" team

    // 1. Delete Match and Games
    console.log(`Deleting match ${badMatchId}...`);
    await prisma.game.deleteMany({ where: { matchId: badMatchId } });
    await prisma.match.delete({ where: { id: badMatchId } });

    // 2. Check if Bad Team has other matches
    const count = await prisma.match.count({
        where: {
            OR: [
                { teamAId: badTeamId },
                { teamBId: badTeamId }
            ]
        }
    });

    if (count === 0) {
        console.log(`Deleting redundant duplicate team TES (${badTeamId})...`);
        // Also delete players of this team if any?
        await prisma.player.deleteMany({ where: { teamId: badTeamId } });
        await prisma.team.delete({ where: { id: badTeamId } });
    } else {
        console.log(`Cannot delete team ${badTeamId}, it has ${count} other matches.`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
