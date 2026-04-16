'use server';

import { uploadToSupabase } from '@/lib/supabase-upload';
import { analyzeImage } from '@/lib/gemini';
import { getTeamAliasCandidates } from '@/lib/team-alias';

interface HeroLookupEntry {
    id: string;
    name: string;
    alias: string | null;
    title: string | null;
    avatarUrl: string;
}

const HERO_UPLOAD_OVERRIDES: Record<string, string> = {
    wukong: 'MonkeyKing',
    monkeyking: 'MonkeyKing',
    xinzhao: 'XinZhao',
    kogmaw: 'KogMaw',
    kogmow: 'KogMaw',
    ksante: 'KSante',
    chogath: 'Chogath',
    khazix: 'Khazix',
    velkoz: 'Velkoz',
    kaisa: 'Kaisa',
    nunuwillump: 'Nunu',
    nunuandwillump: 'Nunu',
    renataglasc: 'Renata',
    '\u8d75\u4fe1': 'XinZhao',
    '\u5fb7\u90a6\u603b\u7ba1': 'XinZhao',
    '\u6df1\u6e0a\u5de8\u53e3': 'KogMaw',
    '\u514b\u683c\u83ab': 'KogMaw',
};

function normalizeUploadHeroKey(value?: string | null): string {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, 'and')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase();
}

function buildHeroLookup(heroes: HeroLookupEntry[]): Map<string, HeroLookupEntry> {
    const lookup = new Map<string, HeroLookupEntry>();
    const add = (hero: HeroLookupEntry, raw?: string | null) => {
        const key = normalizeUploadHeroKey(raw);
        if (!key || lookup.has(key)) return;
        lookup.set(key, hero);
    };

    for (const hero of heroes) {
        add(hero, hero.id);
        add(hero, hero.name);
        add(hero, hero.alias);
        add(hero, hero.title);
        add(hero, hero.name.replace(/([a-z])([A-Z])/g, '$1 $2'));

        const canonical = normalizeUploadHeroKey(hero.name);
        if (canonical === 'monkeyking') add(hero, 'Wukong');
        if (canonical === 'xinzhao') add(hero, 'Xin Zhao');
        if (canonical === 'kogmaw') {
            add(hero, "Kog'Maw");
            add(hero, 'Kog Maw');
        }
        if (canonical === 'ksante') add(hero, "K'Sante");
        if (canonical === 'chogath') add(hero, "Cho'Gath");
        if (canonical === 'khazix') add(hero, "Kha'Zix");
        if (canonical === 'velkoz') add(hero, "Vel'Koz");
        if (canonical === 'kaisa') add(hero, "Kai'Sa");
        if (canonical === 'nunu') {
            add(hero, 'NunuWillump');
            add(hero, 'NunuAndWillump');
            add(hero, 'Nunu & Willump');
        }
        if (canonical === 'renata') add(hero, 'RenataGlasc');
    }

    return lookup;
}

function findHeroByLookup(rawHero: string, lookup: Map<string, HeroLookupEntry>): HeroLookupEntry | undefined {
    const rawKey = normalizeUploadHeroKey(rawHero);
    if (!rawKey || rawKey === 'unknown' || rawKey === 'unk') return undefined;

    const canonicalKey = normalizeUploadHeroKey(HERO_UPLOAD_OVERRIDES[rawKey] || rawKey);
    const direct = lookup.get(canonicalKey) || lookup.get(rawKey);
    if (direct) return direct;

    let best: HeroLookupEntry | undefined;
    let bestScore = 0;

    for (const [key, hero] of lookup.entries()) {
        let score = 0;
        if (key.startsWith(canonicalKey) || canonicalKey.startsWith(key)) {
            score = Math.min(key.length, canonicalKey.length) + 2;
        } else if (key.includes(canonicalKey) || canonicalKey.includes(key)) {
            score = Math.min(key.length, canonicalKey.length);
        }

        if (score > bestScore) {
            bestScore = score;
            best = hero;
        }
    }

    return bestScore >= 4 ? best : undefined;
}

