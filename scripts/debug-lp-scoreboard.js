const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchRecentGamePlayers(teamName) {
    // 1. Find recent GameId for the team
    const params1 = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        fields: "SG.GameId, SG.DateTime_UTC",
        where: `SG.Team1='${teamName}' OR SG.Team2='${teamName}'`,
        limit: "1",
        order_by: "SG.DateTime_UTC DESC"
    });

    const res1 = await fetch(`${ENDPOINT}?${params1.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data1 = await res1.json();
    if (!data1.cargoquery || data1.cargoquery.length === 0) return { error: `No games found for ${teamName}` };

    const gameId = data1.cargoquery[0].title.GameId;
    console.log(`Found recent game for ${teamName}: ${gameId} at ${data1.cargoquery[0].title.DateTime_UTC}`);

    // 2. Fetch players for that game
    const params2 = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP",
        fields: "SP.Name, SP.Role, SP.Team",
        where: `SP.GameId='${gameId}' AND SP.Team='${teamName}'`,
        limit: "10"
    });
    const res2 = await fetch(`${ENDPOINT}?${params2.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data2 = await res2.json();
    return data2.cargoquery.map(item => item.title);
}

async function main() {
    console.log('--- NIP Recent Roster ---');
    console.log(JSON.stringify(await fetchRecentGamePlayers('Ninjas in Pyjamas'), null, 2));

    console.log('\n--- LOUD Recent Roster ---');
    console.log(JSON.stringify(await fetchRecentGamePlayers('LOUD'), null, 2));
}

main().catch(console.error);
