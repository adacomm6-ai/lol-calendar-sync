const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const id = '92d2cf16-9868-4a7f-acc2-bb4460f4e75c';
    try {
        console.log('Deleting games for match:', id);
        const games = await prisma.game.deleteMany({ where: { matchId: id } });
        console.log('Deleted games count:', games.count);

        console.log('Deleting match:', id);
        const match = await prisma.match.delete({ where: { id: id } });
        console.log('Deleted match:', match.id);
    } catch (e) {
        console.error('ERROR DELETING:', e);
    }
}

main();