async function normalizeAnalysisHeroes(analysis: any) {
    if (!analysis || !Array.isArray(analysis.damage_data) || analysis.damage_data.length === 0) {
        return analysis;
    }

    try {
        const heroes = await prisma.hero.findMany({
            select: {
                id: true,
                name: true,
                alias: true,
                title: true,
                avatarUrl: true,
            },
        });

        if (!heroes.length) return analysis;

        const lookup = buildHeroLookup(heroes);
        let changed = false;

        const nextDamage = analysis.damage_data.map((p: any) => {
            const matched = findHeroByLookup(String(p?.hero || ''), lookup);
            if (!matched) return p;

            const nextHero = matched.name;
            const nextAlias = matched.alias;
            const nextAvatar = matched.avatarUrl;

            const hasChange =
                normalizeUploadHeroKey(p?.hero) !== normalizeUploadHeroKey(nextHero) ||
                (p?.hero_alias || '') !== (nextAlias || '') ||
                !p?.hero_avatar ||
                p.hero_avatar !== nextAvatar;

            if (!hasChange) return p;

            changed = true;
            return {
                ...p,
                hero: nextHero,
                hero_alias: nextAlias,
                hero_avatar: nextAvatar,
            };
        });

        if (!changed) return analysis;
        return {
            ...analysis,
            damage_data: nextDamage,
        };
    } catch (error) {
        console.warn('normalizeAnalysisHeroes skipped:', error);
        return analysis;
    }
}


export async function uploadMatchAnalysisImage(formData: FormData) {
    const file = formData.get('image') as File;
    if (!file) {
        throw new Error('No file uploaded');
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Safe Unique filename: analysis_{timestamp}_{random}.png
    const ext = file.name.split('.').pop() || 'png';
    const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext.toLowerCase()) ? ext : 'png';
    const filename = `analysis_${Date.now()}_${Math.floor(Math.random() * 1000)}.${safeExt}`;

    let publicPath = '';

    try {
        // Upload to Supabase instead of local FS
        publicPath = await uploadToSupabase(buffer, filename, file.type || `image/${safeExt}`);
    } catch (error) {
        console.error('Upload failed', error);
        throw new Error('Upload failed');
    }

    // Call AI Service (Node.js) directly
    try {
        console.log(`Sending image ${filename} to Gemini Service (Node.js)...`);

        const aiResult = await analyzeImage(buffer);

        if (!aiResult.success) {
            console.error('AI Service Error:', aiResult.error);
            return {
                success: true,
                path: publicPath,
                analysis: null,
                error: `AI Error: ${aiResult.error}`
            };
        }

        const normalizedAnalysis = await normalizeAnalysisHeroes(aiResult.data);
        return { success: true, path: publicPath, analysis: normalizedAnalysis };

    } catch (e: any) {
        console.error('Analysis Failed:', e);
        return {
            success: true,
            path: publicPath,
            analysis: null,
            error: `Analysis Failed: ${e.message}`
        };
    }
}

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { propagateMatchResult } from '@/lib/bracket-utils';
import { calculateMatchSeriesScore } from '@/lib/match-series';
import { upsertPlayersFromStats } from '@/lib/player-utils';
import {
    MANUAL_REVIEW_COMMENT_TYPE,
    deriveManualReviewSummary,
    normalizeManualReviewType,
    serializeManualReviewComment,
    type ManualReviewType,
} from '@/lib/manual-review-comment';

async function resolveTeam(nameInput: string) {
    const name = nameInput?.trim();
    if (!name) return null;
    const candidates = getTeamAliasCandidates(name);
    if (candidates.length === 0) return null;

    return prisma.team.findFirst({
        where: {
            OR: candidates.flatMap((candidate) => ([
                { name: { equals: candidate, mode: 'insensitive' } as any },
                { shortName: { equals: candidate, mode: 'insensitive' } as any },
            ])),
        },
    });
}

async function loadReferencedTeamsForSeries(match: {
    teamAId?: string | null;
    teamBId?: string | null;
    games?: Array<{
        winnerId?: string | null;
        blueSideTeamId?: string | null;
        redSideTeamId?: string | null;
    }> | null;
}) {
    const referencedTeamIds = Array.from(
        new Set(
            [
                match.teamAId,
                match.teamBId,
                ...((match.games || []).flatMap((game) => [game.winnerId, game.blueSideTeamId, game.redSideTeamId])),
            ].filter(Boolean),
        ),
    ) as string[];

    if (referencedTeamIds.length === 0) {
        return [];
    }

    return prisma.team.findMany({
        where: {
            id: { in: referencedTeamIds },
        },
    });
}

