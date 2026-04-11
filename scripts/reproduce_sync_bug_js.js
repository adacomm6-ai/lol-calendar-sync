
// const fetch = require('node-fetch'); // Using global fetch

const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchWithRetry(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    return await res.json();
}

async function run() {
    // 1. Fetch Match
    const dateStr = "2026-01-31";
    console.log(`Fetching matches for ${dateStr}...`);
    // Manual construct of params as per leaguepedia.ts
    const beijingMidnight = new Date(`${dateStr}T00:00:00+08:00`);
    const beijingEnd = new Date(`${dateStr}T23:59:59+08:00`);
    const toCargoUTC = (d) => d.toISOString().replace('T', ' ').substring(0, 19);
    const start = toCargoUTC(beijingMidnight);
    const end = toCargoUTC(beijingEnd);

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        fields: "SG.Tournament=Tournament, SG.Team1=Team1, SG.Team2=Team2, SG.DateTime_UTC=DateTimeUTC, SG.Winner=Winner, SG.MatchId=MatchId, SG.GameId=GameId, SG.N_GameInMatch=GameNumber",
        where: `SG.DateTime_UTC >= '${start}' AND SG.DateTime_UTC <= '${end}' AND (SG.Tournament LIKE '%LPL%' OR SG.Tournament LIKE '%LCK%')`,
        limit: "50"
    });

    const url = `${ENDPOINT}?${params.toString()}`;
    const data = await fetchWithRetry(url);
    const m = data.cargoquery.find(item => {
        const t1 = item.title.Team1;
        const t2 = item.title.Team2;
        return (t1.includes('Bilibili') && t2.includes('Invictus')) || (t2.includes('Bilibili') && t1.includes('Invictus'));
    });

    if (!m) {
        console.log("Match not found via API. Dumping available matches:");
        data.cargoquery.forEach(i => console.log(`${i.title.Team1} vs ${i.title.Team2}`));
        return;
    }

    const matchVal = m.title;
    console.log(`Found: ${matchVal.Team1} vs ${matchVal.Team2}, GameId: ${matchVal.GameId}`);

    // 2. Fetch Players
    const gameId = matchVal.GameId;
    const pParams = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP",
        fields: "SP.Name, SP.Team, SP.Role, SP.GameId",
        where: `SP.GameId = '${gameId}'`,
        limit: "50"
    });

    const pData = await fetchWithRetry(`${ENDPOINT}?${pParams.toString()}`);
    const players = pData.cargoquery.map(i => i.title);

    console.log(`Fetched ${players.length} players for GameId ${gameId}:`);
    players.forEach(p => console.log(`- ${p.Name} (${p.Team})`));

    // 3. Simulate Filter
    const normalizeName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dbTeamA = { name: "Bilibili Gaming", shortName: "BLG" };
    const dbTeamB = { name: "Invictus Gaming", shortName: "iG" };

    const teamAName = normalizeName(dbTeamA.name);
    const teamAShort = normalizeName(dbTeamA.shortName);
    const teamBName = normalizeName(dbTeamB.name);
    const teamBShort = normalizeName(dbTeamB.shortName);

    console.log(`\nDB Config: A=${teamAName}|${teamAShort}, B=${teamBName}|${teamBShort}`);

    const matchA = players.filter(p => {
        const t = normalizeName(p.Team);
        return t.includes(teamAName) || (teamAShort && t.includes(teamAShort)) || teamAName.includes(t);
    });

    const matchB = players.filter(p => {
        const t = normalizeName(p.Team);
        return t.includes(teamBName) || (teamBShort && t.includes(teamBShort)) || teamBName.includes(t);
    });

    console.log(`\nMatched A (${matchA.length}):`, matchA.map(p => p.Name).join(', '));
    console.log(`Matched B (${matchB.length}):`, matchB.map(p => p.Name).join(', '));
}

run();
