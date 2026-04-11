import { prisma } from '@/lib/db';
import {
    fetchDailyMatches,
    fetchPlayersForGames,
    LeaguepediaMatch,
    LeaguepediaPlayer,
} from '@/lib/leaguepedia';
import { resolveGameVersionForMatch } from '@/lib/game-version';
import { normalizeTeamLookupKey } from '@/lib/team-alias';

type LeaguepediaRegionScope = 'ALL' | 'LPL_LCK' | 'LPL' | 'LCK';

export type ConflictPolicy = 'SOURCE_OF_TRUTH' | 'FILL_ONLY';

export interface SyncMatchFromLeaguepediaParams {
    lpMatchId: string;
    dateStr: string;
    dbMatchId?: string | null;
    force?: boolean;
    conflictPolicy?: ConflictPolicy;
    createMissing?: boolean;
    regionScope?: LeaguepediaRegionScope;
    lpGames?: LeaguepediaMatch[];
}

export interface SyncMatchFromLeaguepediaResult {
    success: boolean;
    matchId?: string;
    updates: number;
    filled: number;
    corrected: number;
    unchanged: number;
    failed: number;
    error?: string;
}

export interface RunKdaSyncJobParams {
    dateStr: string;
    regionScope?: LeaguepediaRegionScope;
    conflictPolicy?: ConflictPolicy;
    createMissing?: boolean;
}

export interface RunKdaSyncJobResult {
    success: boolean;
    dateStr: string;
    regionScope: LeaguepediaRegionScope;
    totalSeries: number;
    linkedSeries: number;
    missingSeries: number;
    processedSeries: number;
    updates: number;
    filled: number;
    corrected: number;
    unchanged: number;
    failed: number;
    errors: string[];
}

export interface KdaAutoSyncState {
    runAt: string;
    trigger: 'cron' | 'manual';
    dateStr: string;
    durationMs: number;
    result: RunKdaSyncJobResult;
    error?: string;
}

const KDA_AUTO_SYNC_STATE_ID = 'kdaDailySyncState';

const ROLE_ORDER: Record<string, number> = {
    top: 1,
    jungle: 2,
    mid: 3,
    bot: 4,
    adc: 4,
    support: 5,
    sup: 5,
};

type StatsPlayer = {
    name?: string;
    hero?: string;
    hero_avatar?: string;
    kills?: number;
    deaths?: number;
    assists?: number;
    damage?: number;
    cs?: number;
    role?: string;
    team?: string;
    [key: string]: unknown;
};

type LocalGameData = {
    hasStats: boolean;
    teamAPlayers: StatsPlayer[];
    teamBPlayers: StatsPlayer[];
    analysis: Record<string, unknown> | null;
};

type MergeResult = {
    players: StatsPlayer[];
    changed: boolean;
};

