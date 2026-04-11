
const ENDPOINT = "https://lol.fandom.com/api.php";
export { };

async function main() {
    console.log("Locating KT vs T1 matches...");

    // Query for matches between KT and T1 in 2026
    const where = `SG.DateTime_UTC >= '2026-01-01 00:00:00' AND ( (SG.Team1 LIKE '%KT%' AND SG.Team2 LIKE '%T1%') OR (SG.Team1 LIKE '%T1%' AND SG.Team2 LIKE '%KT%') )`;

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        fields: "SG.Tournament=Tournament, SG.Team1=Team1, SG.Team2=Team2, SG.DateTime_UTC=DateTimeUTC, SG.MatchId=MatchId, SG.GameId=GameId, SG.N_GameInMatch=GameNumber",
        where: where,
        limit: "10",
        order_by: "SG.DateTime_UTC DESC"
    });

    try {
        const url = `${ENDPOINT}?${params.toString()}`;
        console.log("Querying:", url);
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'LolDataSystem/1.0 (internal-tool; contact: admin@example.com)'
            }
        });
        const data = await res.json();

        if (data.cargoquery) {
            console.log(`Found ${data.cargoquery.length} matches.`);
            data.cargoquery.forEach((item: any) => {
                const m = item.title;
                console.log(`- [${m.DateTimeUTC}] ${m.Team1} vs ${m.Team2} (Game ${m.GameNumber}) ID: ${m.GameId} MatchID: ${m.MatchId}`);
            });
        } else {
            console.log("No matches found or error:", JSON.stringify(data));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
