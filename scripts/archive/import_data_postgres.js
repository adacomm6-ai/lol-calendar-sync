
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function importAll() {
    const backupDir = path.join(__dirname, '../backups/json_export');

    // Order matters for Foreign Keys!
    const models = [
        'Team',
        'Hero',
        'Player',
        'TeamComment',
        'Match',
        'Game',
        'Odds',
        'Comment'
    ];

    const delegates = {
        'Team': prisma.team,
        'Hero': prisma.hero,
        'Player': prisma.player,
        'TeamComment': prisma.teamComment,
        'Match': prisma.match,
        'Game': prisma.game,
        'Odds': prisma.odds,
        'Comment': prisma.comment
    };

    for (const modelName of models) {
        console.log(`Importing ${modelName}...`);
        const filePath = path.join(backupDir, `${modelName}.json`);

        if (!fs.existsSync(filePath)) {
            console.log(`File ${filePath} not found. Skipping.`);
            continue;
        }

        const rawData = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(rawData);

        if (data.length === 0) {
            console.log(`No data for ${modelName}. Skipping.`);
            continue;
        }

        const delegate = delegates[modelName];
        if (!delegate) {
            console.error(`Delegate for ${modelName} not found!`);
            continue;
        }

        // Use createMany for Postgres
        // Note: skipDuplicates usually works well for idempotent runs
        try {
            await delegate.createMany({
                data: data,
                skipDuplicates: true
            });
            console.log(`Imported ${data.length} records into ${modelName}.`);
        } catch (e) {
            console.error(`Failed createMany for ${modelName}:`, e.message);
            // Fallback to one-by-one if createMany fails specific constraint?
            // Usually DB push handles schema, createMany handles bulk.
            // If Data contains Relational Fields (e.g. `team: { connect: ... }`), createMany fails.
            // But export was raw scalars (foreign keys are ids). So createMany is fine.
            // However, Prisma export includes `createdAt`/`updatedAt`. createMany supports them.
            // One caveat: If data has relation OBJECTS instantiated? No, export uses findMany() which returns scalars + relations only if included.
            // My export script didn't use `include`. So it's just scalars. Safe.
        }
    }
}

importAll()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
