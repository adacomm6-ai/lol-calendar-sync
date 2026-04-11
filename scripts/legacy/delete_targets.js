const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Deleting duplicate profiles...');

    // 1. Delete Old Wei (f322) - User is using New WEI (147c)
    try {
        await prisma.player.delete({ where: { id: 'f322bc3d-4461-4561-8982-787a238b4777' } });
        console.log('Deleted Old Wei (f322).');
    } catch (e) { console.log('Old Wei already deleted or error:', e.message); }

    // 2. Delete New JWEI (47aa) - User is using Old Jwei (5bae)
    try {
        await prisma.player.delete({ where: { id: '47aa7dab-49ce-4b70-9a27-bcb2d9768d9b' } });
        console.log('Deleted New JWEI (47aa).');
    } catch (e) { console.log('New JWEI already deleted or error:', e.message); }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
