import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    // Find game with most recently modified ? 
    // Prisma doesn't track updatedAt by default on all models unless added.
    // We can infer by looking for timestamps in filenames?

    const games = await prisma.game.findMany({
        where: { screenshot: { not: null } }
    });

    console.log(`Scanning ${games.length} games for recent or long filenames...`);

    let suspicious = [];

    for (const game of games) {
        if (!game.screenshot) continue;
        const relative = game.screenshot;
        const filename = path.basename(relative);

        // Log simple stats
        // console.log(`  ${filename} (len: ${filename.length})`);

        if (filename.length > 50 || filename.includes('scoreboard_')) {
            suspicious.push({ id: game.id, filename, len: filename.length });
        }
    }

    // Sort by assumed timestamp in filename?
    // format: scoreboard_{uuid}_{timestamp}.png

    suspicious.sort((a, b) => {
        const getTs = (s: string) => {
            const match = s.match(/_(\d{13})/);
            return match ? parseInt(match[1]) : 0;
        };
        return getTs(b.filename) - getTs(a.filename);
    });

    if (suspicious.length > 0) {
        console.log("Most recent suspicious files:");
        suspicious.slice(0, 3).forEach(s => console.log(`  [${s.len}] ${s.filename} (Game ${s.id})`));

        // Let's fix the first one unconditionally if it looks like the user's upload
        const latest = suspicious[0];
        console.log(`Fixing latest: ${latest.filename}`);

        let relative = `/uploads/${latest.filename}`;
        const fullPath = path.join(process.cwd(), 'public', relative);
        const dir = path.dirname(fullPath);
        const ext = path.extname(fullPath);

        if (fs.existsSync(fullPath)) {
            const shortId = latest.id.slice(0, 8);
            const newFilename = `clean_manual_${shortId}_${Date.now()}${ext}`;
            const newFullPath = path.join(dir, newFilename);
            const newRelative = `/uploads/${newFilename}`;

            fs.renameSync(fullPath, newFullPath);
            await prisma.game.update({
                where: { id: latest.id },
                data: { screenshot: newRelative }
            });
            console.log(`  -> Fixed: ${newFilename}`);
        } else {
            console.log("  -> File missing.");
        }
    } else {
        console.log("No suspicious files found.");
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
