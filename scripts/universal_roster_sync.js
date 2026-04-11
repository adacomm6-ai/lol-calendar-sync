
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Leaguepedia API Endpoint
const ENDPOINT = "https://lol.fandom.com/api.php";

// --- CONFIGURATION ---
const TARGET_SPLIT_NAME = "2026 LPL第一赛段"; // The ONLY split we will touch
const TOURNAMENTS = [
    "LPL 2026 Spring",
    "LPL 2025 Split 3",
    "LCK 2026 Spring",
    "LCK 2026 Season"
];

const DRY_RUN = false;

// Explicit Delete List (blacklist) - User requested MEIKO deleted
const BLACKLIST = new Set(['meiko', 'sobord', 'flandre1', 'thehang', 'zuian', 'nia', 'jiadi', 'renard', 'glfs', 'sinian', 'yinova']);

// --- HELPERS ---
async function fetchWithRetry(url) {
    for (let i = 0; i < 3; i++) {
        try {
            console.log(`  Querying: ${url.slice(0, 100)}...`);
            const res = await fetch(url, { headers: { 'User-Agent': 'node-fetch/1.0' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error(`  [Attempt ${i + 1}] Request Failed:`, e.message);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
}

// Fetch Official Rosters (Sequential Pattern for Robustness)
async function getWikiRosters() {
    console.log(`Fetching Wiki Data...`);

    const wikiRosters = {};
    let successCount = 0;

    for (const tournament of TOURNAMENTS) {
        console.log(`\nFetching Tournament: ${tournament}`);
        const params = new URLSearchParams({
            action: "cargoquery",
            format: "json",
            tables: "TournamentPlayers=TP",
            fields: "TP.Team=Team, TP.Player=Player, TP.Role=Role",
            where: `TP.Tournament='${tournament}'`,
            limit: "500"
        });

        const url = `${ENDPOINT}?${params.toString()}`;
        const data = await fetchWithRetry(url);

        if (!data || !data.cargoquery) {
            console.warn(`  -> No data found or failed for ${tournament}`);
            continue;
        }

        console.log(`  -> Found ${data.cargoquery.length} records.`);
        successCount++;

        data.cargoquery.forEach(item => {
            const p = item.title;
            let team = p.Team;

            // Corrections
            if (team === 'LNG Esports') team = 'LNG Esports';
            if (team === 'Gen.G') team = 'Gen.G';

            if (!wikiRosters[team]) wikiRosters[team] = new Map();
            // Store using LowerCase key for easy lookup
            wikiRosters[team].set(p.Player.toLowerCase(), { name: p.Player, role: p.Role });
        });
    }

    if (successCount === 0) {
        console.error("\n[CRITICAL ERROR] Failed to fetch data from ANY tournament.");
        // We return null to signal total failure
        return null;
    }

    console.log(`\nLoaded Wiki Rosters for ${Object.keys(wikiRosters).length} teams total.`);
    return wikiRosters;
}

async function main() {
    console.log(`Starting Universal Roster Sync V4 (Split: ${TARGET_SPLIT_NAME})...`);
    console.log("----------------------------------------------------------------");

    // STEP 0: BLACKLIST CLEANUP (Offline Mode)
    // Run this FIRST so it works even if Wiki fails
    console.log("\n[Phase 1] Executing Blacklist/Junk Cleanup (Offline Safe)...");
    const dbTeams = await prisma.team.findMany({ include: { players: true } });
    let blacklistDeleted = 0;

    for (const team of dbTeams) {
        // Only target the specific split
        const splitPlayers = team.players.filter(p => p.split === TARGET_SPLIT_NAME);

        for (const p of splitPlayers) {
            if (BLACKLIST.has(p.name.toLowerCase())) {
                console.log(`  [DELETE] Blacklisted: ${p.name} (Team: ${team.shortName})`);
                if (!DRY_RUN) await prisma.player.delete({ where: { id: p.id } });
                blacklistDeleted++;
            }
        }
    }
    console.log(`[Phase 1] Cleanup Complete. Deleted ${blacklistDeleted} blacklisted items.`);


    // STEP 1: WIKI SYNC
    console.log("\n[Phase 2] Connecting to Official Wiki for Sync...");
    const wikiRosters = await getWikiRosters();

    if (!wikiRosters) {
        console.log("\n⚠️  Wiki Sync Aborted due to network error.");
        console.log("    However, Phase 1 (Blacklist/Meiko Deletion) was successful.");
        return;
    }

    let totalCreated = 0;
    let totalDeleted = 0;

    for (const team of dbTeams) {
        let wikiKey = team.name;
        if (!wikiRosters[wikiKey]) wikiKey = team.shortName;
        if (!wikiRosters[wikiKey]) {
            // Fallbacks
            if (team.shortName === 'TES') wikiKey = 'Top Esports';
            if (team.shortName === 'IG') wikiKey = 'Invictus Gaming';
            if (team.shortName === 'AL') wikiKey = "Anyone's Legend";
            if (team.shortName === 'JDG') wikiKey = "JD Gaming";
            if (team.shortName === 'WBG') wikiKey = "Weibo Gaming";
            if (team.shortName === 'LNG') wikiKey = "LNG Esports";
            if (team.shortName === 'BLG') wikiKey = "Bilibili Gaming";
            if (team.shortName === 'NIP') wikiKey = "Ninjas in Pyjamas";
            if (team.shortName === 'RNG') wikiKey = "Royal Never Give Up";
            if (team.shortName === 'LGD') wikiKey = "LGD Gaming";
            if (team.shortName === 'OMG') wikiKey = "Oh My God";
            if (team.shortName === 'RA') wikiKey = "Rare Atom";
            if (team.shortName === 'FPX') wikiKey = "FunPlus Phoenix";
            if (team.shortName === 'EDG') wikiKey = "EDward Gaming";
            if (team.shortName === 'TT') wikiKey = "ThunderTalk Gaming";
            if (team.shortName === 'WE') wikiKey = "Team WE";
            if (team.shortName === 'UP') wikiKey = "Ultra Prime";

            if (team.shortName === 'T1') wikiKey = 'T1';
            if (team.shortName === 'GEN') wikiKey = 'Gen.G';
            if (team.shortName === 'HLE') wikiKey = 'Hanwha Life Esports';
            if (team.shortName === 'DK') wikiKey = 'Dplus KIA';
            if (team.shortName === 'KT') wikiKey = 'KT Rolster';
            if (team.shortName === 'KDF') wikiKey = 'Kwangdong Freecs';
            if (team.shortName === 'NS') wikiKey = 'Nongshim RedForce';
            if (team.shortName === 'BRO') wikiKey = 'OKSavingsBank BRION';
            if (team.shortName === 'DRX') wikiKey = 'DRX';
            if (team.shortName === 'FOX') wikiKey = 'BNK FEARX';
            if (team.shortName === 'BFX') wikiKey = 'BNK FEARX';
            if (team.shortName === 'DNS') wikiKey = 'DN Freecs';
        }

        const wikiPlayers = wikiRosters[wikiKey];
        if (!wikiPlayers) continue;

        console.log(`\nSyncing Team: ${team.name} (${team.shortName})...`);

        // Get DB Players for Target Split Only
        const splitPlayers = team.players.filter(p => p.split === TARGET_SPLIT_NAME);
        const splitPlayersMap = new Map();
        splitPlayers.forEach(p => splitPlayersMap.set(p.name.toLowerCase(), p));

        // 1. DELETE Extras (Not in Wiki)
        for (const [nameLower, dbPlayer] of splitPlayersMap.entries()) {
            if (BLACKLIST.has(nameLower)) continue; // Already handled in Phase 1

            if (!wikiPlayers.has(nameLower)) {
                console.log(`  [DELETE] Extra/Junk: ${dbPlayer.name} (Split: ${dbPlayer.split})`);
                if (!DRY_RUN) await prisma.player.delete({ where: { id: dbPlayer.id } });
                totalDeleted++;
            }
        }

        // 2. CREATE Missing (In Wiki)
        for (const [nameLower, wikiData] of wikiPlayers.entries()) {
            if (BLACKLIST.has(nameLower)) continue;

            if (!splitPlayersMap.has(nameLower)) {
                console.log(`  [CREATE] Missing: ${wikiData.name} (${wikiData.role})`);
                if (!DRY_RUN) {
                    await prisma.player.create({
                        data: {
                            name: wikiData.name,
                            role: wikiData.role || 'Player',
                            teamId: team.id,
                            split: TARGET_SPLIT_NAME
                        }
                    });
                }
                totalCreated++;
            }
        }
    }

    console.log(`\n========================================`);
    console.log(`Sync Complete for ${TARGET_SPLIT_NAME}.`);
    console.log(`Phase 1 Deleted: ${blacklistDeleted}`);
    console.log(`Phase 2 (Wiki) Deleted: ${totalDeleted}, Created: ${totalCreated}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
