const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting Batch Migration for Split 1...');

    // 1. Get Source Players
    const sourcePlayers = await prisma.player.findMany({
        where: { split: '2026 Season Cup' }
    });
    console.log(`Source: ${sourcePlayers.length} players from Demacia Cup.`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const p of sourcePlayers) {
        // 2. Check overlap
        const existing = await prisma.player.findFirst({
            where: {
                name: p.name,
                teamId: p.teamId,
                split: 'Split 1'
            }
        });

        if (existing) {
            skippedCount++;
            continue;
        }

        // 3. Create
        await prisma.player.create({
            data: {
                name: p.name,
                role: p.role,
                teamId: p.teamId,
                split: 'Split 1',
                photo: p.photo
            }
        });
        createdCount++;
    }

    console.log(`Migration Complete.`);
    console.log(`Created: ${createdCount}`);
    console.log(`Skipped (Already Exists): ${skippedCount}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
