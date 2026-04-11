const ENDPOINT = "https://lol.fandom.com/api.php";

async function queryPlayer(playerName) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "Players=P",
        fields: "P.ID, P.Team, P.Role, P.Country",
        where: `P.ID='${playerName}'`,
        limit: "5"
    });

    const url = `${ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    return data.cargoquery;
}

async function main() {
    const names = ['Keshi', 'Hoya', 'Care'];
    for (const name of names) {
        console.log(`--- Querying Player: ${name} ---`);
        const result = await queryPlayer(name);
        console.log(JSON.stringify(result, null, 2));
    }
}

main().catch(console.error);
