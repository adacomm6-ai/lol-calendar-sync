
import { fetchPlayersForGames } from '../../src/lib/leaguepedia';

async function main() {
    console.log("Verifying Batch Fetch Optimization...");

    // KT vs T1 Game IDs (from previous logs if available, or just use generic ones)
    // Generic LCK CL IDs from logs:
    const gameIds = [
        "LCK CL/2026 Season/Kickoff_Week 2_4_1",
        "LCK CL/2026 Season/Kickoff_Week 2_4_2"
    ];

    console.log(`Fetching players for ${gameIds.length} games (Batch Mode)...`);

    try {
        const result = await fetchPlayersForGames(gameIds);

        console.log("Batch Fetch Result:");
        for (const [gameId, players] of Object.entries(result) as [string, any[]][]) {
            console.log(`- Game ${gameId}: ${players.length} players found.`);
            if (players.length > 0) {
                console.log(`  Sample: ${players[0].name} (${players[0].champion})`);
            }
        }

    } catch (e) {
        console.error("Verification Failed:", e);
    }
}

main();
