
import { fetchDailyMatches, fetchPlayersForGames } from '../src/lib/leaguepedia';

async function run() {
    const dateStr = "2026-01-31";
    console.log(`Fetching matches for ${dateStr}...`);
    const matches = await fetchDailyMatches(dateStr);

    // Find BLG vs IG
    const blgVsIg = matches.find(m => (m.team1 === 'Bilibili Gaming' && m.team2 === 'Invictus Gaming') || (m.team2 === 'Bilibili Gaming' && m.team1 === 'Invictus Gaming'));

    if (!blgVsIg) {
        console.error("Match not found!");
        return;
    }

    console.log(`Found Match: ${blgVsIg.team1} vs ${blgVsIg.team2} (Winner: ${blgVsIg.winner})`);
    console.log(`Game ID: ${blgVsIg.gameId}`);

    // Fetch players
    const playersMap = await fetchPlayersForGames([blgVsIg.gameId]);
    const players = playersMap[blgVsIg.gameId];

    console.log(`Fetched ${players.length} players.`);

    // Simulate Filter
    const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Simulate DB Teams
    const dbTeamA = { name: "Bilibili Gaming", shortName: "BLG" };
    const dbTeamB = { name: "Invictus Gaming", shortName: "iG" }; // Assuming iG or IG

    const teamAName = normalizeName(dbTeamA.name);
    const teamAShort = normalizeName(dbTeamA.shortName);
    const teamBName = normalizeName(dbTeamB.name);
    const teamBShort = normalizeName(dbTeamB.shortName);

    console.log(`TeamA: ${teamAName} (${teamAShort})`);
    console.log(`TeamB: ${teamBName} (${teamBShort})`);

    players.forEach(p => {
        const t = normalizeName(p.team);
        const matchA = t.includes(teamAName) || (teamAShort && t.includes(teamAShort)) || teamAName.includes(t);
        const matchB = t.includes(teamBName) || (teamBShort && t.includes(teamBShort)) || teamBName.includes(t);

        console.log(`Player: ${p.name.padEnd(10)} | Team: ${p.team.padEnd(20)} | Norm: ${t.padEnd(20)} | MatchA: ${matchA} | MatchB: ${matchB}`);
    });
}

run();
