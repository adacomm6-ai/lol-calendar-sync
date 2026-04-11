'use server';

import { prisma } from '@/lib/db';
import { analyzeMatchHistoryImage } from '@/lib/gemini';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function uploadBatchImage(formData: FormData) {
    const file = formData.get('image') as File;
    if (!file) return { success: false, error: 'No file uploaded' };

    try {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Check Env
        if (!process.env.GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY missing in Server Action");
            // Don't expose this to user ideally, but for debug:
            // return { success: false, error: 'Server Config Error: API Key Missing' };
        }

        // Analyze with Gemini
        console.log("Analyzing buffer size:", buffer.length);
        const result = await analyzeMatchHistoryImage(buffer);
        console.log("Gemini Result:", JSON.stringify(result).substring(0, 200));

        if (!result.success) {
            console.error("Gemini Failed:", result.error);
            return { success: false, error: result.error || 'Unknown Gemini Error' };
        }

        if (!result.data || !Array.isArray(result.data.matches)) {
            console.error("Gemini Invalid Data:", result.data);
            return { success: false, error: 'Gemini returned invalid data structure (No matches found)', raw: result.raw };
        }

        return { success: true, matches: result.data.matches, raw: result.raw }; // Array of parsed records

    } catch (e: any) {
        console.error("Upload Action Error:", e);
        return { success: false, error: `Action Failed: ${e.message || String(e)}` };
    }
}