// NEW: Resolve Player by name (case-insensitive)
async function resolvePlayer(nameInput: string, teamId?: string) {
    const name = nameInput?.trim();
    if (!name) return null;

    const whereClause: any = {
        name: { equals: name, mode: 'insensitive' }
    };

    // Optionally filter by team if provided
    if (teamId) {
        whereClause.teamId = teamId;
    }

    const player = await prisma.player.findFirst({
        where: whereClause
    });

    return player;
}

export async function getRecentMatches() {
    try {
        const matches = await prisma.match.findMany({
            where: {
                OR: [
                    { status: 'SCHEDULED' },
                    { status: 'ONGOING' },
                    // Maybe also include recent finished matches without games?
                    // For now simplicity: Scheduled/Ongoing
                ]
            },
            include: {
                teamA: true,
                teamB: true
            },
            orderBy: {
                startTime: 'desc'
            },
            take: 20
        });
        return matches;
    } catch (e) {
        console.error('Failed to fetch matches:', e);
        return [];
    }
}

export async function saveAnalysisResult(
    analysis: any,
    matchId?: string,
    gameId?: string,
    sides?: { blueTeamId: string, redTeamId: string }
) {
    if (!analysis || !analysis.damage_data) {
        return { success: false, error: 'Invalid analysis data' };
    }

    try {
        const damageData = analysis.damage_data;

        // 1. Resolve Team Names (Prioritize User Selection via 'sides' arg)
        let teamBlueSide;
        let teamRedSide;

        if (sides && sides.blueTeamId && sides.redTeamId) {
            // User explicitly selected sides
            teamBlueSide = await prisma.team.findUnique({ where: { id: sides.blueTeamId } });
            teamRedSide = await prisma.team.findUnique({ where: { id: sides.redTeamId } });

            // Fallback if ID invalid (should not happen)
            if (!teamBlueSide) teamBlueSide = await resolveTeam(analysis.blue_team_name || 'Blue Team');
            if (!teamRedSide) teamRedSide = await resolveTeam(analysis.red_team_name || 'Red Team');

        } else {
            // Fallback to AI Analysis
            let blueName = analysis.blue_team_name || 'Blue Team';
            let redName = analysis.red_team_name || 'Red Team';
            teamBlueSide = await resolveTeam(blueName);
            teamRedSide = await resolveTeam(redName);
        }

        if (!teamBlueSide || !teamRedSide) throw new Error("Failed to identify teams.");

        // Safe Duration Parse
        let durationSeconds = 0;
        if (typeof analysis.duration === 'string' && analysis.duration.includes(':')) {
            const parts = analysis.duration.split(':');
            const m = parseInt(parts[0]);
            const s = parseInt(parts[1]);
            if (!isNaN(m) && !isNaN(s)) {
                durationSeconds = m * 60 + s;
            }
        }

        // 2. Create or Update Match
        let finalMatchId = matchId;

        // Determine Game Winner Side ID
        let winnerTeamId = null;
        if (analysis.winner === 'Blue') winnerTeamId = teamBlueSide.id;
        else if (analysis.winner === 'Red') winnerTeamId = teamRedSide.id;

        if (matchId) {
            // Update Existing Match Status
            const match = await prisma.match.findUnique({
                where: { id: matchId },
                include: { games: true }
            });

            if (match) {
                // Calculate Status
                const winsNeeded = match.format === 'BO5' ? 3 : 2;

                // Count existing wins (excluding current game update temporarily)
                // Actually easier to just count all games including this new one (if we update game first? No, tricky).
                // Let's just update the status logic roughly.
                // We'll update the GAME first, THEN check Match status.
            }
        } else {
            // New Match creation...
            const match = await prisma.match.create({
                data: {
                    startTime: new Date(),
                    teamAId: teamBlueSide.id,
                    teamBId: teamRedSide.id,
                    tournament: 'Imported Match',
                    stage: 'Regular Season',
                    status: 'ONGOING', // Default to ONGOING
                    winnerId: null,
                }
            });
            finalMatchId = match.id;
        }

        if (!finalMatchId) throw new Error("Failed to resolve match ID");

        // 3. Create or Update Game
        const mapStats = (p: any) => ({
            ...p,
            playerName: p.playerName || p.name,
            championName: p.championName || p.hero,
            damageToChampions: p.damageToChampions || p.damage,
        });

        const teamAStats = damageData.filter((p: any) => p.team === 'Blue').map(mapStats);
        const teamBStats = damageData.filter((p: any) => p.team === 'Red').map(mapStats);

        const commonData = {
            winnerId: winnerTeamId,
            duration: durationSeconds,
            totalKills: analysis.total_kills || 0,
            blueKills: analysis.blue_kills || 0,
            redKills: analysis.red_kills || 0,
            screenshot: analysis.original_image_url || null,
            teamAStats: JSON.stringify(teamAStats),
            teamBStats: JSON.stringify(teamBStats),
            blueSideTeamId: teamBlueSide.id,
            redSideTeamId: teamRedSide.id,
            // @ts-ignore
            analysisData: JSON.stringify(analysis)
        };

        if (gameId) {
            await prisma.game.update({ where: { id: gameId }, data: commonData });
        } else {
            const lastGame = await prisma.game.findFirst({
                where: { matchId: finalMatchId },
                orderBy: { gameNumber: 'desc' }
            });
            await prisma.game.create({
                data: { matchId: finalMatchId, gameNumber: (lastGame?.gameNumber || 0) + 1, ...commonData }
            });
        }

        // --- NEW: Auto-upsert player entries
        await upsertPlayersFromStats(teamBlueSide.id, 'Imported Match', teamAStats);
        await upsertPlayersFromStats(teamRedSide.id, 'Imported Match', teamBStats);
        // ---

        // 4. Update Match Status and Winner (Post-Game Update)
        if (finalMatchId) {
            const match = await prisma.match.findUnique({
                where: { id: finalMatchId },
                include: { games: true, teamA: true, teamB: true }
            });

            if (match) {
                const referencedTeams = await loadReferencedTeamsForSeries(match);
                const { winnerId: matchWinnerId } = calculateMatchSeriesScore(match, referencedTeams);

                let newStatus = 'ONGOING';
                if (matchWinnerId) {
                    newStatus = 'FINISHED';
                }

                await prisma.match.update({
                    where: { id: finalMatchId },
                    data: { status: newStatus, winnerId: matchWinnerId }
                });

                // Propagate Bracket Logic
                if (matchWinnerId) {
                    await propagateMatchResult(finalMatchId);
                }
            }
        }

        if (finalMatchId) {
            // ... existing winner logic ...
        }

        revalidatePath(`/match/${finalMatchId}`); // Force Update Match Page
        revalidatePath('/'); // Update Home Page
        return { success: true, matchId: finalMatchId };

    } catch (e: any) {
        console.error('Save Analysis Failed FULL ERROR:', e);
        return { success: false, error: e.message || 'Unknown server error' };
    }
}
export async function addComment(formData: FormData) {
    const matchId = formData.get('matchId') as string;
    const content = formData.get('content') as string;
    const author = (formData.get('author') as string) || 'Analyst';
    const type = (formData.get('type') as string) || 'POST_MATCH';
    const gameNumberRaw = formData.get('gameNumber');
    const gameNumber = gameNumberRaw ? parseInt(gameNumberRaw as string) : 1;

    if (!matchId || !content) return { error: 'matchId/content required' };

    try {
        await prisma.comment.create({
            data: {
                matchId,
                content,
                author,
                userId: null,
                type,
                gameNumber,
            } as any,
        });
        revalidatePath(`/match/${matchId}`);
        return { success: true, message: '评论已发布' };
    } catch {
        return { error: '发布评论失败' };
    }
}
export async function deleteComment(commentId: string, matchId: string) {
    try {
        await prisma.comment.delete({
            where: { id: commentId }
        });
        revalidatePath(`/match/${matchId}`);
        return { success: true };
    } catch {
        return { error: 'Deletion failed' };
    }
}
export async function updateUserMapping(userId: string, name: string) {
    try {
        await (prisma as any).userProfile.upsert({
            where: { id: userId },
            update: { name },
            create: { id: userId, name }
        });
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to update mapping' };
    }
}
export async function addTeamComment(formData: FormData) {
    const teamId = formData.get('teamId') as string;
    const content = formData.get('content') as string;
    const author = (formData.get('author') as string) || 'Analyst';

    if (!teamId || !content) return { error: 'teamId/content required' };

    try {
        await prisma.teamComment.create({
            data: {
                teamId,
                content,
                author,
                userId: null,
            } as any,
        });
        revalidatePath(`/teams/${teamId}`);
        return { success: true, message: 'team comment posted' };
    } catch {
        return { error: 'failed to post team comment' };
    }
}
export async function updateComment(id: string, content: string) {
    try {
        const comment = await prisma.comment.update({
            where: { id },
            data: { content }
        });
        revalidatePath(`/match/${comment.matchId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: "failed to parse uploaded image" };
    }
}



export async function addOdds(formData: FormData) {
    try {
        const matchId = formData.get('matchId') as string;
        const provider = formData.get('provider') as string;
        const type = formData.get('type') as string;
        const teamAOdds = parseFloat(formData.get('teamAOdds') as string);
        const teamBOdds = parseFloat(formData.get('teamBOdds') as string);
        const thresholdRaw = formData.get('threshold');
        const threshold = thresholdRaw ? parseFloat(thresholdRaw as string) : null;
        const gameNumberRaw = formData.get('gameNumber');
        const gameNumber = gameNumberRaw ? parseInt(gameNumberRaw as string) : 1;

        if (!matchId || isNaN(teamAOdds) || isNaN(teamBOdds)) {
            throw new Error("Invalid Input");
        }

        const newOdds = await prisma.odds.create({
            data: {
                matchId,
                provider,
                type,
                teamAOdds,
                teamBOdds,
                threshold,
                gameNumber,
            }
        });

        revalidatePath(`/match/${matchId}`);
        return { success: true, data: newOdds };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteGame(gameId: string) {
    try {
        if (!gameId) throw new Error("Invalid Game ID");

        await prisma.game.delete({
            where: { id: gameId }
        });

        return { success: true };
    } catch (e: any) {
        console.error("Failed to delete game:", e);
        return { success: false, error: e.message };
    }
}

export async function updateOdds(id: string, formData: FormData) {
    try {
        const teamAOdds = parseFloat(formData.get('teamAOdds') as string);
        const teamBOdds = parseFloat(formData.get('teamBOdds') as string);
        const thresholdRaw = formData.get('threshold');
        const threshold = thresholdRaw ? parseFloat(thresholdRaw as string) : null;

        if (!id || isNaN(teamAOdds) || isNaN(teamBOdds)) {
            throw new Error("Invalid Input");
        }

        const updatedOdds = await prisma.odds.update({
            where: { id },
            data: {
                teamAOdds,
                teamBOdds,
                threshold
            }
        });

        return { success: true, data: updatedOdds };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteOdds(id: string) {
    try {
        if (!id) throw new Error("Invalid ID");

        await prisma.odds.delete({
            where: { id }
        });

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateGameManualData(
    gameId: string,
    data: {
        winnerId?: string;
        duration?: number;
        totalKills?: number;
        blueKills?: number;
        redKills?: number;
        blueTenMinKills?: number | null;
        redTenMinKills?: number | null;
        blueSideTeamId?: string;
        redSideTeamId?: string;
        teamAStats?: string;
        teamBStats?: string;
    }
) {
    try {
        if (!gameId) throw new Error("Invalid Game ID");

        // 1. Update Game
        const updatedGame = await prisma.game.update({
            where: { id: gameId },
            data: {
                winnerId: data.winnerId,
                duration: data.duration,
                totalKills: data.totalKills,
                blueKills: data.blueKills,
                redKills: data.redKills,
                blueTenMinKills: data.blueTenMinKills,
                redTenMinKills: data.redTenMinKills,
                blueSideTeamId: data.blueSideTeamId,
                redSideTeamId: data.redSideTeamId,
                teamAStats: data.teamAStats,
                teamBStats: data.teamBStats,
            } as any,
            include: { match: { include: { games: true } } }
        });

        const match = (updatedGame as any).match;
        if (match) {
            // --- NEW: Auto-upsert player entries
            try {
                if (data.teamAStats) {
                    const teamAStatsObj = JSON.parse(data.teamAStats);
                    await upsertPlayersFromStats(match.teamAId, match.tournament, teamAStatsObj);
                }
                if (data.teamBStats) {
                    const teamBStatsObj = JSON.parse(data.teamBStats);
                    await upsertPlayersFromStats(match.teamBId, match.tournament, teamBStatsObj);
                }
            } catch (err) {
                console.error("Auto upsert player error", err);
            }
            // ---

            // 2. Recalculate Match Status 
            const referencedTeams = await loadReferencedTeamsForSeries(match);
            const { winnerId: matchWinnerId } = calculateMatchSeriesScore(match, referencedTeams);

            let newStatus = 'ONGOING';
            if (matchWinnerId) {
                newStatus = 'FINISHED';
            }

            // Only update if changed
            if (newStatus !== match.status || matchWinnerId !== match.winnerId) {
                await prisma.match.update({
                    where: { id: match.id },
                    data: { status: newStatus, winnerId: matchWinnerId }
                });

                // Propagate Bracket Logic
                if (matchWinnerId) {
                    await propagateMatchResult(match.id);
                }
            }
        }

        revalidatePath(`/match/${match.id}`);
        revalidatePath('/'); // Update Home Page
        return { success: true };
    } catch (e: any) {
        console.error("Failed to manual update game:", e);
        return { success: false, error: e.message };
    }
}

export async function updateGameScreenshot(gameId: string, formData: FormData, type: 'main' | 'supplementary' = 'main') {
    try {
        const file = formData.get('image') as File;
        if (!file || !gameId) throw new Error("Missing file or Game ID");

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const suffix = type === 'main' ? '' : '_supp';
        // Shorten ID to avoid long paths. 8 chars of UUID is unique enough for this context alongside timestamp.
        const shortId = gameId.substring(0, 8);
        const filename = `sb_${shortId}${suffix}_${Date.now()}.png`;

        // Upload to Supabase
        const publicPath = await uploadToSupabase(buffer, filename, file.type || 'image/png');

        const fieldToUpdate = type === 'main' ? 'screenshot' : 'screenshot2';

        await prisma.game.update({
            where: { id: gameId },
            data: { [fieldToUpdate]: publicPath }
        });

        revalidatePath(`/match`);
        revalidatePath('/'); // Update Home Page
        return { success: true, path: publicPath };
    } catch (e: any) {
        console.error("Failed to update screenshot:", e);
        return { success: false, error: e.message };
    }
}

export async function deleteGameScreenshot(gameId: string, type: 'main' | 'supplementary' = 'main') {
    try {
        if (!gameId) throw new Error("Invalid Game ID");

        const fieldToUpdate = type === 'main' ? 'screenshot' : 'screenshot2';

        await prisma.game.update({
            where: { id: gameId },
            data: { [fieldToUpdate]: null }
        });

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function addGame(matchId: string, gameNumber: number) {
    if (!matchId || !gameNumber) return { error: "Invalid parameters" };
    try {
        const match = await prisma.match.findUnique({ where: { id: matchId }, include: { games: true } });
        if (!match) return { error: "Match not found" };

        const existing = match.games.find(g => g.gameNumber === gameNumber);
        if (existing) return { error: "Game already exists" };

        const newGame = await prisma.game.create({
            data: {
                matchId,
                gameNumber,
                blueSideTeamId: match.teamAId,
                redSideTeamId: match.teamBId,
            }
        });

        revalidatePath(`/match/${matchId}`);
        return { success: true, data: newGame };
    } catch (e) {
        console.error(e);
        return { error: "Failed to create game" };
    }
}

export async function saveAnalysisNote(formData: FormData) {
    const matchId = formData.get('matchId') as string;
    const content = formData.get('content') as string;
    const type = (formData.get('type') as string) || 'POST_MATCH';
    const gameNumberRaw = formData.get('gameNumber');
    const gameNumber = gameNumberRaw ? parseInt(gameNumberRaw as string) : 1;
    const author = (formData.get('author') as string) || 'Analyst';

    if (!matchId) return { error: 'Match ID required' };

    try {
        const existing = await prisma.comment.findFirst({
            where: {
                matchId,
                gameNumber,
                type
            },
            orderBy: { createdAt: 'desc' }
        });

        if (existing) {
            await prisma.comment.update({
                where: { id: existing.id },
                data: { content, author, userId: null }
            });
        } else {
            await prisma.comment.create({
                data: {
                    matchId,
                    content: content || '',
                    author,
                    userId: null,
                    type,
                    gameNumber,
                } as any,
            });
        }

        revalidatePath(`/match/${matchId}`);
        return { success: true, message: 'analysis note saved' };
    } catch (e) {
        console.error(e);
        return { error: 'failed to save analysis note' };
    }
}

export async function saveManualReviewComment(formData: FormData) {
    const reviewId = String(formData.get('reviewId') || formData.get('commentId') || '').trim() || null;
    const matchId = String(formData.get('matchId') || '').trim();
    const gameNumber = Number(formData.get('gameNumber') || 1) || 1;
    const reviewType = normalizeManualReviewType(String(formData.get('reviewType') || '').trim()) as ManualReviewType;
    const teamId = String(formData.get('teamId') || '').trim();
    const teamName = String(formData.get('teamName') || '').trim();
    const playerId = String(formData.get('playerId') || '').trim();
    const hero = String(formData.get('hero') || '').trim();
    const detail = String(formData.get('detail') || '').trim();
    const summary = String(formData.get('summary') || '').trim() || deriveManualReviewSummary(detail);
    const matchDate = String(formData.get('matchDate') || '').trim();
    const opponentTeamName = String(formData.get('opponentTeamName') || '').trim();

    if (!matchId || !teamId || !teamName || !playerId || !hero || !detail || !reviewType) {
        return { error: '保存手动点评失败：缺少必要字段。' };
    }

    try {
        let existingReview = null as Awaited<ReturnType<typeof prisma.manualReview.findFirst>> | null;
        if (reviewId) {
            existingReview = await prisma.manualReview.findFirst({
                where: {
                    OR: [
                        { id: reviewId },
                        { legacyCommentId: reviewId },
                    ],
                },
            });
        }

        const content = serializeManualReviewComment({
            reviewType,
            teamId,
            teamName,
            playerId,
            hero,
            detail,
            summary,
            matchDate,
            opponentTeamName,
            gameNumber,
        });

        let legacyCommentId = existingReview?.legacyCommentId || null;
        if (!legacyCommentId && reviewId) {
            const legacyComment = await prisma.comment.findUnique({ where: { id: reviewId } });
            if (legacyComment?.type === MANUAL_REVIEW_COMMENT_TYPE) {
                legacyCommentId = legacyComment.id;
            }
        }

        if (legacyCommentId) {
            await prisma.comment.update({
                where: { id: legacyCommentId },
                data: {
                    content,
                    type: MANUAL_REVIEW_COMMENT_TYPE,
                    gameNumber,
                    author: 'Analyst',
                    userId: null,
                },
            });
        } else {
            const comment = await prisma.comment.create({
                data: {
                    matchId,
                    content,
                    author: 'Analyst',
                    userId: null,
                    type: MANUAL_REVIEW_COMMENT_TYPE,
                    gameNumber,
                } as any,
            });
            legacyCommentId = comment.id;
        }

        const manualReviewData = {
            matchId,
            legacyCommentId,
            gameNumber,
            reviewType,
            teamId,
            teamName,
            playerId,
            hero,
            detail,
            summary,
            matchDate,
            opponentTeamName,
            author: 'Analyst',
        };

        if (existingReview) {
            await prisma.manualReview.update({
                where: { id: existingReview.id },
                data: manualReviewData,
            });
        } else {
            await prisma.manualReview.create({
                data: manualReviewData,
            });
        }

        revalidatePath(`/match/${matchId}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to save manual review comment:', error);
        return { error: '保存手动点评失败。' };
    }
}

export async function deleteManualReview(reviewId: string, matchId: string) {
    try {
        const review = await prisma.manualReview.findFirst({
            where: {
                OR: [
                    { id: reviewId },
                    { legacyCommentId: reviewId },
                ],
            },
        });

        if (review) {
            await prisma.$transaction(async (tx) => {
                if (review.legacyCommentId) {
                    await tx.comment.deleteMany({
                        where: { id: review.legacyCommentId },
                    });
                }

                await tx.manualReview.delete({
                    where: { id: review.id },
                });
            });
        } else {
            await prisma.comment.delete({
                where: { id: reviewId },
            });
        }

        revalidatePath(`/match/${matchId}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to delete manual review:', error);
        return { error: '删除手动点评失败。' };
    }
}


