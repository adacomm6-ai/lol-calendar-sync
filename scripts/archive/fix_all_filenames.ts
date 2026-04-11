import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    const games = await prisma.game.findMany({
        where: { screenshot: { not: null } }
    });

    console.log(`Checking ${games.length} games for complex filenames...`);

    let updatedCount = 0;

    for (const game of games) {
        if (!game.screenshot) continue;

        let relative = game.screenshot;
        // Check if filename is suspicious (contains multiple 'analysis_' or is very long)
        const filename = path.basename(relative);

        // Criteria: contains 'analysis_' more than once OR length > 50 chars
        const isComplex = (filename.match(/analysis_/g) || []).length > 1 || filename.length > 60;

        if (isComplex) {
            console.log(`Found complex filename: ${filename} (Game ${game.id})`);

            if (relative.startsWith('/')) relative = relative.slice(1);
            const fullPath = path.join(process.cwd(), 'public', relative);
            const dir = path.dirname(fullPath);
            const ext = path.extname(fullPath);

            if (fs.existsSync(fullPath)) {
                // Generate simple unique name: gameId_timestamp.ext
                // Shorten game ID to 8 chars for brevity
                const shortId = game.id.slice(0, 8);
                const newFilename = `clean_${shortId}_${Date.now()}${ext}`;
                const newFullPath = path.join(dir, newFilename);
                const newRelative = `/uploads/${newFilename}`;

                // Rename file
                fs.renameSync(fullPath, newFullPath);

                // Update DB
                await prisma.game.update({
                    where: { id: game.id },
                    data: { screenshot: newRelative }
                });
                console.log(`  -> Renamed to: ${newFilename}`);
                updatedCount++;
            } else {
                console.log(`  -> File missing on disk, cannot rename.`);
            }
        }
    }

    console.log(`\nFixed ${updatedCount} filenames.`);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
