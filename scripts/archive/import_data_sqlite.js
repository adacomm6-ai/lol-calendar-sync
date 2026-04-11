
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function importAll() {
    const backupDir = path.join(__dirname, '../backups/json_export');

    // Import Order: Independent -> Dependent
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

        let successCount = 0;
        let failCount = 0;

        // SQLite does not support createMany with skipDuplicates.
        // We use UPSERT or CREATE one by one.
        for (const record of data) {
            try {
                // Remove relational fields if they exist in JSON (e.g. 'team', 'games')
                // The export was likely raw scalars, but just in case.
                const { team, games, match, ...cleanRecord } = record;

                // Check if model has 'id' field to use for upsert
                if (cleanRecord.id) {
                    await delegate.upsert({
                        where: { id: cleanRecord.id },
                        update: cleanRecord,
                        create: cleanRecord
                    });
                } else {
                    // Try create, ignore if ambiguous
                    await delegate.create({ data: cleanRecord });
                }
                successCount++;
            } catch (e) {
                // Duplicate or constraint error
                // console.error(`Error importing record ${modelName}:`, e.message);
                process.stdout.write('x');
                failCount++;
            }
            if (successCount % 50 === 0) process.stdout.write('.');
        }
        console.log(`\nImported ${modelName}: ${successCount} success, ${failCount} failed/skipped.`);
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
