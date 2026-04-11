const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const updates = [
        { name: 'YINOVA', role: 'TOP' },
        { name: 'GLFS', role: 'JUNGLE' },
        { name: 'SINIAN', role: 'MID' },
        { name: 'THEHANG', role: 'ADC' },
        { name: 'WUNAI3', role: 'SUPPORT' }
    ];

    for (const u of updates) {
        // Try exact match first
        let res = await prisma.player.updateMany({
            where: { name: u.name },
            data: { role: u.role }
        });

        // If not found, might be uppercase/lowercase diff
        if (res.count === 0) {
            res = await prisma.player.updateMany({
                where: { name: u.name.toLowerCase() },
                data: { role: u.role }
            });
        }
        if (res.count === 0) {
            // Capitalized
            const cap = u.name.charAt(0) + u.name.slice(1).toLowerCase();
            res = await prisma.player.updateMany({
                where: { name: cap },
                data: { role: u.role }
            });
        }

        console.log(`Updated ${res.count} players finding ${u.name} (Role: ${u.role})`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
