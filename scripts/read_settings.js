const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const row = await prisma.systemSettings.findUnique({
        where: { id: 'global' }
    });
    if (row) {
        console.log(JSON.stringify(JSON.parse(row.data), null, 2));
    } else {
        console.log('No settings found');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
