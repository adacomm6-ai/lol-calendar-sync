const ENDPOINT = "https://lol.fandom.com/api.php";

async function main() {
    const tName = "LPL 2026 Split 1 Playoffs";

    let allGames = [];
    let offset = 0;
    const limit = 500;

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        fields: "SG.MatchId=MatchId, SG.Team1=Team1, SG.Team2=Team2, SG.Winner=Winner, SG.DateTime_UTC=DateTimeUTC, SG.N_GameInMatch=GameNumber",
        where: "SG.Tournament='" + tName.replace(/'/g, "\\'") + "'",
        limit: limit.toString(),
        offset: "0",
        order_by: "SG.DateTime_UTC ASC"
    });

    const res = await fetch(ENDPOINT + "?" + params.toString());
    const data = await res.json();

    if (!data.cargoquery) {
        console.log("No data!");
        return;
    }

    console.log("Total games:", data.cargoquery.length);

    // Group by MatchId
    const seriesMap = new Map();
    data.cargoquery.forEach(item => {
        const g = item.title;
        const mid = g.MatchId;
        if (!seriesMap.has(mid)) {
            seriesMap.set(mid, []);
        }
        seriesMap.get(mid).push({
            team1: g.Team1,
            team2: g.Team2,
            winner: parseInt(g.Winner),
            date: g.DateTimeUTC,
            gameNumber: parseInt(g.GameNumber)
        });
    });

    console.log("\n=== ALL Series by MatchId ===\n");
    let i = 0;
    for (const [matchId, games] of seriesMap.entries()) {
        i++;
        const first = games[0];
        const t1w = games.filter(g => g.winner === 1).length;
        const t2w = games.filter(g => g.winner === 2).length;
        const winner = t1w > t2w ? first.team1 : (t2w > t1w ? first.team2 : "ongoing");
        console.log(i + ". MatchId: " + matchId);
        console.log("   " + first.team1 + " " + t1w + " - " + t2w + " " + first.team2 + " | Winner: " + winner + " | Games: " + games.length + " | Date: " + first.date);
    }
}

main().catch(console.error);
