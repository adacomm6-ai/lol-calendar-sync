
// Mock logic from src/lib/leaguepedia.ts
function resolveTournamentLogic(input) {
    if (input.includes('lol.fandom.com/wiki/')) {
        const parts = input.split('/wiki/');
        if (parts.length < 2) return input;
        let pageTitle = decodeURIComponent(parts[1]).replace(/_/g, ' ');
        return pageTitle;
    }
    return input;
}

// Mock logic from src/app/admin/schedule/actions.ts for ImportMatches
function parseImportLines(data) {
    const lines = data.split('\n').filter(l => l.trim());
    const results = [];
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
            let teamAStr = parts[2];
            let teamBStr = parts[parts.length - 1];

            if (parts.includes('vs')) {
                const vsIndex = parts.indexOf('vs');
                teamAStr = parts.slice(2, vsIndex).join(' ');
                teamBStr = parts.slice(vsIndex + 1).join(' ');
            }
            results.push({ teamA: teamAStr, teamB: teamBStr });
        }
    }
    return results;
}

console.log("--- Testing URL Logic ---");
const url = "https://lol.fandom.com/wiki/LPL/2026_Season/Spring_Season";
const title = resolveTournamentLogic(url);
console.log(`Input: ${url}`);
console.log(`Output: ${title}`);
if (title === "LPL/2026 Season/Spring Season") { // Note: Slash remains, but that matches "OverviewPage" usually?
    // Wait, OverviewPage usually is just the title. "LPL/2026 Season/Spring Season" is the page title.
    // Cargo "Tournaments" table "OverviewPage" field.
    console.log("PASS: URL Parsing");
} else {
    console.log("FAIL: URL Parsing");
}

console.log("\n--- Testing Bulk Import Parsing ---");
const input = `2026-02-01 17:00 BLG vs JDG
2026-02-01 19:00 TES vs WBG
2026-02-02 17:00 Ninjas in Pyjamas vs Rare Atom`; // Test spaces

const parsed = parseImportLines(input);
console.log(JSON.stringify(parsed, null, 2));

if (parsed.length === 3 && parsed[2].teamA === "Ninjas in Pyjamas") {
    console.log("PASS: Bulk Import Parsing");
} else {
    console.log("FAIL: Bulk Import Parsing");
}
