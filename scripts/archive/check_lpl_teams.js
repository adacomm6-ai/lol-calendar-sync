
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { region: 'LPL' },
                { region: 'LCK' }
            ]
        },
        select: { name: true, region: true, shortName: true }
    });
    console.log(JSON.stringify(teams, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
