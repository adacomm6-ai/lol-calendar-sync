
import { fetchPlayersForGames } from '../../src/lib/leaguepedia';

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
    console.log("Debugging Matching Logic for T1 vs KT Rolster...");

    const gameIds = [
        "LCK/2026 Season/Cup_Week 2_5_1",
        "LCK/2026 Season/Cup_Week 2_5_2"
    ];

    // Simulate DB Data
    // User sidebar likely has "T1" and "KT Rolster"
    const dbTeamA = { name: "T1", shortName: "T1" };
    const dbTeamB = { name: "KT Rolster", shortName: "KT" }; // Shortname might be KT?

    console.log("DB Teams:");
    console.log("A:", dbTeamA);
    console.log("B:", dbTeamB);

    try {
        const allPlayersMap = await fetchPlayersForGames(gameIds);
        console.log(`Fetched players for ${Object.keys(allPlayersMap).length} games.`);

        for (const gameId of gameIds) {
            const players = allPlayersMap[gameId] || [];
            console.log(`\nGame ${gameId}: ${players.length} players found.`);

            if (players.length > 0) {
                // Print unique teams from API
                const apiTeams = [...new Set(players.map(p => p.team))];
                console.log("API Teams:", apiTeams);

                // Simulate Matching Logic from actions.ts
                const teamAName = normalize(dbTeamA.name);
                const teamAShort = normalize(dbTeamA.shortName);
                const teamBName = normalize(dbTeamB.name);
                const teamBShort = normalize(dbTeamB.shortName);

                console.log(`Normalized A: ${teamAName} (${teamAShort})`);
                console.log(`Normalized B: ${teamBName} (${teamBShort})`);

                const playersA = players.filter(p => {
                    const t = normalize(p.team);
                    // actions.ts logic:
                    return t.includes(teamAName) || (teamAShort && t.includes(teamAShort)) || teamAName.includes(t);
                });

                const playersB = players.filter(p => {
                    const t = normalize(p.team);
                    return t.includes(teamBName) || (teamBShort && t.includes(teamBShort)) || teamBName.includes(t);
                });

                console.log(`Matched Team A (${dbTeamA.name}): ${playersA.length}`);
                console.log(`Matched Team B (${dbTeamB.name}): ${playersB.length}`);

                if (playersA.length === 0) {
                    console.log(">> Failed to match Team A. Debug:");
                    players.forEach(p => {
                        const t = normalize(p.team);
                        console.log(`   API: '${p.team}' -> '${t}' vs DB '${teamAName}' / '${teamAShort}'`);
                    });
                }
            } else {
                console.log("!!! No players returned from API for this game.");
            }
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
