const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const res = await prisma.match.updateMany({
        where: { status: 'COMPLETED' },
        data: { status: 'FINISHED' }
    });
    console.log(`Updated ${res.count} matches from COMPLETED to FINISHED.`);
}

main();