const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function toNumber(v: unknown): number | undefined {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function heroToAvatar(hero: string): string {
    return `/images/champions/${hero.replace(/[^a-zA-Z0-9]/g, '')}.png`;
}

function toRoleRank(role: string | undefined): number {
    return ROLE_ORDER[(role || '').toLowerCase()] || 99;
}

function sortPlayersByRole(players: StatsPlayer[]): StatsPlayer[] {
    return [...players].sort((a, b) => toRoleRank(String(a.role || '')) - toRoleRank(String(b.role || '')));
}

function parseJsonArray(json: string | null): StatsPlayer[] {
    if (!json) return [];
    try {
        const arr = JSON.parse(json);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function parseLocalGameData(existingGame: {
    analysisData: string | null;
    teamAStats: string | null;
    teamBStats: string | null;
}): LocalGameData {
    let analysis: Record<string, unknown> | null = null;
    if (existingGame.analysisData) {
        try {
            const parsed = JSON.parse(existingGame.analysisData) as Record<string, unknown>;
            analysis = parsed;
        } catch {
            analysis = null;
        }
    }

    const teamAPlayersFromAnalysis = Array.isArray((analysis as any)?.teamA?.players)
        ? ((analysis as any).teamA.players as StatsPlayer[])
        : [];
    const teamBPlayersFromAnalysis = Array.isArray((analysis as any)?.teamB?.players)
        ? ((analysis as any).teamB.players as StatsPlayer[])
        : [];

    const teamAPlayers = teamAPlayersFromAnalysis.length > 0
        ? teamAPlayersFromAnalysis
        : parseJsonArray(existingGame.teamAStats);

    const teamBPlayers = teamBPlayersFromAnalysis.length > 0
        ? teamBPlayersFromAnalysis
        : parseJsonArray(existingGame.teamBStats);

    return {
        hasStats: teamAPlayers.length > 0 || teamBPlayers.length > 0,
        teamAPlayers,
        teamBPlayers,
        analysis,
    };
}

function mapLeaguepediaPlayers(players: LeaguepediaPlayer[]): StatsPlayer[] {
    return players
        .map((p) => {
            const safeHero = p.champion || 'Unknown';
            return {
                name: p.name,
                hero: safeHero,
                hero_avatar: heroToAvatar(safeHero),
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                damage: p.damage,
                cs: p.cs,
                role: p.role,
                team: p.team,
            } as StatsPlayer;
        })
        .sort((a, b) => toRoleRank(String(a.role || '')) - toRoleRank(String(b.role || '')));
}

function pickSourceByRoleOrIndex(
    sourcePlayers: StatsPlayer[],
    localPlayer: StatsPlayer,
    index: number,
    used: Set<number>
): StatsPlayer | null {
    const localRole = normalize(String(localPlayer.role || ''));

    if (localRole) {
        for (let i = 0; i < sourcePlayers.length; i += 1) {
            if (used.has(i)) continue;
            const sourceRole = normalize(String(sourcePlayers[i].role || ''));
            if (sourceRole && sourceRole === localRole) {
                used.add(i);
                return sourcePlayers[i];
            }
        }
    }

    if (index < sourcePlayers.length && !used.has(index)) {
        used.add(index);
        return sourcePlayers[index];
    }

    for (let i = 0; i < sourcePlayers.length; i += 1) {
        if (!used.has(i)) {
            used.add(i);
            return sourcePlayers[i];
        }
    }

    return null;
}

function mergePlayers(localPlayers: StatsPlayer[], sourcePlayers: StatsPlayer[], policy: ConflictPolicy): MergeResult {
    if (sourcePlayers.length === 0) {
        return { players: localPlayers, changed: false };
    }

    if (localPlayers.length === 0) {
        return { players: sourcePlayers, changed: true };
    }

    const localSorted = sortPlayersByRole(localPlayers);
    const sourceSorted = sortPlayersByRole(sourcePlayers);
    const usedSource = new Set<number>();
    let changed = false;

    const merged = localSorted.map((localPlayer, index) => {
        const source = pickSourceByRoleOrIndex(sourceSorted, localPlayer, index, usedSource);
        if (!source) return localPlayer;

        const next = { ...localPlayer };

        if (policy === 'SOURCE_OF_TRUTH') {
            const sourceKills = toNumber(source.kills);
            const sourceDeaths = toNumber(source.deaths);
            const sourceAssists = toNumber(source.assists);
            const sourceDamage = toNumber(source.damage);
            const sourceCs = toNumber(source.cs);

            if (sourceKills !== undefined && sourceKills !== toNumber(localPlayer.kills)) {
                next.kills = sourceKills;
                changed = true;
            }
            if (sourceDeaths !== undefined && sourceDeaths !== toNumber(localPlayer.deaths)) {
                next.deaths = sourceDeaths;
                changed = true;
            }
            if (sourceAssists !== undefined && sourceAssists !== toNumber(localPlayer.assists)) {
                next.assists = sourceAssists;
                changed = true;
            }
            if (sourceDamage !== undefined && sourceDamage !== toNumber(localPlayer.damage)) {
                next.damage = sourceDamage;
                changed = true;
            }
            if (sourceCs !== undefined && sourceCs !== toNumber(localPlayer.cs)) {
                next.cs = sourceCs;
                changed = true;
            }

            if (source.hero && source.hero !== localPlayer.hero) {
                next.hero = source.hero;
                next.hero_avatar = heroToAvatar(source.hero);
                changed = true;
            }
        }

        // Keep local display name for UI compatibility.
        if (!next.name && source.name) {
            next.name = source.name;
            changed = true;
        }

        if (!next.role && source.role) {
            next.role = source.role;
            changed = true;
        }

        return next;
    });

    sourceSorted.forEach((sourcePlayer, index) => {
        if (!usedSource.has(index)) {
            merged.push(sourcePlayer);
            changed = true;
        }
    });

    return { players: sortPlayersByRole(merged), changed };
}

function splitPlayersByTeam(
    playerStats: LeaguepediaPlayer[],
    teamAName: string,
    teamAShort: string,
    teamBName: string,
    teamBShort: string
) {
    const playersA = playerStats.filter((p) => {
        const t = normalize(p.team);
        const matchName = t.includes(teamAName) || teamAName.includes(t);
        const matchShort = teamAShort && (t === teamAShort || (teamAShort.length > 2 && t.startsWith(teamAShort)));
        return matchName || matchShort;
    });

    const playersB = playerStats.filter((p) => {
        const t = normalize(p.team);
        const matchName = t.includes(teamBName) || teamBName.includes(t);
        const matchShort = teamBShort && (t === teamBShort || (teamBShort.length > 2 && t.startsWith(teamBShort)));
        return matchName || matchShort;
    });

    return {
        teamAData: mapLeaguepediaPlayers(playersA),
        teamBData: mapLeaguepediaPlayers(playersB),
    };
}

function parseCargoUtc(cargoUtc: string): Date {
    return new Date(cargoUtc.replace(' ', 'T') + 'Z');
}

function getBeijingUtcRange(dateStr: string): { start: Date; end: Date } {
    return {
        start: new Date(`${dateStr}T00:00:00+08:00`),
        end: new Date(`${dateStr}T23:59:59+08:00`),
    };
}

function formatDateByTimezone(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((p) => p.type === 'year')?.value || '1970';
    const month = parts.find((p) => p.type === 'month')?.value || '01';
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    return `${year}-${month}-${day}`;
}

export function getBeijingDateString(offsetDays: number, now: Date = new Date()): string {
    const shifted = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return formatDateByTimezone(shifted, 'Asia/Shanghai');
}

export function getYesterdayBeijingDateString(now: Date = new Date()): string {
    return getBeijingDateString(-1, now);
}

async function resolveTeamRobust(name: string) {
    const n = normalizeTeamLookupKey(name);
    const allTeams = await prisma.team.findMany();

    let team = allTeams.find((t) => normalizeTeamLookupKey(t.shortName || '') === n);
    if (!team) team = allTeams.find((t) => normalizeTeamLookupKey(t.name) === n);
    if (!team) team = allTeams.find((t) => normalizeTeamLookupKey(t.name).includes(n) || n.includes(normalizeTeamLookupKey(t.name)));

    return team || null;
}

function findDbMatchForSeries(
    series: { info: LeaguepediaMatch },
    dbMatches: Array<{
        id: string;
        teamA: { name: string; shortName: string | null } | null;
        teamB: { name: string; shortName: string | null } | null;
    }>
) {
    const nTeam1 = normalize(series.info.team1);
    const nTeam2 = normalize(series.info.team2);

    return dbMatches.find((dbm) => {
        const dbA = normalize(dbm.teamA?.name || '');
        const dbB = normalize(dbm.teamB?.name || '');
        const dbShortA = normalize(dbm.teamA?.shortName || '');
        const dbShortB = normalize(dbm.teamB?.shortName || '');

        const matchA1 = dbA.includes(nTeam1) || nTeam1.includes(dbA) || (dbShortA && (dbShortA === nTeam1 || nTeam1.includes(dbShortA)));
        const matchB2 = dbB.includes(nTeam2) || nTeam2.includes(dbB) || (dbShortB && (dbShortB === nTeam2 || nTeam2.includes(dbShortB)));
        const matchA2 = dbA.includes(nTeam2) || nTeam2.includes(dbA) || (dbShortA && (dbShortA === nTeam2 || nTeam2.includes(dbShortA)));
        const matchB1 = dbB.includes(nTeam1) || nTeam1.includes(dbB) || (dbShortB && (dbShortB === nTeam1 || nTeam1.includes(dbShortB)));

        return (matchA1 && matchB2) || (matchA2 && matchB1);
    }) || null;
}

export async function syncMatchFromLeaguepedia(params: SyncMatchFromLeaguepediaParams): Promise<SyncMatchFromLeaguepediaResult> {
    const {
        lpMatchId,
        dateStr,
        dbMatchId = null,
        force = false,
        conflictPolicy = 'SOURCE_OF_TRUTH',
        createMissing = true,
        regionScope = 'ALL',
        lpGames,
    } = params;

    if (!lpMatchId) {
        return {
            success: false,
            updates: 0,
            filled: 0,
            corrected: 0,
            unchanged: 0,
            failed: 0,
            error: 'Missing LP ID',
        };
    }

    const allLp = lpGames || await fetchDailyMatches(dateStr);
    const gamesForMatch = allLp.filter((m) => m.matchId === lpMatchId).sort((a, b) => a.gameNumber - b.gameNumber);

    if (gamesForMatch.length === 0) {
        return {
            success: false,
            updates: 0,
            filled: 0,
            corrected: 0,
            unchanged: 0,
            failed: 0,
            error: 'LP Match not found (Date mismatch?)',
        };
    }

    const info = gamesForMatch[0];
    let matchId = dbMatchId;

    if (!matchId && createMissing) {
        const t1 = await resolveTeamRobust(info.team1);
        const t2 = await resolveTeamRobust(info.team2);

        if (!t1 || !t2) {
            return {
                success: false,
                updates: 0,
                filled: 0,
                corrected: 0,
                unchanged: 0,
                failed: 0,
                error: `Teams not found: ${info.team1}, ${info.team2}`,
            };
        }

        const parsedStartTime = parseCargoUtc(info.date);
        const gameVersion = await resolveGameVersionForMatch({
            startTime: parsedStartTime,
            tournament: info.tournament || 'LPL',
            teamARegion: t1.region || null,
            teamBRegion: t2.region || null,
        });

        const newMatch = await prisma.match.create({
            data: {
                startTime: parsedStartTime,
                teamAId: t1.id,
                teamBId: t2.id,
                status: 'FINISHED',
                tournament: info.tournament || 'LPL',
                gameVersion: gameVersion || null,
            },
        });
        matchId = newMatch.id;
    }

    if (!matchId) {
        return {
            success: false,
            updates: 0,
            filled: 0,
            corrected: 0,
            unchanged: 0,
            failed: 0,
            error: 'DB Match Missing and createMissing disabled',
        };
    }

    const dbMatch = await prisma.match.findUnique({
        where: { id: matchId },
        include: { teamA: true, teamB: true },
    });

    if (!dbMatch) {
        return {
            success: false,
            updates: 0,
            filled: 0,
            corrected: 0,
            unchanged: 0,
            failed: 0,
            error: 'DB Match Missing',
        };
    }

    const gameIds = gamesForMatch.map((g) => g.gameId);
    const allPlayersMap = await fetchPlayersForGames(gameIds);

    let updates = 0;
    let filled = 0;
    let corrected = 0;
    let unchanged = 0;
    let failed = 0;

    for (const lpGame of gamesForMatch) {
        try {
            const existingGame = await prisma.game.findFirst({
                where: { matchId, gameNumber: lpGame.gameNumber },
            });

            const playerStats = allPlayersMap[lpGame.gameId] || [];
            const teamAName = normalize(dbMatch.teamA?.name || '');
            const teamAShort = normalize(dbMatch.teamA?.shortName || '');
            const teamBName = normalize(dbMatch.teamB?.name || '');
            const teamBShort = normalize(dbMatch.teamB?.shortName || '');

            const { teamAData, teamBData } = splitPlayersByTeam(playerStats, teamAName, teamAShort, teamBName, teamBShort);
            const lpHasStats = teamAData.length > 0 || teamBData.length > 0;

            const t1Norm = normalize(lpGame.team1);
            const isTeam1MatchA = teamAName.includes(t1Norm) || t1Norm.includes(teamAName) || (teamAShort && (teamAShort.includes(t1Norm) || t1Norm.includes(teamAShort)));

            const teamABans = isTeam1MatchA ? (lpGame.team1Bans || []) : (lpGame.team2Bans || []);
            const teamBBans = isTeam1MatchA ? (lpGame.team2Bans || []) : (lpGame.team1Bans || []);
            const winnerId = lpGame.winner === 1
                ? (isTeam1MatchA ? dbMatch.teamAId : dbMatch.teamBId)
                : (isTeam1MatchA ? dbMatch.teamBId : dbMatch.teamAId);

            const blueSideTeamId = isTeam1MatchA ? dbMatch.teamAId : dbMatch.teamBId;
            const redSideTeamId = isTeam1MatchA ? dbMatch.teamBId : dbMatch.teamAId;

            if (!existingGame) {
                if (!createMissing) {
                    unchanged += 1;
                    continue;
                }

                const analysisData = lpHasStats
                    ? {
                        teamA: { name: dbMatch.teamA?.name || 'TBD', players: teamAData, bans: teamABans },
                        teamB: { name: dbMatch.teamB?.name || 'TBD', players: teamBData, bans: teamBBans },
                        damage_data: [...teamAData, ...teamBData],
                        duration: 0,
                    }
                    : null;

                await prisma.game.create({
                    data: {
                        matchId,
                        gameNumber: lpGame.gameNumber,
                        winnerId,
                        blueSideTeamId,
                        redSideTeamId,
                        teamAStats: lpHasStats ? JSON.stringify(teamAData) : null,
                        teamBStats: lpHasStats ? JSON.stringify(teamBData) : null,
                        analysisData: analysisData ? JSON.stringify(analysisData) : null,
                    },
                });

                updates += 1;
                if (lpHasStats) filled += 1;
                else unchanged += 1;
                continue;
            }

            const local = parseLocalGameData(existingGame);
            const winnerChanged = winnerId !== existingGame.winnerId;
            const sideChanged = blueSideTeamId !== existingGame.blueSideTeamId || redSideTeamId !== existingGame.redSideTeamId;

            if (!lpHasStats) {
                if (winnerChanged || sideChanged) {
                    await prisma.game.update({
                        where: { id: existingGame.id },
                        data: {
                            winnerId,
                            blueSideTeamId,
                            redSideTeamId,
                        },
                    });
                    updates += 1;
                    corrected += 1;
                } else {
                    unchanged += 1;
                }
                continue;
            }

            if (!local.hasStats) {
                const analysisData = {
                    ...(local.analysis || {}),
                    teamA: { name: dbMatch.teamA?.name || 'TBD', players: teamAData, bans: teamABans },
                    teamB: { name: dbMatch.teamB?.name || 'TBD', players: teamBData, bans: teamBBans },
                    damage_data: [...teamAData, ...teamBData],
                    duration: Number((local.analysis as any)?.duration || 0),
                } as Record<string, unknown>;

                await prisma.game.update({
                    where: { id: existingGame.id },
                    data: {
                        winnerId,
                        blueSideTeamId,
                        redSideTeamId,
                        teamAStats: JSON.stringify(teamAData),
                        teamBStats: JSON.stringify(teamBData),
                        analysisData: JSON.stringify(analysisData),
                    },
                });

                updates += 1;
                filled += 1;
                continue;
            }

            const mergeA = mergePlayers(local.teamAPlayers, teamAData, conflictPolicy);
            const mergeB = mergePlayers(local.teamBPlayers, teamBData, conflictPolicy);

            const baseAnalysis = (local.analysis || {}) as Record<string, unknown>;
            const analysisData = {
                ...baseAnalysis,
                teamA: {
                    ...(baseAnalysis.teamA as Record<string, unknown> || {}),
                    name: ((baseAnalysis.teamA as any)?.name as string) || dbMatch.teamA?.name || 'TBD',
                    players: mergeA.players,
                    bans: Array.isArray((baseAnalysis.teamA as any)?.bans) && (baseAnalysis.teamA as any).bans.length > 0
                        ? (baseAnalysis.teamA as any).bans
                        : teamABans,
                },
                teamB: {
                    ...(baseAnalysis.teamB as Record<string, unknown> || {}),
                    name: ((baseAnalysis.teamB as any)?.name as string) || dbMatch.teamB?.name || 'TBD',
                    players: mergeB.players,
                    bans: Array.isArray((baseAnalysis.teamB as any)?.bans) && (baseAnalysis.teamB as any).bans.length > 0
                        ? (baseAnalysis.teamB as any).bans
                        : teamBBans,
                },
                damage_data: [...mergeA.players, ...mergeB.players],
                duration: Number((baseAnalysis.duration as number) || 0),
            } as Record<string, unknown>;

            const changed = force || mergeA.changed || mergeB.changed || winnerChanged || sideChanged;
            if (!changed) {
                unchanged += 1;
                continue;
            }

            await prisma.game.update({
                where: { id: existingGame.id },
                data: {
                    winnerId,
                    blueSideTeamId,
                    redSideTeamId,
                    teamAStats: JSON.stringify(mergeA.players),
                    teamBStats: JSON.stringify(mergeB.players),
                    analysisData: JSON.stringify(analysisData),
                },
            });

            updates += 1;
            corrected += 1;
        } catch (error) {
            failed += 1;
            console.error(`[KDA Sync] Game sync failed for LP ${lpMatchId} G${lpGame.gameNumber}:`, error);
        }
    }

    return {
        success: true,
        matchId,
        updates,
        filled,
        corrected,
        unchanged,
        failed,
    };
}

export async function runKdaSyncJob(params: RunKdaSyncJobParams): Promise<RunKdaSyncJobResult> {
    const {
        dateStr,
        regionScope = 'ALL',
        conflictPolicy = 'SOURCE_OF_TRUTH',
        createMissing = false,
    } = params;

    const result: RunKdaSyncJobResult = {
        success: true,
        dateStr,
        regionScope,
        totalSeries: 0,
        linkedSeries: 0,
        missingSeries: 0,
        processedSeries: 0,
        updates: 0,
        filled: 0,
        corrected: 0,
        unchanged: 0,
        failed: 0,
        errors: [],
    };

    try {
        const lpMatches = await fetchDailyMatches(dateStr);
        const lpSeriesMap = new Map<string, { info: LeaguepediaMatch; games: LeaguepediaMatch[] }>();

        lpMatches.forEach((m) => {
            if (!lpSeriesMap.has(m.matchId)) {
                lpSeriesMap.set(m.matchId, { info: m, games: [] });
            }
            lpSeriesMap.get(m.matchId)?.games.push(m);
        });

        result.totalSeries = lpSeriesMap.size;

        const range = getBeijingUtcRange(dateStr);
        const dbMatches = await prisma.match.findMany({
            where: {
                startTime: {
                    gte: range.start,
                    lte: range.end,
                },
            },
            include: {
                teamA: true,
                teamB: true,
                games: true,
            },
        });

        for (const [lpId, series] of lpSeriesMap.entries()) {
            const dbMatch = findDbMatchForSeries(series, dbMatches as any);
            if (!dbMatch) {
                result.missingSeries += 1;
                continue;
            }

            result.linkedSeries += 1;
            const syncRes = await syncMatchFromLeaguepedia({
                lpMatchId: lpId,
                dateStr,
                dbMatchId: dbMatch.id,
                force: false,
                conflictPolicy,
                createMissing,
                regionScope,
                lpGames: series.games,
            });

            if (!syncRes.success) {
                result.failed += 1;
                result.errors.push(`${lpId}: ${syncRes.error || 'sync failed'}`);
                continue;
            }

            result.processedSeries += 1;
            result.updates += syncRes.updates;
            result.filled += syncRes.filled;
            result.corrected += syncRes.corrected;
            result.unchanged += syncRes.unchanged;
            result.failed += syncRes.failed;
        }
    } catch (error) {
        result.success = false;
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
}

export async function readKdaAutoSyncState(): Promise<KdaAutoSyncState | null> {
    const row = await prisma.systemSettings.findUnique({ where: { id: KDA_AUTO_SYNC_STATE_ID } });
    if (!row?.data) return null;

    try {
        return JSON.parse(row.data) as KdaAutoSyncState;
    } catch {
        return null;
    }
}

export async function writeKdaAutoSyncState(state: KdaAutoSyncState): Promise<void> {
    await prisma.systemSettings.upsert({
        where: { id: KDA_AUTO_SYNC_STATE_ID },
        update: { data: JSON.stringify(state) },
        create: {
            id: KDA_AUTO_SYNC_STATE_ID,
            data: JSON.stringify(state),
        },
    });
}
