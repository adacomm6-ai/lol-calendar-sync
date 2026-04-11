const ENDPOINT = "https://lol.fandom.com/api.php";

async function findStandardName(searchName) {
    // Search in Teams table for potential matches
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "Teams=T",
        fields: "T.Name",
        where: `T.Name LIKE '%${searchName.replace(/'/g, "\\'").replace(/[^\x00-\x7F]/g, "")}%' OR T.Short LIKE '%${searchName.replace(/[^\x00-\x7F]/g, "")}%'`,
        limit: "5"
    });

    try {
        const res = await fetch(`${ENDPOINT}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = await res.json();
        return data.cargoquery || [];
    } catch (e) {
        return [];
    }
}

async function main() {
    const list = ["Anyone's Legend", "Top Esports", "GD", "EDG", "Loud", "Cloud9", "G2 Esports"];
    for (const name of list) {
        console.log(`\nSearch for: ${name}`);
        const results = await findStandardName(name);
        console.log(JSON.stringify(results, null, 2));
    }
}

main().catch(console.error);
