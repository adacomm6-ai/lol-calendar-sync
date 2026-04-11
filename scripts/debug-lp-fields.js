const ENDPOINT = "https://lol.fandom.com/api.php";

async function testQuery(playerName) {
    // Try Link first
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP",
        fields: "SP.Link, SP.Name, SP.Role, SP.DateTime_UTC",
        where: `SP.Link='${playerName}' OR SP.Name='${playerName}'`,
        order_by: "SP.DateTime_UTC DESC",
        limit: "5"
    });

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`Results for ${playerName}:`, JSON.stringify(data.cargoquery, null, 2));
}

async function main() {
    await testQuery('BrokenBlade');
    await testQuery('Caps');
}

main().catch(console.error);
