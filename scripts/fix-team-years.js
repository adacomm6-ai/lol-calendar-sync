const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teams = await prisma.team.findMany();
    console.log(`Checking ${teams.length} teams...`);

    let updatedCount = 0;
    for (const team of teams) {
        const regions = (team.region || '').split(',').map(r => r.trim()).filter(Boolean);

        // If it looks like it's missing a year (2026 or 2027)
        if (!regions.includes('2026') && !regions.includes('2027')) {
            const newRegion = [...regions, '2026'].join(', ');
            await prisma.team.update({
                where: { id: team.id },
                data: { region: newRegion }
            });
            updatedCount++;
            console.log(`Updated ${team.name}: ${team.region} -> ${newRegion}`);
        }
    }

    console.log(`Finished. Updated ${updatedCount} teams.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
