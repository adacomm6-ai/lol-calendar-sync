
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import mime from 'mime';

dotenv.config();

const prisma = new PrismaClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const BUCKET_NAME = 'match-screenshots';

// Helper to upload a single file
async function uploadFile(localPath: string): Promise<string | null> {
    const filename = path.basename(localPath);
    const absolutePath = path.join(process.cwd(), 'public', localPath);

    try {
        // Check if file exists
        await fs.access(absolutePath);

        const fileBuffer = await fs.readFile(absolutePath);
        const contentType = mime.getType(filename) || 'application/octet-stream';

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filename, fileBuffer, {
                contentType,
                upsert: true,
            });

        if (error) {
            console.error(`Error uploading ${filename}:`, error.message);
            return null;
        }

        const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filename);

        return publicUrl;
    } catch (err) {
        if ((err as any).code === 'ENOENT') {
            console.warn(`File not found locally: ${localPath}`);
        } else {
            console.error(`Error processing ${localPath}:`, err);
        }
        return null;
    }
}

async function main() {
    console.log('Starting migration...');

    // Find all games with local screenshots (starting with /uploads)
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { screenshot: { startsWith: '/uploads' } },
                { screenshot2: { startsWith: '/uploads' } },
            ],
        },
    });

    console.log(`Found ${games.length} games to migrate.`);

    let updatedCount = 0;

    for (const game of games) {
        let needsUpdate = false;
        let newScreenshot = game.screenshot;
        let newScreenshot2 = game.screenshot2;

        if (game.screenshot?.startsWith('/uploads')) {
            console.log(`Migrating screenshot for Game ${game.id}: ${game.screenshot}`);
            const url = await uploadFile(game.screenshot);
            if (url) {
                newScreenshot = url;
                needsUpdate = true;
            }
        }

        if (game.screenshot2?.startsWith('/uploads')) {
            console.log(`Migrating screenshot2 for Game ${game.id}: ${game.screenshot2}`);
            const url = await uploadFile(game.screenshot2);
            if (url) {
                newScreenshot2 = url;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            await prisma.game.update({
                where: { id: game.id },
                data: {
                    screenshot: newScreenshot,
                    screenshot2: newScreenshot2,
                },
            });
            updatedCount++;
            console.log(`Updated Game ${game.id}`);
        }
    }

    console.log(`Migration complete. Updated ${updatedCount} games.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
