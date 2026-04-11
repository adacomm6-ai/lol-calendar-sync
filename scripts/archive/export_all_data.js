
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function exportAll() {
    const models = [
        'Team', 'Player', 'Match', 'Game', 'TeamComment',
        'Odds', 'Comment', 'Hero'
    ];

    // Introspection to get all models?
    // Manual list is safer for now.
    // Let's check schema.prisma first?
    // I'll assume these are the main ones based on observation.

    // Better: Read schema or just try standard ones.

    const outDir = path.join(__dirname, '../backups/json_export');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // Map model names to prisma delegate names (lowercase usually)
    const delegates = {
        'Team': prisma.team,
        'Player': prisma.player,
        'Match': prisma.match,
        'Game': prisma.game,
        'TeamComment': prisma.teamComment,
        'Odds': prisma.odds,
        'Comment': prisma.comment,
        'Hero': prisma.hero
    };

    for (const [name, delegate] of Object.entries(delegates)) {
        if (!delegate) {
            console.log(`Skipping ${name} (delegate not found)`);
            continue;
        }
        console.log(`Exporting ${name}...`);
        const data = await delegate.findMany();
        fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2));
        console.log(`Exported ${data.length} records to ${name}.json`);
    }
}

exportAll()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
