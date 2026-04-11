const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const https = require('https');

const prisma = new PrismaClient();

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TEAM_IMG_DIR = path.join(PUBLIC_DIR, 'images', 'teams');
const CHAMP_IMG_DIR = path.join(PUBLIC_DIR, 'images', 'champions');

// Ensure directories exist
if (!fs.existsSync(TEAM_IMG_DIR)) fs.mkdirSync(TEAM_IMG_DIR, { recursive: true });
if (!fs.existsSync(CHAMP_IMG_DIR)) fs.mkdirSync(CHAMP_IMG_DIR, { recursive: true });

async function downloadFile(url, dest) {
    if (!url || !url.startsWith('http')) return false;

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://lpl.qq.com/'
            }
        };
        const request = https.get(url, options, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle basic redirect
                downloadFile(response.headers.location, dest).then(resolve).catch(resolve);
                return;
            }
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(dest, () => { }); // Delete info file
                console.error(`Failed to download ${url}: Status ${response.statusCode}`);
                resolve(false);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(true);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            console.error(`Error downloading ${url}: ${err.message}`);
            resolve(false);
        });
    });
}

async function downloadTeams() {
    console.log('--- Downloading Team Logos ---');
    const teams = await prisma.team.findMany();

    for (const team of teams) {
        if (!team.logo) continue;

        // Sanitize filename
        const ext = path.extname(team.logo.split('?')[0]) || '.png';
        const filename = `${team.id}${ext}`;
        const localPath = path.join(TEAM_IMG_DIR, filename);
        const publicPath = `/images/teams/${filename}`;

        if (fs.existsSync(localPath)) {
            // Already exists, just update DB if needed
            if (team.logo !== publicPath) {
                await prisma.team.update({ where: { id: team.id }, data: { logo: publicPath } });
                console.log(`Updated DB for ${team.name} (Cached)`);
            }
            continue;
        }

        console.log(`Downloading logo for ${team.name}...`);
        const success = await downloadFile(team.logo, localPath);

        if (success) {
            await prisma.team.update({ where: { id: team.id }, data: { logo: publicPath } });
            console.log(`Saved & Updated: ${team.name}`);
        }
    }
}

async function downloadChampions() {
    console.log('\n--- Downloading Champion Icons ---');

    // Get latest version
    let version = '14.1.1'; // Fallback
    try {
        const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        if (res.ok) {
            const versions = await res.json();
            version = versions[0];
        }
    } catch (e) {
        console.error("Failed to fetch DDragon version, using fallback", e);
    }
    console.log(`Using DDragon version: ${version}`);

    // Fetch Champion List
    let champs = {};
    try {
        const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion.json`);
        if (res.ok) {
            const data = await res.json();
            champs = data.data;
        }
    } catch (e) {
        console.error("Failed to fetch champion list", e);
        return;
    }

    const champNames = Object.keys(champs);
    console.log(`Found ${champNames.length} champions.`);

    let downloadCount = 0;
    for (const key of champNames) {
        const champ = champs[key];
        const imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.id}.png`;
        const filename = `${champ.id}.png`;
        const localPath = path.join(CHAMP_IMG_DIR, filename);

        if (!fs.existsSync(localPath)) {
            const success = await downloadFile(imageUrl, localPath);
            if (success) {
                downloadCount++;
                process.stdout.write('.'); // Progress dot
            }
        }
    }
    console.log(`\nDownloaded ${downloadCount} new champion icons.`);
}

async function main() {
    await downloadTeams();
    await downloadChampions();
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
