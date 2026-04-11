const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const team = await prisma.team.findFirst({ where: { shortName: 'JDG' } });
    if (!team) return;

    // Find all players named HONGQ (case insensitive to see what we have)
    // Actually, create_hongq_split1.js created 'HONGQ'.
    // correct_jdg_roster_final.js created 'Hongq'.
    // We want to delete the one with name === 'HONGQ'.

    console.log('Deleting duplicate HONGQ (Uppercase)...');
    const res = await prisma.player.deleteMany({
        where: {
            teamId: team.id,
            split: 'Split 1',
            name: 'HONGQ' // Exact match string (if DB is case sensitive or stores it as UPPER)
            // If DB is SQLite and collation is insensitive, this might delete EVERYTHING if I am not careful.
            // But usually `equals` (implicit) works on string value.
            // However, previous errors suggested 'mode: insensitive' isn't supported, 
            // implies default IS insensitive??
            // Wait. If SQLite is default insensitive, then `name: 'HONGQ'` matches `Hongq` too?
            // If so, I might delete BOTH.
        }
    });

    console.log(`Deleted ${res.count} records (HONGQ).`);

    // Check if 'Hongq' is gone?
    const check = await prisma.player.findMany({
        where: { teamId: team.id, split: 'Split 1', name: 'Hongq' }
    });
    console.log(`Remaining Hongq: ${check.length} records.`);

    // If deleted 0 or 2, we have a problem.
    // If I fear deleting both, I should Fetch All, Filter in JS, Delete ID.
}

// Safer approach: Fetch All, Delete ID.
async function safeMain() {
    const team = await prisma.team.findFirst({ where: { shortName: 'JDG' } });
    if (!team) return;

    const players = await prisma.player.findMany({
        where: { teamId: team.id, split: 'Split 1' }
    });

    // Find Duplicate Hongq/HONGQ
    const hongqs = players.filter(p => p.name.toUpperCase() === 'HONGQ');
    console.log(`Found ${hongqs.length} Hongq variations: ${hongqs.map(p => p.name).join(', ')}`);

    // We want to keep 'Hongq'. Delete 'HONGQ'.
    const toDelete = hongqs.filter(p => p.name === 'HONGQ');

    if (toDelete.length > 0) {
        for (const p of toDelete) {
            console.log(`Deleting ID ${p.id} (${p.name})`);
            await prisma.player.delete({ where: { id: p.id } });
        }
    } else {
        console.log('No exact uppercase HONGQ found to delete.');
    }
}

safeMain()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
