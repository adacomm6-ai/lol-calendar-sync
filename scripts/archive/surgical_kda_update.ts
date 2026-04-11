
import { PrismaClient } from '@prisma/client';
import { fetchDailyMatches, fetchPlayersForGames } from '../../src/lib/leaguepedia';

const prisma = new PrismaClient();

// Helper
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
    const matchId = process.argv[2];
    if (!matchId) {
        console.error("Please provide a DB Match ID");
        process.exit(1);
    }

    console.log(`[Surgical Update] Target Match: ${matchId}`);

    // 1. Fetch DB Match
    const dbMatch = await prisma.match.findUnique({
        where: { id: matchId },
        include: { games: true, teamA: true, teamB: true }
    });

    if (!dbMatch) {
        console.error("Match not found in DB");
        process.exit(1);
    }

    // 2. Determine Date for LP Fetch
    // We assume the match date is roughly correct, but we might need to search a range or use the stored date.
    // LP Date is string YYYY-MM-DD.
    if (!dbMatch.startTime) {
        console.error("Match has no start time - cannot sync.");
        process.exit(1);
    }
    const dateStr = dbMatch.startTime.toISOString().split('T')[0];
    console.log(`[Surgical Update] Fetching LP data for date: ${dateStr}`);

    const lpMatches = await fetchDailyMatches(dateStr);

    // Fuzzy match LP Match to DB Match
    // We match by comparing normalized team names.
    const dbATeam = normalize(dbMatch.teamA?.name || 'TBD');
    const dbBTeam = normalize(dbMatch.teamB?.name || 'TBD');

    const targetLpMatch = lpMatches.find((m: any) => {
        const t1 = normalize(m.team1);
        const t2 = normalize(m.team2);
        const matchA = (t1.includes(dbATeam) || dbATeam.includes(t1)) && (t2.includes(dbBTeam) || dbBTeam.includes(t2));
        const matchB = (t1.includes(dbBTeam) || dbBTeam.includes(t1)) && (t2.includes(dbATeam) || dbATeam.includes(t2));
        return matchA || matchB;
    });

    if (!targetLpMatch) {
        console.error("Could not find corresponding match in Leaguepedia for this date/teams.");
        process.exit(1);
    }

    console.log(`[Surgical Update] Found LP Match: ${targetLpMatch.matchId} (${targetLpMatch.team1} vs ${targetLpMatch.team2})`);

    // 3. Fetch Players
    const lpGames = lpMatches.filter((m: any) => m.matchId === targetLpMatch.matchId);
    const gameIds = lpGames.map((g: any) => g.gameId);

    // Rate Limit Safety (Manual 2s)
    await new Promise(r => setTimeout(r, 2000));
    const allPlayersMap = await fetchPlayersForGames(gameIds);

    // 4. Update Games
    for (const game of dbMatch.games) {
        const lpGame = lpGames.find((lpg: any) => lpg.gameNumber === game.gameNumber);
        if (!lpGame) {
            console.warn(`[Skip] No LP data for Game ${game.gameNumber}`);
            continue;
        }

        const players = allPlayersMap[lpGame.gameId] || [];
        if (players.length === 0) {
            console.warn(`[Skip] No player stats for Game ${game.gameNumber}`);
            continue;
        }

        console.log(`[Update] Processing Game ${game.gameNumber} (${players.length} players found)...`);

        // Parse Local Data
        let analysisData: any = {};
        try {
            if (game.analysisData) analysisData = JSON.parse(game.analysisData);
        } catch (e) {
            console.error(`Failed to parse analysisData for Game ${game.gameNumber}`);
        }

        // We need to match existing players in `analysisData.teamA.players` and `teamB`.
        // We will NOT change structure, just update values.

        const updateList = (localList: any[]) => {
            if (!localList) return [];
            return localList.map(localP => {
                // Find matching LP Player
                // Match by Role (safest if rosters aligned) or Name
                const role = localP.role?.toLowerCase();
                let lpP = players.find((p: any) => p.role.toLowerCase() === role);

                // Fallback: Name match (fuzzy)
                if (!lpP && localP.name) {
                    const localN = normalize(localP.name);
                    lpP = players.find((p: any) => normalize(p.name) === localN);
                }

                if (lpP) {
                    return {
                        ...localP,
                        kills: lpP.kills,
                        deaths: lpP.deaths,
                        assists: lpP.assists,
                        damage: lpP.damage,
                        cs: lpP.cs
                        // KEEP hero, name, etc from Local!
                    };
                }
                return localP;
            });
        };

        if (analysisData.teamA && analysisData.teamA.players) {
            analysisData.teamA.players = updateList(analysisData.teamA.players);
        }
        if (analysisData.teamB && analysisData.teamB.players) {
            analysisData.teamB.players = updateList(analysisData.teamB.players);
        }

        // Also update flat damage_data if present
        if (analysisData.damage_data) {
            // Rebuild from updated teams
            analysisData.damage_data = [
                ...(analysisData.teamA?.players || []),
                ...(analysisData.teamB?.players || [])
            ];
        }

        const payloads: any = {
            analysisData: JSON.stringify(analysisData)
        };

        // Update redundant columns if they exist
        if (analysisData.teamA?.players) payloads.teamAStats = JSON.stringify(analysisData.teamA.players);
        if (analysisData.teamB?.players) payloads.teamBStats = JSON.stringify(analysisData.teamB.players);

        await prisma.game.update({
            where: { id: game.id },
            data: payloads
        });

        console.log(`[Success] Updated KDA for Game ${game.gameNumber}`);
    }

    console.log("Done.");
}

main().catch(e => console.error(e));
