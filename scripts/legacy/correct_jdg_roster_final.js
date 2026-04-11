const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Target JDG Roster:
    // Top: Xiaoxu
    // Jungle: Junjia
    // Mid: Hongq
    // ADC: Gala
    // Sup: Vampire

    // Remove: Ruler, Xun, Yagao, MISSING.

    const team = await prisma.team.findFirst({ where: { shortName: 'JDG' } });
    if (!team) return;

    // 1. Delete Legacy Players
    const legacy = ['Ruler', 'Xun', 'Yagao', 'MISSING', 'Missing'];
    console.log(`Removing legacy players: ${legacy.join(', ')}`);
    await prisma.player.deleteMany({
        where: {
            teamId: team.id,
            split: 'Split 1',
            name: { in: legacy }
        }
    });

    // 2. Ensure Correct Players Exist
    const targets = [
        { name: 'Xiaoxu', role: 'TOP' },
        { name: 'Junjia', role: 'JUNGLE' },
        { name: 'Hongq', role: 'MID' },
        { name: 'Gala', role: 'BOT' },
        { name: 'Vampire', role: 'SUPPORT' }
    ];

    for (const t of targets) {
        // Check if exists (Case insensitive logic handled by finding first and comparing lower?)
        // Or just find exact/similar.
        // My previous delete was strict.

        // Let's rely on exact name creation if missing.
        // First, check if "Gala" or "GALA" exists.
        // I deleted "GALA" (Upper).

        // I will try to find any existing record.
        // Since I can't use 'mode: insensitive', I'll search by standard casing.

        // I'll just create if not found.
        const existing = await prisma.player.findFirst({
            where: {
                teamId: team.id,
                split: 'Split 1',
                name: t.name
            }
        });

        if (!existing) {
            console.log(`Creating ${t.name}...`);
            await prisma.player.create({
                data: {
                    name: t.name,
                    role: t.role,
                    teamId: team.id,
                    split: 'Split 1'
                }
            });
        } else {
            console.log(`${t.name} exists.`);
            // Update role if needed?
        }
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
