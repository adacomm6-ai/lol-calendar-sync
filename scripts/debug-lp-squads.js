const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchSquad(teamName) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "Squads=S",
        fields: "S.Player, S.Role",
        where: `S.Team='${teamName}'`,
        limit: "20"
    });
    const url = `${ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`Team: ${teamName} | Count: ${data.cargoquery?.length || 0}`);
    return data.cargoquery;
}

async function main() {
    console.log(JSON.stringify(await fetchSquad('Ninjas in Pyjamas'), null, 2));
    console.log(JSON.stringify(await fetchSquad('LOUD'), null, 2));
}

main().catch(console.error);
