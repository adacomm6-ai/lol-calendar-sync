
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Leaguepedia API
const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchWithRetry(url) {
    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'node-fetch/1.0' } });
            return await res.json();
        } catch (e) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
}

async function getWikiRosters() {
    console.log("Fetching Wiki Data for LPL 2026 Spring (or latest available)...");

    // Strategy: Get rosters from "TournamentPlayers" for "LPL 2025 Split 3" or "LPL 2026 Spring"
    // Note: Wiki might use different tournament names. Let's try "LPL 2026 Spring" or "LPL 2025 Split 3".
    // We will query for players in the "LPL 2025 Split 3" tournament (assuming matches exist) OR "LPL 2026 Spring".
    // Actually, asking for "TournamentPlayers" is better if accessible.
    // Table: TournamentPlayers (Tournament, Team, Player, Role)

    const tournamentName = "LPL 2026 Spring"; // Try this first? Or "LPL 2025 Split 3"?
    // Search suggests recently "LPL 2025 Split 3" might be the latest data or "LPL 2026".
    // Let's fuzzy search Tournaments first? No, let's try strict name.

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "TournamentPlayers=TP",
        fields: "TP.Team=Team, TP.Player=Player, TP.Role=Role",
        where: "TP.Tournament='LPL 2026 Spring' OR TP.Tournament='LPL 2025 Split 3'", // Try both
        limit: "500"
    });

    const url = `${ENDPOINT}?${params.toString()}`;
    const data = await fetchWithRetry(url);

    if (!data || !data.cargoquery) {
        console.error("Failed to fetch Wiki data or empty.");
        return {};
    }

    const wikiRosters = {}; // Team -> Set(Names)
    data.cargoquery.forEach(item => {
        const p = item.title;
        // Normalize Team Name (remove tags?)
        let team = p.Team;
        if (!wikiRosters[team]) wikiRosters[team] = new Set();
        wikiRosters[team].add(p.Player);
    });

    return wikiRosters;
}

async function main() {
    const wikiRosters = await getWikiRosters();

    // Normalize Wiki Team Names to match DB ShortNames
    // Mapping: "Top Esports" -> "Top Esports" (or TES?), "Invictus Gaming" -> "Invictus Gaming"
    // Let's inspect keys first.
    console.log("Wiki Teams Found:", Object.keys(wikiRosters));

    const dbTeams = await prisma.team.findMany({ include: { players: true } });

    console.log("\nStarting Comparison (DB vs Wiki)...\n");

    let discrepancies = 0;

    for (const team of dbTeams) {
        // Try to match Wiki Team Key
        let wikiKey = team.name; // Try Full Name
        if (!wikiRosters[wikiKey]) wikiKey = team.shortName; // Try Short
        // Try common variations
        if (!wikiRosters[wikiKey]) {
            // Try manual map for big teams if missed
            if (team.shortName === 'TES') wikiKey = 'Top Esports';
            if (team.shortName === 'IG') wikiKey = 'Invictus Gaming';
            if (team.shortName === 'AL') wikiKey = "Anyone's Legend";
            if (team.shortName === 'JDG') wikiKey = "JD Gaming";
            if (team.shortName === 'WBG') wikiKey = "Weibo Gaming";
            if (team.shortName === 'LNG') wikiKey = "LNG Esports";
        }

        const wikiPlayers = wikiRosters[wikiKey];

        if (!wikiPlayers) {
            console.warn(`[WARN] No Wiki data found for team: ${team.name} (${team.shortName}) - Skipping`);
            continue;
        }

        const dbPlayerNames = new Set(team.players.map(p => p.name.toLowerCase()));
        const wikiPlayerNames = new Set(Array.from(wikiPlayers).map(n => n.toLowerCase()));

        // 1. Missing in DB (In Wiki, Not in DB)
        const missing = Array.from(wikiPlayers).filter(n => !dbPlayerNames.has(n.toLowerCase()));

        // 2. Extra in DB (In DB, Not in Wiki) -> POTENTIAL JUNK?
        const extra = team.players.filter(p => !wikiPlayerNames.has(p.name.toLowerCase()));

        if (missing.length > 0 || extra.length > 0) {
            discrepancies++;
            console.log(`\n--------------------------------------------------`);
            console.log(`Mismatch: ${team.name}`);
            if (missing.length > 0) console.log(`   ❌ MISING IN DB: ${missing.join(', ')}`);
            if (extra.length > 0) console.log(`   ⚠️  EXTRA IN DB: ${extra.map(p => p.name).join(', ')}`);
        }
    }

    if (discrepancies === 0) {
        console.log("\n✅ Perfect Match! No discrepancies found.");
    } else {
        console.log(`\nFound discrepancies in ${discrepancies} teams.`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
