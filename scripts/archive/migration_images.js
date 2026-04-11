
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load .env

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase URL or Key in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const prisma = new PrismaClient();

const UPLOADS_DIR = path.join(__dirname, '../public/uploads');

// Sanitize helper: Replace non-ASCII/special chars with _
const sanitize = (name) => name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

async function migrateImages() {
    // 1. Upload Files
    if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        console.log(`Found ${files.length} files in public/uploads. Uploading...`);

        for (const file of files) {
            if (file === '.gitkeep') continue;

            const filePath = path.join(UPLOADS_DIR, file);
            if (!fs.lstatSync(filePath).isFile()) continue;

            const fileBuffer = fs.readFileSync(filePath);
            const cleanName = sanitize(file);

            // Upsert (overwrite if exists)
            const { data, error } = await supabase
                .storage
                .from('uploads')
                .upload(cleanName, fileBuffer, {
                    contentType: 'image/png',
                    upsert: true
                });

            if (error) {
                console.error(`Error uploading ${file} -> ${cleanName}:`, error.message);
            } else {
                if (cleanName !== file) {
                    // console.log(`Renamed upload: ${file} -> ${cleanName}`);
                }
            }
        }
        console.log("Upload phase complete.");
    } else {
        console.log("No public/uploads directory found.");
    }

    // 2. Update Database Records
    const prefix = `${supabaseUrl}/storage/v1/object/public/uploads/`;
    console.log(`Updating DB records to point to: ${prefix}`);

    // Helper to replace
    const replaceUrl = (oldUrl) => {
        if (!oldUrl) return oldUrl;
        if (oldUrl.includes('/uploads/')) {
            // Extract filename
            const parts = oldUrl.split('/uploads/'); // Handles local relative paths or full urls if contain /uploads/
            const filename = parts[1]; // "foo.png"
            if (!filename) return oldUrl;

            // Decode URI component just in case stored as %20?
            // Usually stored raw string.
            // Sanitize filename
            const cleanName = sanitize(decodeURIComponent(filename));
            return prefix + cleanName;
        }
        return oldUrl;
    };

    // Models with image fields
    // Hero: avatarUrl
    // Player: photo
    // Game: screenshot, screenshot2
    // Team: logo

    // HERO
    const heroes = await prisma.hero.findMany({ where: { avatarUrl: { contains: '/uploads/' } } });
    console.log(`Fixing ${heroes.length} Heroes...`);
    for (const h of heroes) {
        await prisma.hero.update({
            where: { id: h.id },
            data: { avatarUrl: replaceUrl(h.avatarUrl) }
        });
    }

    // PLAYER
    const players = await prisma.player.findMany({ where: { photo: { contains: '/uploads/' } } });
    console.log(`Fixing ${players.length} Players...`);
    for (const p of players) {
        await prisma.player.update({
            where: { id: p.id },
            data: { photo: replaceUrl(p.photo) }
        });
    }

    // GAME
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { screenshot: { contains: '/uploads/' } },
                { screenshot2: { contains: '/uploads/' } }
            ]
        }
    });
    console.log(`Fixing ${games.length} Games...`);
    for (const g of games) {
        await prisma.game.update({
            where: { id: g.id },
            data: {
                screenshot: replaceUrl(g.screenshot),
                screenshot2: replaceUrl(g.screenshot2)
            }
        });
    }

    // TEAM
    const teams = await prisma.team.findMany({ where: { logo: { contains: '/uploads/' } } });
    console.log(`Fixing ${teams.length} Teams...`);
    for (const t of teams) {
        await prisma.team.update({
            where: { id: t.id },
            data: { logo: replaceUrl(t.logo) }
        });
    }

    console.log("Database Update Complete.");
}

migrateImages()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
