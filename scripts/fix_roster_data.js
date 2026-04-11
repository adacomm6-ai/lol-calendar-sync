
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting Roster Cleanup (TES, IG, AL)...');

    // 1. Define Correct Rosters (Name -> TeamShortName)
    const targetMap = {
        '369': 'Top Esports',
        'Wei': 'Top Esports',
        'Creme': 'Top Esports',
        'Jackeylove': 'Top Esports',
        'Meiko': 'Top Esports',

        'Soboro': 'Invictus Gaming',
        'Naiyou': 'Invictus Gaming',
        'Rookie': 'Invictus Gaming',
        'Photic': 'Invictus Gaming',
        'Jwei': 'Invictus Gaming',
        'Jiaqi': 'Invictus Gaming',
        'Fengyue': 'Invictus Gaming',

        // Anyone's Legend
        'Flandre': "Anyone's Legend",
        'Tarzan': "Anyone's Legend",
        'Shanks': "Anyone's Legend",
        'Hope': "Anyone's Legend",
        'Kael': "Anyone's Legend",
    };

    // Case-insensitive junk list (will check against lowercase/normalized)
    const junkPlayers = [
        'sobord', 'zuian', 'nia', 'jiadi', 'renard',
        'wuna13', 'wunai3', 'thehang', 'yinova', 'glfs', 'sinian', 'flandre1'
    ];

    // Get Team IDs
    const tes = await prisma.team.findFirst({ where: { name: { contains: 'Top Esports' } } });
    const ig = await prisma.team.findFirst({ where: { name: { contains: 'Invictus' } } });
    const al = await prisma.team.findFirst({ where: { name: { contains: "Anyone's Legend" } } });

    if (!tes || !ig || !al) {
        console.log('ERROR: One or more teams (Top Esports, Invictus Gaming, Anyone\'s Legend) not found.');
        return;
    }

    const teamIdMap = {
        'Top Esports': tes.id,
        'Invictus Gaming': ig.id,
        "Anyone's Legend": al.id
    };

    // 2. Fetch all players currently in these teams
    const players = await prisma.player.findMany({
        where: {
            teamId: { in: [tes.id, ig.id, al.id] }
        }
    });

    console.log(`Found ${players.length} players in TES/IG/AL. Processing...`);

    // 3. Process
    const processedNames = new Set();

    for (const p of players) {
        const name = p.name;
        // Normalize name title case for Mapping key
        const normName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        // Lowercase for junk check
        const lowerName = name.toLowerCase();

        // A. Delete Junk/Typos
        if (junkPlayers.includes(lowerName)) {
            console.log(`[DELETE] Junk/Typo: ${name} (${p.id})`);
            await prisma.player.delete({ where: { id: p.id } });
            continue;
        }

        // Special check for all caps names that might look like junk if not in targetMap
        // e.g. THEHANG
        // If we have a Target Map hit, we keep it (or move it). If not, we suspect it's junk.

        // B. Check if in Target Map
        const targetTeamName = targetMap[normName];
        if (targetTeamName) {
            const targetTeamId = teamIdMap[targetTeamName];

            // Check if Duplicate (already processed this name)
            if (processedNames.has(normName)) {
                console.log(`[DELETE] Duplicate: ${name} (${p.id})`);
                await prisma.player.delete({ where: { id: p.id } });
            } else {
                // Update Team if wrong
                if (p.teamId !== targetTeamId) {
                    console.log(`[MOVE] ${name} to ${targetTeamName}`);
                    await prisma.player.update({
                        where: { id: p.id },
                        data: { teamId: targetTeamId, split: '2026 LPL第一赛段' }
                    });
                } else {
                    // Ensure split is correct
                    if (p.split !== '2026 LPL第一赛段') {
                        console.log(`[UPDATE] ${name} split`);
                        await prisma.player.update({
                            where: { id: p.id },
                            data: { split: '2026 LPL第一赛段' }
                        });
                    }
                }
                processedNames.add(normName);
            }
        } else {
            // Player is in these teams but NOT in our specific Main Roster list.
            if (name === 'Hang') {
                console.log(`[DELETE] Wrong Team Player (Hang): ${name} (${p.id})`);
                await prisma.player.delete({ where: { id: p.id } });
            } else {
                console.log(`[DELETE] Unknown/Demacia Extra: ${name} (${p.id})`);
                await prisma.player.delete({ where: { id: p.id } });
            }
        }
    }

    console.log('Cleanup Complete.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