export async function previewBatchUpdates(playerId: string, parsedMatches: any[]) {
    if (!playerId) return { success: false, error: 'No player selected' };

    const player = await prisma.player.findUnique({ where: { id: playerId }, include: { team: true } });
    if (!player) return { success: false, error: 'Player not found' };

    const proposedUpdates = [];

    for (const record of parsedMatches) {
        // 1. Find the Match
        // Logic: Match where Time contains record.Date AND (TeamA=Opponent OR TeamB=Opponent)
        // Note: Date formatting might vary. '2026-01-03'. DB stores DateTime.
        // We'll search for matches within that Date's range (00:00 to 23:59).

        if (!record.date) continue;

        const dayStart = new Date(record.date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(record.date);
        dayEnd.setHours(23, 59, 59, 999);

        // Opponent matching: Try Name or ShortName
        // We look for matches involving Player's Team vs Opponent
        // OR just Matches involving Opponent if we don't strictly enforce Player's team (e.g. invalid transfers).
        // But better to check matches involving Player's Team.

        // Find Matches on that day
        const matches = await prisma.match.findMany({
            where: {
                startTime: { gte: dayStart, lte: dayEnd },
                OR: [
                    { teamA: { OR: [{ shortName: record.opponent }, { name: { contains: record.opponent } }] } },
                    { teamB: { OR: [{ shortName: record.opponent }, { name: { contains: record.opponent } }] } }
                ]
            },
            include: { games: true, teamA: true, teamB: true }
        });

        if (matches.length === 0) {
            proposedUpdates.push({
                status: 'NOT_FOUND',
                record,
                message: 'No match found on this date vs this opponent.'
            });
            continue;
        }

        const match = matches[0]; // Assume first fit

        // 2. Find the Game
        let gameNum = 1;
        if (typeof record.game_number === 'number') gameNum = record.game_number;
        else if (record.game_label) {
            const m = record.game_label.match(/\d+/);
            if (m) gameNum = parseInt(m[0]);
        }

        const game = match.games.find(g => g.gameNumber === gameNum);

        if (!game) {
            proposedUpdates.push({
                status: 'GAME_NOT_FOUND',
                record,
                matchId: match.id,
                message: `Match found, but Game ${gameNum} missing.`
            });
            continue;
        }

        // 3. Find Player in Stats
        // We need to see if we can perform an update
        proposedUpdates.push({
            status: 'READY',
            record,
            matchId: match.id,
            gameId: game.id,
            matchTitle: `${match.teamA?.shortName || 'TBD'} vs ${match.teamB?.shortName || 'TBD'}`,
            gameNumber: gameNum,
            playerId: player.id,
            playerName: player.name,
            newHero: record.hero,
            newKda: record.kda,
            newDamage: record.damage
        });
    }

    return { success: true, updates: proposedUpdates };
}

export async function applyBatchUpdates(updates: any[]) {
    let successCount = 0;
    const errors = [];

    for (const update of updates) {
        if (update.status !== 'READY') continue;

        try {
            const game = await prisma.game.findUnique({ where: { id: update.gameId } });
            if (!game) continue;

            const updateStatsArray = (jsonStr: string | null) => {
                if (!jsonStr) return jsonStr;
                try {
                    const arr = JSON.parse(jsonStr);
                    if (!Array.isArray(arr)) return jsonStr;

                    let modified = false;
                    const newArr = arr.map((p: any) => {
                        // Match Name (Try Player Name or normalized)
                        const pName = (p.name || p.player_name || '').toLowerCase().replace(/\s/g, '');
                        const targetName = update.playerName.toLowerCase().replace(/\s/g, '');

                        // Also try robust matching: If p.hero matches OLD hero? No.
                        // Just match name.
                        if (pName === targetName || pName.includes(targetName) || targetName.includes(pName)) {
                            modified = true;

                            // Parse KDA
                            let k = p.kills, d = p.deaths, a = p.assists;
                            if (update.newKda) {
                                const parts = update.newKda.split('/').map((n: string) => parseInt(n));
                                if (parts.length === 3) [k, d, a] = parts;
                            }

                            return {
                                ...p,
                                hero: update.newHero || p.hero,
                                kills: k,
                                deaths: d,
                                assists: a,
                                damage: update.newDamage ? parseInt(update.newDamage.replace(/k/i, '000').replace('.', '')) : p.damage // Simple parse, refine if needed
                            };
                        }
                        return p;
                    });

                    return modified ? JSON.stringify(newArr) : jsonStr;
                } catch (e) { return jsonStr; }
            };

            const newTeamA = updateStatsArray(game.teamAStats);
            const newTeamB = updateStatsArray(game.teamBStats);

            // Allow update if ANY change detect
            // But verify we actually found the player? 
            // The helper returns original string if no mod. 
            // So checking strict equality is enough.

            // Check analysisData too
            let newAnalysis = game.analysisData;
            if (game.analysisData) {
                try {
                    const ana = JSON.parse(game.analysisData);
                    if (ana.damage_data) {
                        const str = JSON.stringify(ana.damage_data);
                        const newStr = updateStatsArray(str);
                        if (newStr !== str && newStr) {
                            ana.damage_data = JSON.parse(newStr);
                            newAnalysis = JSON.stringify(ana);
                        }
                    }
                } catch (e) { }
            }

            if (newTeamA !== game.teamAStats || newTeamB !== game.teamBStats || newAnalysis !== game.analysisData) {
                await prisma.game.update({
                    where: { id: game.id },
                    data: {
                        teamAStats: newTeamA,
                        teamBStats: newTeamB,
                        analysisData: newAnalysis
                    }
                });
                successCount++;
            } else {
                errors.push(`Player ${update.playerName} not found in Game ${update.gameNumber} stats json.`);
            }

        } catch (e: any) {
            errors.push(`Failed to update Game ${update.gameId}: ${e.message}`);
        }
    }

    return { success: true, count: successCount, errors };
}

export async function fixCloudScheduleData() {
    const logs: string[] = [];

    try {
        // 1. Fix AL vs IG Match (2026-01-27)
        // Cloud Problem: Stored as 19:00 UTC (03:00 Next Day Local). Needs to be 11:00 UTC (19:00 Local).
        // Strategy: Find AL vs IG match around Jan 27-28 and SET it to correct 11:00 UTC.

        const alIgMatches = await prisma.match.findMany({
            where: {
                teamA: { shortName: 'AL' },
                teamB: { shortName: 'IG' },
                // Look broadly around the target date
                startTime: {
                    gte: new Date('2026-01-27T00:00:00Z'),
                    lt: new Date('2026-01-29T00:00:00Z')
                }
            }
        });

        if (alIgMatches.length > 0) {
            const match = alIgMatches[0];
            const targetTime = new Date('2026-01-27T11:00:00Z'); // 19:00 Beijing

            if (match.startTime && match.startTime.getTime() !== targetTime.getTime()) {
                await prisma.match.update({
                    where: { id: match.id },
                    data: { startTime: targetTime }
                });
                logs.push(`Fixed AL vs IG Match: ${match.id} -> ${targetTime.toISOString()}`);
            } else if (match.startTime) {
                logs.push(`AL vs IG Match already verified correct (11:00 UTC).`);
            }
        } else {
            // Need to insert? Or try finding strictly?
            // If missing, maybe try to restore?
            // Let's assume user might not have it or has it. 
            // If missing, we can try to find by ID?
            // Or just logging "Not Found".
            logs.push('AL vs IG Match not found in search range.');
        }

        // 2. Fix LCK Matches (Jan 29 - Feb 01)
        // Cloud Problem: Likely at 15:00 Local (07:00 UTC). Needs 16:00 Local (08:00 UTC).
        // Strategy: Find matches at 07:00 UTC in future and shift to 08:00 UTC.

        const lckMatches = await prisma.match.findMany({
            where: {
                startTime: {
                    gte: new Date(), // Future matches
                },
                status: { not: 'FINISHED' },
                OR: [{ tournament: { contains: 'LCK' } }, { teamA: { region: 'LCK' } }]
            }
        });

        let lckCount = 0;
        for (const m of lckMatches) {
            if (!m.startTime) continue;
            const h = m.startTime.getUTCHours(); // 0-23
            // If 07:00 UTC (15:00 Beijing)
            if (h === 7) {
                const newTime = new Date(m.startTime);
                newTime.setUTCHours(8); // Set to 08:00 UTC
                await prisma.match.update({
                    where: { id: m.id },
                    data: { startTime: newTime }
                });
                logs.push(`Fixed LCK Match: ${m.id} (${m.startTime.toISOString()} -> ${newTime.toISOString()})`);
                lckCount++;
            }
        }
        logs.push(`Checked LCK Matches. Fixed ${lckCount} incorrect times.`);

        return { success: true, logs };


    } catch (e: any) {
        return { success: false, error: e.message, logs };
    }
}

export async function classifyAllComments() {
    const logs: string[] = [];
    let updatedCount = 0;

    try {
        const matches = await prisma.match.findMany({
            include: {
                games: true,
                comments: true
            }
        });

        logs.push(`Found ${matches.length} matches. Starting full analysis...`);

        for (const match of matches) {
            const playerNames = new Set<string>();

            // 1. Collect Player Names
            for (const game of match.games) {
                try {
                    const teamAStats = JSON.parse(game.teamAStats as string || '[]');
                    const teamBStats = JSON.parse(game.teamBStats as string || '[]');
                    [...teamAStats, ...teamBStats].forEach((p: any) => {
                        const name = p.playerName || p.name;
                        if (name && typeof name === 'string' && name.length > 2) {
                            playerNames.add(name.toLowerCase());
                        }
                    });
                } catch (e) { }
            }

            // 2. Identify Player Analysis vs Post Match
            // We'll track which comments are effectively "Post Match" candidates
            const postMatchCandidates: typeof match.comments = [];

            for (const comment of match.comments) {
                const contentLower = comment.content.toLowerCase();
                let isPlayerAnalysis = false;
                let matchedName = '';

                // Check mentions
                for (const name of Array.from(playerNames)) {
                    if (contentLower.includes(name)) {
                        isPlayerAnalysis = true;
                        matchedName = name;
                        break;
                    }
                }

                if (isPlayerAnalysis) {
                    if (comment.type !== 'PLAYER_ANALYSIS') {
                        await prisma.comment.update({
                            where: { id: comment.id },
                            data: { type: 'PLAYER_ANALYSIS' }
                        });
                        updatedCount++;
                    }
                    // It is player analysis, done.
                } else {
                    // Start of ABC Logic: It's a candidate for Post Match
                    // We treat everything else as potential Post Match (replacing SUMMARY_FLOW etc)
                    postMatchCandidates.push(comment);
                }
            }

            // 3. Process Post Match Candidates (A/B/C Distribution)
            const games: Record<number, typeof match.comments> = {};
            postMatchCandidates.forEach(c => {
                if (!games[c.gameNumber]) games[c.gameNumber] = [];
                games[c.gameNumber].push(c);
            });

            for (const [gameNumStr, list] of Object.entries(games)) {
                const gameNum = parseInt(gameNumStr);
                // Sort by ID to ensure stable ordering
                list.sort((a, b) => a.id.localeCompare(b.id));

                // Case A: Single comment -> Check for Split
                if (list.length === 1) {
                    const c = list[0];
                    // Check for merge signature (double newline or just long text?)
                    // User merging script used \n\n.
                    const parts = c.content.split(/\n\n+/);

                    if (parts.length > 1) {
                        logs.push(`Splitting merged comment in Match ${match.id.substring(0, 6)} Game ${gameNum}`);

                        // Update 1st -> A
                        await prisma.comment.update({
                            where: { id: c.id },
                            data: {
                                type: 'POST_MATCH_A',
                                content: parts[0]
                            }
                        });
                        updatedCount++;

                        // Create B
                        if (parts[1]) {
                            await prisma.comment.create({
                                data: {
                                    matchId: match.id,
                                    content: parts[1],
                                    type: 'POST_MATCH_B',
                                    gameNumber: gameNum,
                                    author: c.author,
                                    userId: c.userId
                                }
                            });
                            updatedCount++;
                        }
                        // Create C
                        if (parts[2]) {
                            await prisma.comment.create({
                                data: {
                                    matchId: match.id,
                                    content: parts[2],
                                    type: 'POST_MATCH_C',
                                    gameNumber: gameNum,
                                    author: c.author,
                                    userId: c.userId
                                }
                            });
                            updatedCount++;
                        }
                        continue; // Done with this game
                    }
                }

                // Case B: Multiple comments (or single non-split) -> Map to A, B, C
                const types = ['POST_MATCH_A', 'POST_MATCH_B', 'POST_MATCH_C'];
                for (let i = 0; i < list.length; i++) {
                    const c = list[i];
                    const targetType = types[i] || 'POST_MATCH_C'; // Overflow to C

                    if (c.type !== targetType) {
                        await prisma.comment.update({
                            where: { id: c.id },
                            data: { type: targetType }
                        });
                        updatedCount++;
                    }
                }
            }
        }

        logs.push(`Process Complete. Updated/Created ${updatedCount} records.`);
        return { success: true, logs, count: updatedCount };

    } catch (e: any) {
        console.error("Classification error:", e);
        return { success: false, error: e.message };
    }
}

import goldenData from '@/lib/roster-golden-data.json';

export async function applyGoldenRosterFix() {
    const logs: string[] = [];
    try {
        const snapshot = goldenData;
        logs.push(`Loaded golden data for ${snapshot.length} teams.`);

        for (const teamData of snapshot) {
            const { teamId, teamName, players } = teamData;

            // 1. Fetch current cloud players for this team
            const currentPlayers = await prisma.player.findMany({
                where: { teamId }
            });

            // 2. Identify players to delete (those in cloud but NOT in golden data)
            const goldenPlayerNames = players.map((p: any) => p.name.toLowerCase());
            const toDelete = currentPlayers.filter(cp => !goldenPlayerNames.includes(cp.name.toLowerCase()));

            if (toDelete.length > 0) {
                await prisma.player.deleteMany({
                    where: { id: { in: toDelete.map(p => p.id) } }
                });
                logs.push(`[${teamName}] Deleted ${toDelete.length} redundant players.`);
            }

            // 3. Compare and Update/Create golden players
            let teamModified = false;
            for (const gp of players) {
                const cloudPlayer = currentPlayers.find(cp => cp.name.toLowerCase() === gp.name.toLowerCase());

                if (!cloudPlayer) {
                    // Create missing player
                    await prisma.player.create({
                        data: {
                            name: gp.name,
                            role: gp.role,
                            teamId: teamId,
                            split: gp.split || 'Split 1'
                        }
                    });
                    logs.push(`[${teamName}] Added missing player: ${gp.name}`);
                    teamModified = true;
                } else {
                    // Check if role or split is different
                    const needsUpdate = cloudPlayer.role !== gp.role || (gp.split && cloudPlayer.split !== gp.split);
                    if (needsUpdate) {
                        await prisma.player.update({
                            where: { id: cloudPlayer.id },
                            data: {
                                role: gp.role,
                                split: gp.split || cloudPlayer.split
                            }
                        });
                        logs.push(`[${teamName}] Updated ${gp.name}: ${cloudPlayer.role} -> ${gp.role}`);
                        teamModified = true;
                    }
                }
            }
            if (!teamModified && toDelete.length === 0) {
                // logs.push(`[${teamName}] Already up-to-date.`);
            } else {
                logs.push(`[${teamName}] Sync completed.`);
            }
        }

        return { success: true, logs };
    } catch (e: any) {
        console.error("Golden Roster Fix Error:", e);
        return { success: false, error: e.message, logs };
    }
}
