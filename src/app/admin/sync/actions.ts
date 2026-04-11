
'use server';

import { prisma } from '@/lib/db';
import { fetchDailyMatches, fetchPlayersForGames, fetchTeamRoster, LeaguepediaMatch, LeaguepediaPlayer, fetchAllTournamentMatches } from '@/lib/leaguepedia';
import { revalidatePath } from 'next/cache';
import * as fs from 'fs';
import * as path from 'path';

function logDebug(msg: string) {
    try {
        const logPath = path.join(process.cwd(), 'debug_sync.log');
        fs.appendFileSync(logPath, new Date().toISOString() + ': ' + msg + '\n');
    } catch (e) { console.error('Log failed', e); }
}

// Helper to normalize strings for comparison
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function getDailySyncStatus(dateStr: string) {
    // Pass string directly to avoid timezone shift
    const lpMatches = await fetchDailyMatches(dateStr);

    // 2. Fetch DB Matches (start of day to end of day)
    // For DB, we need UTC Range for that specific day
    const start = new Date(dateStr + "T00:00:00Z"); // Treat input as UTC start used for DB range?
    // Wait, DB stores UTC. Leaguepedia stores UTC.
    // If user picks "2026-01-24".
    // LP Query: 2026-01-24 00:00 to 23:59.
    // DB Query: 2026-01-24 00:00Z to 23:59Z.
    // This aligns perfectly.
    const end = new Date(dateStr + "T23:59:59Z");

    const dbMatches = await prisma.match.findMany({
        where: {
            startTime: {
                gte: start,
                lte: end
            }
        },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    // 3. Match them up
    // We group LP matches by Series (MatchId)
    // LP returns list of GAMES. We need to group into Series.
    const lpSeriesMap = new Map<string, { info: LeaguepediaMatch, games: LeaguepediaMatch[] }>();

    lpMatches.forEach(m => {
        if (!lpSeriesMap.has(m.matchId)) {
            lpSeriesMap.set(m.matchId, { info: m, games: [] });
        }
        lpSeriesMap.get(m.matchId)?.games.push(m);
    });

    const syncItems = [];

    // Iterate LP Series
    for (const [lpId, series] of lpSeriesMap.entries()) {
        const info = series.info;
        const nTeam1 = normalize(info.team1);
        const nTeam2 = normalize(info.team2);

        // Find in DB
        const dbMatch = dbMatches.find(dbm => {
            const dbA = normalize(dbm.teamA?.name || 'TBD');
            const dbB = normalize(dbm.teamB?.name || 'TBD');
            const dbShortA = normalize(dbm.teamA?.shortName || '');
            const dbShortB = normalize(dbm.teamB?.shortName || '');

            // Match A vs 1 && B vs 2 (or swap)
            // Check Name OR ShortName
            const matchA1 = dbA.includes(nTeam1) || nTeam1.includes(dbA) || (dbShortA && (dbShortA === nTeam1 || nTeam1.includes(dbShortA)));
            const matchB2 = dbB.includes(nTeam2) || nTeam2.includes(dbB) || (dbShortB && (dbShortB === nTeam2 || nTeam2.includes(dbShortB)));

            const matchA2 = dbA.includes(nTeam2) || nTeam2.includes(dbA) || (dbShortA && (dbShortA === nTeam2 || nTeam2.includes(dbShortA)));
            const matchB1 = dbB.includes(nTeam1) || nTeam1.includes(dbB) || (dbShortB && (dbShortB === nTeam1 || nTeam1.includes(dbShortB)));

            return (matchA1 && matchB2) || (matchA2 && matchB1);
        });

        // Check if DB Match has actual stats data (Synced)
        const isSynced = dbMatch && dbMatch.games.length > 0 && dbMatch.games.some(g => g.analysisData && g.analysisData.length > 10);

        syncItems.push({
            lpId,
            lpTeam1: info.team1,
            lpTeam2: info.team2,
            lpGameCount: series.games.length,
            dbMatchId: dbMatch?.id || null,
            dbTeamA: dbMatch?.teamA?.name || 'TBD',
            dbTeamB: dbMatch?.teamB?.name || 'TBD',
            dbGameCount: dbMatch?.games.length || 0,
            status: dbMatch ? (dbMatch.games.length === series.games.length ? 'MATCHED' : 'PARTIAL') : 'MISSING',
            isSynced: !!isSynced
        });
    }

    return { lpMatches, dbMatches, syncItems };
}

// Helper to execute Merge Logic without saving
// Returns the dataPayloads for each game in the match
export async function previewSyncMatch(lpMatchId: string, dbMatchId: string | null, dateStr: string) {
    // 1. Fetch LP Data (Same as syncMatch)
    const allLp = await fetchDailyMatches(dateStr);
    const lpGames = allLp.filter(m => m.matchId === lpMatchId);
    if (lpGames.length === 0) return { success: false, error: "LP Match not found" };

    const info = lpGames[0];
    let matchId = dbMatchId;

    // Resolve DB Match (ReadOnly check)
    // Helper for robust team resolution (DB Agnostic)
    const resolveTeamRobust = async (name: string) => {
        const n = normalize(name);
        const allTeams = await prisma.team.findMany(); // Fetch all (Cached by DB mostly, small set)

        // 1. Exact/Normalized Match on ShortName
        let t = allTeams.find(tim => normalize(tim.shortName || '') === n);
        // 2. Exact/Normalized Match on Name
        if (!t) t = allTeams.find(tim => normalize(tim.name) === n);
        // 3. Contains (Loose)
        if (!t) t = allTeams.find(tim => normalize(tim.name).includes(n) || n.includes(normalize(tim.name)));

        return t || null;
    };

    if (!matchId) {
        // Try to find match just to show preview info
        const t1 = await resolveTeamRobust(info.team1);
        const t2 = await resolveTeamRobust(info.team2);
        if (!t1 || !t2) return { success: false, error: "Teams not found in DB (Cannot preview)" };
    }

    const previews = [];

    // We need dbMatch to merge.
    let dbMatch: any = null;
    if (matchId) {
        dbMatch = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
    } else {
        // Resolve teams temporarily
        const tA = await resolveTeamRobust(info.team1);
        const tB = await resolveTeamRobust(info.team2);
        if (tA && tB) {
            dbMatch = { teamA: tA, teamB: tB, teamAId: tA.id, teamBId: tB.id };
        }
    }

    if (!dbMatch) return { success: false, error: "Cannot resolve match context for preview" };

    // Rate Limit Safety: Wait 2 seconds before making another request to avoid burst detection
    await new Promise(r => setTimeout(r, 2000));

    // BATCH FETCH PLAYERS
    const gameIds = lpGames.map(g => g.gameId);
    const allPlayersMap = await fetchPlayersForGames(gameIds);

    // Check if we actually got data (check if empty object or all values empty)
    const totalPlayersFound = Object.values(allPlayersMap).reduce((acc, list) => acc + list.length, 0);
    if (totalPlayersFound === 0) {
        console.error("[Preview] No players found for any game. API might be failing.");
        return { success: false, error: "Failed to fetch player data from API (Rate Limit or No Data). Please try again in 30 seconds." };
    }

    for (const lpg of lpGames) {
        const playerStats = allPlayersMap[lpg.gameId] || [];
        logDebug(`[Preview] Game ${lpg.gameNumber} (ID: ${lpg.gameId}): Fetched ${playerStats.length} players.`);
        if (playerStats.length > 0) {
            logDebug(`[Preview] Sample Player: ${playerStats[0].name} (${playerStats[0].team})`);
        }

        // Map Players
        const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const teamAName = normalizeName(dbMatch.teamA?.name || 'TBD');
        // Also check shortName
        const teamAShort = normalizeName(dbMatch.teamA?.shortName || '');
        const teamBName = normalizeName(dbMatch.teamB?.name || 'TBD');
        const teamBShort = normalizeName(dbMatch.teamB?.shortName || '');

        logDebug(`[Preview] Matching vs DB: A='${teamAName}'(${teamAShort}), B='${teamBName}'(${teamBShort})`);

        const playersA = playerStats.filter(p => {
            const t = normalizeName(p.team);
            const matchName = t.includes(teamAName) || teamAName.includes(t);
            // Strict Short Name: Exact match if <= 2 chars, otherwise valid prefix
            const matchShort = teamAShort && (t === teamAShort || (teamAShort.length > 2 && t.startsWith(teamAShort)));
            return matchName || matchShort;
        });
        const playersB = playerStats.filter(p => {
            const t = normalizeName(p.team);
            const matchName = t.includes(teamBName) || teamBName.includes(t);
            // Strict Short Name: Exact match if <= 2 chars, otherwise valid prefix
            const matchShort = teamBShort && (t === teamBShort || (teamBShort.length > 2 && t.startsWith(teamBShort)));
            return matchName || matchShort;
        });

        logDebug(`[Preview] Matches Found: TeamA=${playersA.length}, TeamB=${playersB.length}`);

        const mapPlayers = (players: LeaguepediaPlayer[]) => players.map(p => ({
            name: p.name,
            hero: p.champion,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            damage: p.damage,
            cs: p.cs,
            role: p.role,
            team: p.team
        }));


        const teamAData = mapPlayers(playersA);
        const teamBData = mapPlayers(playersB);

        logDebug(`[Preview] Game ${lpg.gameNumber} TeamA Player[0] KDA: ${teamAData[0]?.kills}/${teamAData[0]?.deaths}/${teamAData[0]?.assists}`);
        logDebug(`[Preview] Game ${lpg.gameNumber} Raw Bans: T1=${lpg.team1Bans?.join(',')}, T2=${lpg.team2Bans?.join(',')}`);

        const t1Norm = normalizeName(lpg.team1);
        const t2Norm = normalizeName(lpg.team2);
        const isTeam1MatchA = teamAName.includes(t1Norm) || t1Norm.includes(teamAName) || (teamAShort && (teamAShort.includes(t1Norm) || t1Norm.includes(teamAShort)));

        let teamABans: string[] = isTeam1MatchA ? (lpg.team1Bans || []) : (lpg.team2Bans || []);
        let teamBBans: string[] = isTeam1MatchA ? (lpg.team2Bans || []) : (lpg.team1Bans || []);
        let winnerId = lpg.winner === 1 ? (isTeam1MatchA ? dbMatch.teamAId : dbMatch.teamBId) : (isTeam1MatchA ? dbMatch.teamBId : dbMatch.teamAId);

        let finalTeamA = teamAData;
        let finalTeamB = teamBData;

        // Check Existing for Merge
        let existingGame: any = null;
        if (matchId) {
            existingGame = await prisma.game.findFirst({
                where: { matchId, gameNumber: lpg.gameNumber }
            });
        }

        if (existingGame) {
            // ... (Existing merge logic remains, assume bans might be overwritten if not present)
            // For now, let's focus on Preview structure.
        }

        previews.push({
            gameNumber: lpg.gameNumber,
            teamA: finalTeamA,
            teamB: finalTeamB,
            teamABans,
            teamBBans,
            winnerId
        });
    }

    return { success: true, previews, teamA: dbMatch.teamA, teamB: dbMatch.teamB };
}

export async function syncMatch(lpMatchId: string, dbMatchId: string | null, dateStr: string, force: boolean = false) {
    if (!lpMatchId) return { success: false, error: "Missing LP ID" };

    console.log(`Syncing Match: LP=${lpMatchId}, DB=${dbMatchId}, Date=${dateStr}, Force=${force}`);

    // 1. Fetch LP Data
    const allLp = await fetchDailyMatches(dateStr);
    const lpGames = allLp.filter(m => m.matchId === lpMatchId);

    if (lpGames.length === 0) return { success: false, error: "LP Match not found (Date mismatch?)" };

    const info = lpGames[0];

    // 2. Resolve or Create DB Match
    let matchId = dbMatchId;

    // Helper for robust team resolution (DB Agnostic)
    const resolveTeamRobust = async (name: string) => {
        const n = normalize(name);
        const allTeams = await prisma.team.findMany(); // Fetch all (Cached by DB mostly, small set)

        // 1. Exact/Normalized Match on ShortName
        let t = allTeams.find(tim => normalize(tim.shortName || '') === n);
        // 2. Exact/Normalized Match on Name
        if (!t) t = allTeams.find(tim => normalize(tim.name) === n);
        // 3. Contains (Loose)
        if (!t) t = allTeams.find(tim => normalize(tim.name).includes(n) || n.includes(normalize(tim.name)));

        return t || null;
    };

    if (!matchId) {
        const t1 = await resolveTeamRobust(info.team1);
        const t2 = await resolveTeamRobust(info.team2);

        if (!t1 || !t2) return { success: false, error: `Teams not found: ${info.team1}, ${info.team2}` };

        const newMatch = await prisma.match.create({
            data: {
                startTime: new Date(info.date.replace(' ', 'T') + 'Z'), // LP is UTC
                teamAId: t1.id,
                teamBId: t2.id,
                status: 'FINISHED',
                tournament: info.tournament || 'LPL'
            }
        });
        matchId = newMatch.id;
    }

    if (!matchId) return { success: false, error: "Failed to resolve DB Match" };

    const dbMatch = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
    if (!dbMatch) return { success: false, error: "DB Match Missing" };

    // 3. Sync Games
    const conflicts: string[] = [];
    let updates = 0;

    // BATCH FETCH PLAYERS
    const gameIds = lpGames.map(g => g.gameId);
    const allPlayersMap = await fetchPlayersForGames(gameIds);

    for (const lpg of lpGames) {
        // Find existing game by number
        const existingGame = await prisma.game.findFirst({
            where: { matchId, gameNumber: lpg.gameNumber }
        });

        // Prepare LP Data
        const playerStats = allPlayersMap[lpg.gameId] || [];
        console.log(`[Sync] Game ${lpg.gameNumber}: Fetched ${playerStats.length} players (Batch).`);

        // Map Players to Team A / B
        const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const teamAName = normalizeName(dbMatch.teamA?.name || 'TBD');
        // Also check shortName
        const teamAShort = normalizeName(dbMatch.teamA?.shortName || '');
        const teamBName = normalizeName(dbMatch.teamB?.name || 'TBD');
        const teamBShort = normalizeName(dbMatch.teamB?.shortName || '');

        const playersA = playerStats.filter(p => {
            const t = normalizeName(p.team);
            const matchName = t.includes(teamAName) || teamAName.includes(t);
            // Strict Short Name: Exact match if <= 2 chars, otherwise valid prefix
            const matchShort = teamAShort && (t === teamAShort || (teamAShort.length > 2 && t.startsWith(teamAShort)));
            return matchName || matchShort;
        });
        const playersB = playerStats.filter(p => {
            const t = normalizeName(p.team);
            const matchName = t.includes(teamBName) || teamBName.includes(t);
            // Strict Short Name: Exact match if <= 2 chars, otherwise valid prefix
            const matchShort = teamBShort && (t === teamBShort || (teamBShort.length > 2 && t.startsWith(teamBShort)));
            return matchName || matchShort;
        });

        const mapPlayers = (players: LeaguepediaPlayer[]) => {
            const roleOrder: Record<string, number> = { 'top': 1, 'jungle': 2, 'mid': 3, 'bot': 4, 'support': 5 };
            const getScore = (r: string) => roleOrder[r?.toLowerCase()] || 99;

            return players.map(p => {
                const safeHero = p.champion || 'Unknown';
                // Remove spaces/apostrophes for filename convention (Simple DDragon style)
                const filename = safeHero.replace(/[^a-zA-Z0-9]/g, '');
                return {
                    name: p.name,
                    hero: safeHero, // Keep readable name
                    hero_avatar: `/images/champions/${filename}.png`, // Path for GameSummaryPanel
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

        const teamAData = mapPlayers(playersA);
        const teamBData = mapPlayers(playersB);

        const t1Norm = normalizeName(lpg.team1);
        const t2Norm = normalizeName(lpg.team2);
        const isTeam1MatchA = teamAName.includes(t1Norm) || t1Norm.includes(teamAName) || (teamAShort && (teamAShort.includes(t1Norm) || t1Norm.includes(teamAShort)));

        let teamABans: string[] = isTeam1MatchA ? (lpg.team1Bans || []) : (lpg.team2Bans || []);
        let teamBBans: string[] = isTeam1MatchA ? (lpg.team2Bans || []) : (lpg.team1Bans || []);
        let winnerId = lpg.winner === 1 ? (isTeam1MatchA ? dbMatch.teamAId : dbMatch.teamBId) : (isTeam1MatchA ? dbMatch.teamBId : dbMatch.teamAId);

        logDebug(`[Sync] Game ${lpg.gameNumber} mapping: isTeam1A=${isTeam1MatchA}, winner=${lpg.winner}, mappedWinnerId=${winnerId}`);

        const lpHasStats = teamAData.length > 0 || teamBData.length > 0;

        const dataPayload: any = {
            winnerId
        };

        if (lpHasStats) {
            const analysisData = {
                teamA: { name: dbMatch.teamA?.name || 'TBD', players: teamAData, bans: teamABans },
                teamB: { name: dbMatch.teamB?.name || 'TBD', players: teamBData, bans: teamBBans },
                damage_data: [...teamAData, ...teamBData],
                duration: 0
            };

            dataPayload.teamAStats = JSON.stringify(teamAData);
            dataPayload.teamBStats = JSON.stringify(teamBData);
            dataPayload.analysisData = JSON.stringify(analysisData);
        }

        // CHECK EXISTING DATA
        if (existingGame) {
            let localJson: any = null;
            try {
                if (existingGame.analysisData && existingGame.analysisData.length > 50) {
                    localJson = JSON.parse(existingGame.analysisData);
                } else if (existingGame.teamAStats && existingGame.teamAStats.length > 10) {
                    localJson = {
                        teamA: { players: JSON.parse(existingGame.teamAStats) },
                        teamB: { players: JSON.parse(existingGame.teamBStats || '[]') }
                    };
                }
            } catch (e) {
                console.error("Error parsing existing game data:", e);
            }

            const hasStats = !!localJson;
            let shouldUpdate = false;

            if (force) {
                if (lpHasStats) shouldUpdate = true;
            } else if (!hasStats) {
                if (lpHasStats) shouldUpdate = true;
            } else {
                // Has Data: Smart Merge
                if (lpHasStats) {
                    try {
                        const roleOrder: Record<string, number> = { 'top': 1, 'jungle': 2, 'mid': 3, 'bot': 4, 'support': 5 };
                        const getRoleScore = (p: any) => roleOrder[p.role?.toLowerCase()] || 99;
                        const sortPlayers = (list: any[]) => [...list].sort((a, b) => getRoleScore(a) - getRoleScore(b));

                        const mergeTeam = (localTeam: any, lpPlayers: any[], lpBans: string[]) => {
                            if (!localTeam) return { players: lpPlayers, bans: lpBans };

                            const localSorted = sortPlayers(localTeam.players || []);
                            const lpSorted = sortPlayers(lpPlayers || []);

                            // If local players missing, use LP players
                            if (localSorted.length === 0 && lpSorted.length > 0) {
                                return { ...localTeam, players: lpSorted, bans: (localTeam.bans && localTeam.bans.length > 0) ? localTeam.bans : lpBans };
                            }

                            const mergedPlayers = localSorted.map((localP: any, index: number) => {
                                let lpP = lpSorted.find(lp => lp.role?.toLowerCase() === localP.role?.toLowerCase());
                                if (!lpP && index < lpSorted.length) lpP = lpSorted[index];

                                if (lpP) {
                                    return {
                                        ...localP,
                                        kills: lpP.kills,
                                        deaths: lpP.deaths,
                                        assists: lpP.assists,
                                        damage: lpP.damage,
                                        cs: lpP.cs,
                                        // Keep local name/hero if they exist
                                        name: (localP.name && localP.name !== '') ? localP.name : lpP.name,
                                        hero: (localP.hero && localP.hero !== '') ? localP.hero : lpP.hero
                                    };
                                }
                                return localP;
                            });

                            // Preserve Bans: only use LP bans if local ones are empty
                            const finalBans = (localTeam.bans && localTeam.bans.length > 0) ? localTeam.bans : lpBans;

                            return { ...localTeam, players: mergedPlayers, bans: finalBans };
                        };

                        const newTeamA = mergeTeam(localJson.teamA, teamAData, teamABans);
                        const newTeamB = mergeTeam(localJson.teamB, teamBData, teamBBans);

                        const newAnalysis = {
                            ...localJson,
                            teamA: newTeamA,
                            teamB: newTeamB,
                            damage_data: [...newTeamA.players, ...newTeamB.players]
                        };

                        // Preserve local winner if already set
                        if (existingGame.winnerId && !force) {
                            dataPayload.winnerId = existingGame.winnerId;
                        }

                        dataPayload.teamAStats = JSON.stringify(newTeamA.players);
                        dataPayload.teamBStats = JSON.stringify(newTeamB.players);
                        dataPayload.analysisData = JSON.stringify(newAnalysis);

                        shouldUpdate = true;
                    } catch (e) {
                        // Merge failed, stick to local OR overwrite if critical
                        // Safer to NOT update if merge crashes
                    }
                }
            }

            await prisma.game.update({
                where: { id: existingGame.id },
                data: {
                    ...dataPayload,
                    blueSideTeamId: isTeam1MatchA ? dbMatch.teamAId : dbMatch.teamBId,
                    redSideTeamId: isTeam1MatchA ? dbMatch.teamBId : dbMatch.teamAId
                }
            });
            updates++;
        } else {
            // Create New Game
            // Only create if LP Has Stats? Or create generic?
            // User can manually fill later.
            await prisma.game.create({
                data: {
                    matchId,
                    gameNumber: lpg.gameNumber,
                    ...dataPayload,
                    blueSideTeamId: isTeam1MatchA ? dbMatch.teamAId : dbMatch.teamBId,
                    redSideTeamId: isTeam1MatchA ? dbMatch.teamBId : dbMatch.teamAId
                }
            });
            updates++;
        }
    }

    revalidatePath('/admin/sync');
    revalidatePath(`/match/${matchId}`);

    if (conflicts.length > 0) {
        return { success: true, updates, conflicts };
    }

    return { success: true, updates };
}

export async function syncTeamRoster(teamId: string) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return { success: false, error: "Team not found" };

    console.log(`[Sync] Updating roster for team: ${team.name}`);

    // Support variations like "Ninjas in Pyjamas.CN"
    let roster = await fetchTeamRoster(team.name);
    if (roster.length === 0 && !team.name.endsWith('.CN')) {
        console.log(`[Sync] No roster for ${team.name}, trying with .CN suffix...`);
        roster = await fetchTeamRoster(`${team.name}.CN`);
    }

    if (roster.length === 0) return { success: false, error: "No roster found on Leaguepedia" };

    let updates = 0;
    let creates = 0;

    for (const p of roster) {
        // Normalize role to UPPERCASE for DB consistency
        const normalizedRole = (p.role || 'UNKNOWN').toUpperCase();

        // Find by name first
        const existing = await prisma.player.findFirst({
            where: {
                teamId: team.id,
                name: p.id
            }
        });

        const photoPath = p.image ? `/images/players/${p.image.replace(/ /g, '_')}` : null;

        if (existing) {
            await prisma.player.update({
                where: { id: existing.id },
                data: {
                    role: normalizedRole,
                    photo: photoPath || existing.photo
                }
            });
            updates++;
        } else {
            // Check if player exists in another team (transfer)
            const globalPlayer = await prisma.player.findFirst({
                where: { name: p.id }
            });

            if (globalPlayer) {
                // Perform Transfer
                await prisma.player.update({
                    where: { id: globalPlayer.id },
                    data: {
                        teamId: team.id,
                        role: normalizedRole,
                        photo: photoPath || globalPlayer.photo
                    }
                });
                updates++;
            } else {
                // New Player
                await prisma.player.create({
                    data: {
                        name: p.id,
                        role: normalizedRole,
                        teamId: team.id,
                        photo: photoPath,
                        split: 'Split 1'
                    }
                });
                creates++;
            }
        }
    }

    revalidatePath(`/teams/${teamId}`);
    revalidatePath('/admin/teams');
    revalidatePath('/analysis');

    return { success: true, updates, creates };
}

/**
 * NEW ARCHITECTURE: Sandbox Fetching
 * Grabs all LP matches for a tournament, maps them to DB states, and returns a "Review Pool" 
 * instead of blindly inserting into DB.
 */
export async function fetchFullTournamentToSandbox(tournamentName: string) {
    console.log(`[Sandbox] Initiating full tournament scan for: ${tournamentName}`);
    try {
        const lpMatches = await fetchAllTournamentMatches(tournamentName);
        if (!lpMatches || lpMatches.length === 0) {
            return { success: false, error: "未找到任何该赛段的数据 (No matches found)" };
        }

        const lpSeriesMap = new Map<string, { info: LeaguepediaMatch, games: LeaguepediaMatch[] }>();

        lpMatches.forEach(m => {
            if (!lpSeriesMap.has(m.matchId)) {
                lpSeriesMap.set(m.matchId, { info: m, games: [] });
            }
            lpSeriesMap.get(m.matchId)?.games.push(m);
        });

        // 1. Fetch DB Base (To check for conflict)
        const allTeams = await prisma.team.findMany();
        const dbMatches = await prisma.match.findMany({
            include: { teamA: true, teamB: true, games: true }
        });

        const resolveTeamRobust = (name: string) => {
            const n = normalize(name);
            let t = allTeams.find(tim => normalize(tim.shortName || '') === n);
            if (!t) t = allTeams.find(tim => normalize(tim.name) === n);
            if (!t) t = allTeams.find(tim => normalize(tim.name).includes(n) || n.includes(normalize(tim.name)));
            return t || null;
        };

        const sandboxItems = [];
        let index = 0;

        for (const [lpId, series] of lpSeriesMap.entries()) {
            const info = series.info;
            const tA = resolveTeamRobust(info.team1);
            const tB = resolveTeamRobust(info.team2);

            let status = 'NEW';
            let issue = '';

            // 2. Conflict Phase 1: Team Missing
            if (!tA || !tB) {
                status = 'CONFLICT';
                issue = `系统缺少战队映射: ${!tA ? info.team1 : ''} ${!tB ? info.team2 : ''}`.trim();
            }

            // 3. Find match in DB
            let dbMatch = null;
            if (tA && tB) {
                dbMatch = dbMatches.find(dbm => {
                    const isMatch = (dbm.teamAId === tA.id && dbm.teamBId === tB.id) || (dbm.teamAId === tB.id && dbm.teamBId === tA.id);
                    // Match date closely (LP is exact UTC time, Db might be just local day)
                    const lpDateStr = info.date.split(' ')[0];
                    const dbDateStr = dbm.startTime ? dbm.startTime.toISOString().split('T')[0] : '';
                    return isMatch && (lpDateStr === dbDateStr || !dbm.startTime);
                });
            }

            // 4. State Determination
            if (dbMatch) {
                const isFullySynced = dbMatch.games.length > 0 && dbMatch.games.some(g => g.analysisData && g.analysisData.length > 10);

                if (isFullySynced && dbMatch.games.length === series.games.length) {
                    status = 'IN_SYNC';
                } else if (isFullySynced) {
                    // Db has data but Game count mismatched! Danger!
                    status = 'CONFLICT';
                    issue = `局数断档 (本地 ${dbMatch.games.length} 局 vs 云端 ${series.games.length} 局)`;
                } else {
                    // Db match exists (maybe created manually), but no stats ripped yet
                    status = 'PARTIAL';
                }
            }

            sandboxItems.push({
                id: index++,
                lpId: lpId,
                date: info.date,
                lpTeam1: info.team1,
                lpTeam2: info.team2,
                lpGameCount: series.games.length,
                winner: info.winner,
                dbMatchId: dbMatch?.id || null,
                dbTeamA: tA,
                dbTeamB: tB,
                status: status,
                issue: issue
            });
        }

        console.log(`[Sandbox] Processed ${sandboxItems.length} unique BO Series matching criteria.`);
        return { success: true, count: sandboxItems.length, items: sandboxItems };

    } catch (e: any) {
        console.error("[Sandbox] Fatal Error:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Executes the sync for a batch of approved Sandbox Items.
 * This is called by the UI after the user resolves conflicts and clicks "Import".
 */
export async function confirmSandboxBatch(approvedItems: any[]) {
    console.log(`[Sandbox] Executing batch sync for ${approvedItems.length} items`);
    let successCount = 0;
    let failCount = 0;

    for (const item of approvedItems) {
        try {
            // syncMatch signature: syncMatch(lpMatchId, dbMatchId, dateStr, force)
            const res = await syncMatch(item.lpId, item.dbMatchId, item.date, true);
            if (res.success) {
                successCount++;
            } else {
                failCount++;
                console.error(`[Sandbox] Sync failed for ${item.lpId}:`, res.error);
            }
        } catch (e) {
            failCount++;
            console.error(`[Sandbox] Fatal error syncing ${item.lpId}:`, e);
        }

        // Minor backoff to protect Leaguepedia API limits during bulk operations
        await new Promise(r => setTimeout(r, 2000));
    }

    revalidatePath('/admin/settings');
    revalidatePath('/admin/sync');
    revalidatePath('/standings');
    revalidatePath('/schedule');

    return { success: true, message: `已成功同步 ${successCount} 场，失败 ${failCount} 场。` };
}
