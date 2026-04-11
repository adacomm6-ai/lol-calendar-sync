import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const redundancies = ['44aa8933-25c3-4221-9a8b-034113125d84'];

    for (const id of redundancies) {
        // Delete games first
        await prisma.game.deleteMany({ where: { matchId: id } });
        // Delete match
        await prisma.match.delete({ where: { id } });
        console.log(`Deleted redundant match ${id}`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
