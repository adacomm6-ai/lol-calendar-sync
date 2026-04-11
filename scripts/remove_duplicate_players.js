const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const players = await prisma.player.findMany();

    const map = new Map();
    const toDelete = [];

    for (const player of players) {
        const key = `${player.name}_${player.teamId}`;
        if (map.has(key)) {
            toDelete.push(player.id);
        } else {
            map.set(key, player.id);
        }
    }

    console.log(`Found ${toDelete.length} duplicate players.`);

    if (toDelete.length > 0) {
        const res = await prisma.player.deleteMany({
            where: {
                id: { in: toDelete }
            }
        });
        console.log(`Deleted ${res.count} duplicate players.`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
