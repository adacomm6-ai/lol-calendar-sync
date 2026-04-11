const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const players = await prisma.player.findMany({
        select: { id: true, name: true, role: true, teamId: true }
    });
    const unknowns = players.filter(p => !p.role || p.role.trim().toUpperCase() === 'UNKNOWN');
    console.log(`Found ${unknowns.length} players with unknown role.`);

    // Sample print
    unknowns.slice(0, 5).forEach(p => console.log(p.name, p.role));
}

main().catch(console.error).finally(() => prisma.$disconnect());
