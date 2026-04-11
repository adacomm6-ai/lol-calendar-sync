const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const all = await prisma.player.findMany({
        where: { split: 'Split 1' },
        include: { _count: { select: { matches: true } } }
    });

    const groups = {};

    for (const p of all) {
        const norm = p.name.toLowerCase();
        if (norm === 'wei' || norm === 'jwei') {
            if (!groups[norm]) groups[norm] = [];
            groups[norm].push(p);
        }
    }

    console.log('--- Analysis ---');
    for (const [key, list] of Object.entries(groups)) {
        console.log(`Group: ${key} (${list.length} records)`);
        for (const p of list) {
            console.log(`  ID: ${p.id} | Name: ${p.name} | Matches: ${p._count.matches}`);
        }

        if (list.length > 1) {
            list.sort((a, b) => b._count.matches - a._count.matches);
            const keeper = list[0];
            const toDelete = list.slice(1);

            console.log(`  -> Keeping: ${keeper.name} (${keeper.id})`);

            for (const d of toDelete) {
                if (d._count.matches > 0) {
                    console.log(`  -> WARNING: Candidate ${d.name} (${d.id}) has ${d._count.matches} matches. SKIPPING DELETE.`);
                } else {
                    console.log(`  -> Deleting ${d.name} (${d.id})...`);
                    await prisma.player.delete({ where: { id: d.id } });
                    console.log('     Deleted.');
                }
            }
        }
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
