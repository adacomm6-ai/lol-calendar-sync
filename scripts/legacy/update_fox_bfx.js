const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Find Team with name containing FEARX or BNK or shortName FOX
    const team = await prisma.team.findFirst({
        where: {
            OR: [
                { name: { contains: 'FEARX' } },
                { shortName: 'FOX' }
            ]
        }
    });

    if (!team) {
        console.log('Team not found.');
        return;
    }

    console.log(`Found Team: ${team.name} (Short: ${team.shortName})`);

    // Update to BFX
    const updated = await prisma.team.update({
        where: { id: team.id },
        data: { shortName: 'BFX' }
    });

    console.log(`Updated Team ${updated.name} shortName to: ${updated.shortName}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
