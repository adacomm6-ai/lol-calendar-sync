const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Zika (Reference for First Season) ---');
    // Try to find Zika
    const zika = await prisma.player.findMany({
        where: { name: { contains: 'ika' } },
        include: { team: true }
    });
    console.log('Zika Records:', JSON.stringify(zika, null, 2));

    console.log('\n--- Checking HONGQ ---');
    const hongq = await prisma.player.findMany({
        where: { name: { contains: 'hongq' } },
        include: { team: true }
    });
    console.log('HONGQ Records:', JSON.stringify(hongq, null, 2));

    console.log('\n--- Checking JDG Team ---');
    const jdg = await prisma.team.findMany({
        where: {
            OR: [{ name: { contains: 'JDG' } }, { shortName: 'JDG' }]
        }
    });
    console.log('JDG Teams:', JSON.stringify(jdg, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
