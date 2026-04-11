const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Find games on Jan 14 2026
    const start = new Date('2026-01-14T00:00:00.000Z'); // Adjust time zone if needed
    const end = new Date('2026-01-14T23:59:59.000Z');

    const games = await prisma.game.findMany({
        where: { createdAt: { gte: start } }, // Or match.startTime?
        include: { match: true }
    });

    console.log(`Found ${games.length} games.`);

    for (const g of games) {
        console.log(`Game ID: ${g.id} | Match: ${g.match.teamAId} vs ${g.match.teamBId}`);
        // Parse analysisData
        if (g.analysisData) {
            try {
                const data = JSON.parse(g.analysisData);
                console.log('Players in analysisData:');
                if (data.damage_data) {
                    data.damage_data.forEach(p => {
                        console.log(`  - Name: "${p.name}" | Hero: ${p.hero} | KDA: ${p.kda}`);
                    });
                }
            } catch (e) { console.log('Error parsing JSON'); }
        }
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
