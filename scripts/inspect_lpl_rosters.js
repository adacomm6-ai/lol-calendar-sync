
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { name: { contains: 'Invictus' } },
                { name: { contains: 'Top Esports' } }
            ]
        },
        include: { players: true }
    });

    for (const team of teams) {
        console.log(`\n=== Team: ${team.name} (${team.shortName}) ID: ${team.id} ===`);

        const sorted = team.players.sort((a, b) => a.name.localeCompare(b.name));

        sorted.forEach(p => {
            console.log(`  ${p.name.padEnd(15)} [${p.role.padEnd(8)}] ID: ${p.id}  Split: ${p.split}`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
