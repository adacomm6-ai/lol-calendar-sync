const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { name: { contains: 'LOUD' } },
                { name: { contains: 'Ninjas' } }
            ]
        }
    });
    console.table(teams.map(t => ({ id: t.id, name: t.name })));
}

main().finally(() => prisma.$disconnect());
