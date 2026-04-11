
// Native fetch in Node 18+


async function main() {
    // Leaguepedia Cargo API Endpoint
    const endpoint = "https://lol.fandom.com/api.php";

    // Calculate date for 2026-01-24 (User's match)
    // Query ScoreboardGames table
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        fields: "SG.Tournament, SG.Team1, SG.Team2, SG.DateTime_UTC, SG.Winner, SG.Gamelength, SG.MatchId",
        where: "SG.DateTime_UTC >= '2026-01-24 00:00:00' AND SG.DateTime_UTC <= '2026-01-26 23:59:59' AND SG.Tournament LIKE '%LPL%'",
        limit: "10"
    });

    try {
        const url = `${endpoint}?${params.toString()}`;
        console.log("Querying:", url);

        const response = await fetch(url);
        const data = await response.json();

        if (data.cargoquery) {
            console.log(`Found ${data.cargoquery.length} matches. Sample Item Keys:`, Object.keys(data.cargoquery[0].title));
            data.cargoquery.forEach(item => {
                const g = item.title;
                console.log(`- [${g['DateTime UTC'] || g.DateTime_UTC}] ${g.Team1} vs ${g.Team2} (ID: ${g.MatchId})`);
            });

            // Step 2: Query Players for First Match
            if (data.cargoquery.length > 0) {
                const sampleMatchId = data.cargoquery[0].title.MatchId;
                console.log("\nQuerying Players for Match:", sampleMatchId);

                const pParams = new URLSearchParams({
                    action: "cargoquery",
                    format: "json",
                    tables: "ScoreboardPlayers=SP",
                    fields: "SP.Name, SP.Champion, SP.Kills, SP.Deaths, SP.Assists, SP.DamageToChampions, SP.Team",
                    where: `SP.MatchId='${sampleMatchId}'`
                });

                const pUrl = `${endpoint}?${pParams.toString()}`;
                const pRes = await fetch(pUrl);
                const pData = await pRes.json();

                if (pData.cargoquery) {
                    console.log(`Found ${pData.cargoquery.length} player records:`);
                    pData.cargoquery.forEach(p => {
                        const player = p.title;
                        console.log(`  > ${player.Name} (${player.Champion}): ${player.Kills}/${player.Deaths}/${player.Assists} (Dmg: ${player.DamageToChampions})`);
                    });
                }
            }
        } else {
            console.log("No data found or API error:", JSON.stringify(data, null, 2));
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
