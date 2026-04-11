const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matchId = '638d79da-2721-4fd8-8d1a-81042f28a0b1';
    // Check games
    const games = await prisma.game.findMany({ where: { matchId } });
    console.log(`Found ${games.length} games for match ${matchId}`);

    // Determine winner (BFX = c1cac45a-2a71-4090-8083-2126878d82f9)
    const bfxId = 'c1cac45a-2a71-4090-8083-2126878d82f9';

    await prisma.match.update({
        where: { id: matchId },
        data: {
            status: 'COMPLETED',
            winnerId: bfxId
        }
    });

    console.log('Match updated to COMPLETED');
}

main();
