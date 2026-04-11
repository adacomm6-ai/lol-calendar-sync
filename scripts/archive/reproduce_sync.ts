
import { fetchDailyMatches, fetchPlayersForGames } from '../../src/lib/leaguepedia';

async function main() {
    // Generate dates from Jan 14 to Jan 28
    const dates = [];
    for (let i = 14; i <= 28; i++) {
        dates.push(`2026-01-${i}`);
    }

    for (const dateStr of dates) {
        console.log(`\n=== Checking Date: ${dateStr} ===`);
        try {
            const matches = await fetchDailyMatches(dateStr);
            const lckMatches = matches.filter((m: any) => m.tournament.includes('LCK'));

            if (lckMatches.length > 0) {
                console.log(`Found ${lckMatches.length} LCK matches.`);
                lckMatches.forEach((m: any) => console.log(`- ${dateStr}: ${m.team1} vs ${m.team2} (Game ${m.gameNumber})`));
            }

            const targetMatch = matches.find((m: any) =>
                (m.team1.includes('KT') || m.team2.includes('KT')) &&
                (m.team1.includes('T1') || m.team2.includes('T1'))
            );

            if (targetMatch) {
                console.log('>>> FOUND TARGET MATCH:', targetMatch);
                console.log(`Fetching players for GameId: ${targetMatch.gameId}...`);
                const playersMap = await fetchPlayersForGames([targetMatch.gameId]);
                const players = playersMap[targetMatch.gameId] || [];
                console.log(`Result: Found ${players.length} players.`);

                if (players.length > 0) {
                    console.log("Sample Player:", players[0]);
                    // Debug Team Names
                    const teams = [...new Set(players.map((p: any) => p.team))];
                    console.log("Distinct Teams in Player Data:", teams);

                    // Test Matching Logic
                    const team1 = targetMatch.team1; // e.g. "KT Rolster"
                    const team2 = targetMatch.team2; // e.g. "T1"

                    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const t1n = normalize(team1);
                    const t2n = normalize(team2);

                    console.log(`Matching against: '${t1n}' and '${t2n}'`);

                    const p1 = players.filter((p: any) => normalize(p.team).includes(t1n) || t1n.includes(normalize(p.team)));
                    const p2 = players.filter((p: any) => normalize(p.team).includes(t2n) || t2n.includes(normalize(p.team)));

                    console.log(`Matched Team 1 (${team1}): ${p1.length}`);
                    console.log(`Matched Team 2 (${team2}): ${p2.length}`);
                } else {
                    console.log("!!! WARNING: No players found for this match.");
                }
                return;
            }
        } catch (e) {
            console.error("Error:", e);
        }
    }
    console.log("Target match (KT vs T1) not found in checked dates.");
}

main();
