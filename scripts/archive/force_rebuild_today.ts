
import { PrismaClient } from '@prisma/client';
import { fetchDailyMatches, fetchPlayersForGames } from '../../src/lib/leaguepedia';
import { format } from 'date-fns';

const prisma = new PrismaClient();

// Use the same normalization logic as the main app
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
    // 1. Get current date (today)
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    console.log(`\n[Force Sync] Starting batch sync for date: ${dateStr}`);

    // 2. Fetch all matches from Leaguepedia for today
    const lpGames = await fetchDailyMatches(dateStr);
    if (lpGames.length === 0) {
        console.log("No matches found on Leaguepedia for today.");
        return;
    }

    // Group by MatchId
    const lpSeriesMap = new Map<string, any[]>();
    lpGames.forEach(g => {
        if (!lpSeriesMap.has(g.matchId)) lpSeriesMap.set(g.matchId, []);
        lpSeriesMap.get(g.matchId)?.push(g);
    });

    console.log(`Found ${lpSeriesMap.size} series to process.`);

    // 3. Process each series
    for (const [matchId, games] of lpSeriesMap.entries()) {
        const info = games[0];
        console.log(`\n--- Processing Match: ${info.team1} vs ${info.team2} (${games.length} games) ---`);

        // Find match in DB
        const dbMatches = await prisma.match.findMany({
            include: { teamA: true, teamB: true }
        });

        // Fuzzy match
        const dbMatch = dbMatches.find(dbm => {
            const dbA = normalize(dbm.teamA?.name || 'TBD');
            const dbB = normalize(dbm.teamB?.name || 'TBD');
            const lp1 = normalize(info.team1);
            const lp2 = normalize(info.team2);
            return (dbA.includes(lp1) || lp1.includes(dbA)) && (dbB.includes(lp2) || lp2.includes(dbB)) ||
                (dbA.includes(lp2) || lp2.includes(dbA)) && (dbB.includes(lp1) || lp1.includes(dbB));
        });

        if (!dbMatch) {
            console.warn(`[Skip] Could not find match in DB for ${info.team1} vs ${info.team2}`);
            continue;
        }

        console.log(`[Found] Linked to DB Match ID: ${dbMatch.id}`);

        // Batch Fetch Players
        const gameIds = games.map(g => g.gameId);
        await new Promise(r => setTimeout(r, 2000)); // Rate limit safety
        const allPlayersMap = await fetchPlayersForGames(gameIds);

        for (const lpg of games) {
            console.log(`  Syncing Game ${lpg.gameNumber}...`);

            const players = allPlayersMap[lpg.gameId] || [];
            if (players.length === 0) {
                console.warn(`  [Warning] No players for Game ${lpg.gameNumber}`);
                continue;
            }

            // Map Players to Team A/B
            const teamAName = normalize(dbMatch.teamA?.name || 'TBD');
            const teamAShort = normalize(dbMatch.teamA?.shortName || '');
            const playersA = players.filter(p => {
                const t = normalize(p.team);
                return t.includes(teamAName) || (teamAShort && t.includes(teamAShort)) || teamAName.includes(t);
            });
            const playersB = players.filter(p => !playersA.includes(p));

            const mapStats = (plist: any[]) => {
                const roleOrder: Record<string, number> = { 'top': 1, 'jungle': 2, 'mid': 3, 'bot': 4, 'support': 5 };
                const getScore = (r: string) => roleOrder[r?.toLowerCase()] || 99;

                return plist.map(p => {
                    const safeHero = p.champion || 'Unknown';
                    const filename = safeHero.replace(/[^a-zA-Z0-9]/g, '');
                    return {
                        name: p.name,
                        hero: safeHero,
                        hero_avatar: `/images/champions/${filename}.png`,
                        kills: p.kills,
                        deaths: p.deaths,
                        assists: p.assists,
                        damage: p.damage,
                        cs: p.cs,
                        role: p.role,
                        team: p.team
                    };
                }).sort((a, b) => getScore(a.role) - getScore(b.role));
            };

            const teamAData = mapStats(playersA);
            const teamBData = mapStats(playersB);

            // Mapping Bans/Winner (using the logic I just added to actions.ts)
            const t1Norm = normalize(lpg.team1);
            const isTeam1A = teamAName.includes(t1Norm) || t1Norm.includes(teamAName) || (teamAShort && (teamAShort.includes(t1Norm) || t1Norm.includes(teamAShort)));

            const teamABans = isTeam1A ? (lpg.team1Bans || []) : (lpg.team2Bans || []);
            const teamBBans = isTeam1A ? (lpg.team2Bans || []) : (lpg.team1Bans || []);
            const winnerId = lpg.winner === 1 ? (isTeam1A ? dbMatch.teamAId : dbMatch.teamBId) : (isTeam1A ? dbMatch.teamBId : dbMatch.teamAId);

            const analysisData = {
                teamA: { name: dbMatch.teamA?.name || 'TBD', players: teamAData, bans: teamABans },
                teamB: { name: dbMatch.teamB?.name || 'TBD', players: teamBData, bans: teamBBans },
                damage_data: [...teamAData, ...teamBData],
                duration: 0
            };

            const dataPayload = {
                winnerId,
                teamAStats: JSON.stringify(teamAData),
                teamBStats: JSON.stringify(teamBData),
                analysisData: JSON.stringify(analysisData)
            };

            // CHECK EXISTING DATA (Safe without unique constraint)
            const existingGame = await prisma.game.findFirst({
                where: { matchId: dbMatch.id, gameNumber: lpg.gameNumber }
            });

            if (existingGame) {
                await prisma.game.update({
                    where: { id: existingGame.id },
                    data: dataPayload
                });
            } else {
                await prisma.game.create({
                    data: {
                        matchId: dbMatch.id,
                        gameNumber: lpg.gameNumber,
                        ...dataPayload
                    }
                });
            }
        }
        console.log(`[Success] Match ${dbMatch.id} fully re-synced.`);
    }

    console.log("\n[Done] All matches for today have been force-synced.");
}

main().catch(e => console.error(e));
