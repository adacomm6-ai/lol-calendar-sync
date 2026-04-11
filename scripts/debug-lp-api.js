const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchTeamRoster(teamName) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "Players=P",
        fields: "P.ID=ID, P.Role=Role, P.Image=Image",
        where: `P.Team='${teamName.replace(/'/g, "\\'")}' AND P.IsPlayer=1`,
        limit: "20"
    });

    const url = `${ENDPOINT}?${params.toString()}`;
    console.log(`URL: ${url}`);
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    });
    const data = await res.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
    if (!data.cargoquery) return [];
    return data.cargoquery.map(item => ({
        id: item.title.ID,
        role: item.title.Role,
        image: item.title.Image
    }));
}

async function main() {
    console.log('--- Fetching Roster for Ninjas in Pyjamas ---');
    const roster = await fetchTeamRoster('Ninjas in Pyjamas');
    console.log(`Found ${roster.length} players:`);
    console.table(roster);
}

main().catch(console.error);
