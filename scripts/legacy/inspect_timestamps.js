const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ids = [
        'f322bc3d-4461-4561-8982-787a238b4777', // Wei
        '147cfd5a-aa87-4116-9fc3-b077f98f2835', // WEI
        '5bae8fb9-bba7-4f02-be90-3df32f28f59b', // Jwei
        '47aa7dab-49ce-4b70-9a27-bcb2d9768d9b'  // JWEI
    ];

    const players = await prisma.player.findMany({
        where: { id: { in: ids } }
    });

    console.log('--- Duplicate Inspection ---');
    players.forEach(p => {
        console.log(`ID: ${p.id} | Name: ${p.name} | Created: ${p.createdAt} | Updated: ${p.updatedAt}`);
    });
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
