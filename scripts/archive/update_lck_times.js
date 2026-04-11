
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Find upcoming LCK matches
    // User context: "LCK后续" -> future matches.
    // We explicitly look for matches that are LCK and NOT finished.

    const now = new Date();

    console.log('Finding upcoming LCK matches...');

    const matches = await prisma.match.findMany({
        where: {
            // "LCK" can be identified by:
            // - Region filter on teams? (Usually implied)
            // - Tournament name? "LCK"
            // - Team regions?
            OR: [
                { tournament: { contains: 'LCK' } },
                { teamA: { region: 'LCK' } }
            ],
            startTime: {
                gte: now
            },
            status: { not: 'FINISHED' }
        },
        include: {
            teamA: true,
            teamB: true
        }
    });

    console.log(`Found ${matches.length} upcoming LCK matches.`);

    // 2. Identify matches to update
    // Target: Change 15:00 (07:00 UTC) to 16:00 (08:00 UTC).
    // Or maybe just force update all standard matches to 16:00 if they are close?

    // Let's filter for 07:00 UTC matches (15:00 Beijing).
    const targets = matches.filter(m => {
        const h = m.startTime.getUTCHours();
        // 07:00 UTC = 15:00 CN
        // 08:00 UTC = 16:00 CN
        return h === 7;
    });

    console.log(`Found ${targets.length} matches at 15:00 (07:00 UTC) to update.`);
    targets.forEach(m => console.log(`- ${m.startTime.toISOString()} ${m.teamA.name} vs ${m.teamB.name}`));

    if (targets.length === 0) {
        console.log('No matches to update.');
        return;
    }

    // 3. Update
    console.log('Updating...');
    for (const m of targets) {
        const newTime = new Date(m.startTime);
        newTime.setUTCHours(8); // Set to 08:00 UTC (16:00 CN)

        await prisma.match.update({
            where: { id: m.id },
            data: { startTime: newTime }
        });
        console.log(`Updated ${m.id} to ${newTime.toISOString()}`);
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
