import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Cleanup mis-targeted games in e3398c79 (Jan 21 match)
    const futureMatchId = 'e3398c79-79cb-4e1d-96b9-047a12703666';
    const deleted = await prisma.game.deleteMany({
        where: { matchId: futureMatchId }
    });
    console.log(`Cleaned up ${deleted.count} games from future match ${futureMatchId}`);

    // 2. We don't need to run merge here, we will update the main script file next.
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
