const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Find IG
    const ig = await prisma.team.findFirst({ where: { shortName: 'IG' } });
    if (!ig) {
        console.log('IG not found');
        return;
    }

    // 2. Check for Wei (Exact Match)
    const existing = await prisma.player.findFirst({
        where: {
            teamId: ig.id,
            split: 'Split 1',
            name: 'Wei'
        }
    });

    if (existing) {
        console.log(`Wei found: ${existing.name} (${existing.role})`);
        if (existing.role !== 'JUNGLE') {
            await prisma.player.update({ where: { id: existing.id }, data: { role: 'JUNGLE' } });
            console.log('Corrected role to JUNGLE');
        }
    } else {
        console.log('Creating Wei (JUNGLE)...');
        await prisma.player.create({
            data: {
                name: 'Wei',
                role: 'JUNGLE',
                teamId: ig.id,
                split: 'Split 1'
            }
        });
        console.log('Wei restored successfully.');
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
