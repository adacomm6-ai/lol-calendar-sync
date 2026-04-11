const ENDPOINT = "https://lol.fandom.com/api.php";

async function findTeam(search) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "Teams=T",
        fields: "T.Name, T.Short, T.Region",
        where: `T.Name LIKE '%${search}%' OR T.Short LIKE '%${search}%'`,
        limit: "10"
    });
    const url = `${ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    return data.cargoquery;
}

async function main() {
    console.log('--- Search for NIP ---');
    console.log(JSON.stringify(await findTeam('Ninjas in Pyjamas'), null, 2));

    console.log('\n--- Search for LOUD ---');
    console.log(JSON.stringify(await findTeam('LOUD'), null, 2));
}

main().catch(console.error);
