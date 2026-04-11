const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // JDG Core: Xiaoxu, Xun, Yagao, Ruler, MISSING.
    // Extras to remove: JUNJIA, GALA, VAMPIRE.
    // We should verify if HONGQ is legit. User fixed HONGQ earlier intentionally. So Keep HONGQ.

    const team = await prisma.team.findFirst({ where: { shortName: 'JDG' } });
    if (!team) return;

    const removeList = ['JUNJIA', 'GALA', 'VAMPIRE'];

    console.log(`Cleaning JDG Split 1: Removing ${removeList.join(', ')}`);

    const res = await prisma.player.deleteMany({
        where: {
            teamId: team.id,
            split: 'Split 1',
            name: { in: removeList }
        }
    });

    console.log(`Deleted ${res.count} records.`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
