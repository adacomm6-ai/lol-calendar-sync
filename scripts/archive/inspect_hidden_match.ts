import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const id = '1a40f53b-a474-4b93-9f52-d84302fd5ab8'; // From Screenshot URL
    const match = await prisma.match.findUnique({
        where: { id },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    if (!match) {
        console.log("Match not found by ID.");
    } else {
        console.log(`Found Match: ${match.id}`);
        console.log(`  Date: ${match.startTime}`);
        console.log(`  Teams: ${match.teamA?.name || 'TBD'} (ID: ${match.teamAId}) vs ${match.teamB?.name || 'TBD'} (ID: ${match.teamBId})`);
        console.log(`  Status: ${match.status}`);
        console.log(`  Games: ${match.games.length}`);
    }

    // Also check the known "Correct" match for comparison
    const correctId = '5f14585c-760f-45b4-99c8-656a54e543be';
    const matchCorrect = await prisma.match.findUnique({
        where: { id: correctId },
        include: { teamA: true, teamB: true }
    });
    if (matchCorrect) {
        console.log(`\nCorrect Match (Dec 26): ${matchCorrect.id}`);
        console.log(`  Date: ${matchCorrect.startTime}`);
        console.log(`  Teams: ${matchCorrect.teamA?.name || 'TBD'} (ID: ${matchCorrect.teamAId}) vs ${matchCorrect.teamB?.name || 'TBD'} (ID: ${matchCorrect.teamBId})`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
