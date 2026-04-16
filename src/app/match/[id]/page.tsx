import { Suspense } from 'react';
import type { Game } from '@prisma/client';
import { notFound } from 'next/navigation';

import MatchDetailClient from '@/components/MatchDetailClient';
import type {
    PreMatchAnalysisBpGame,
    PreMatchAnalysisData,
    PreMatchAnalysisHeadToHeadEntry,
    PreMatchAnalysisPlayerCard,
    PreMatchAnalysisRecentSummary,
    PreMatchAnalysisTeamInfo,
    PreMatchAnalysisTrendPoint,
} from '@/components/analysis/PreMatchAnalysisPanel';
import { prisma } from '@/lib/db';
import { getCachedRecentStats } from '@/lib/data-cache';
import { resolveGameVersionForMatch } from '@/lib/game-version';
import { toManualReviewEntry } from '@/lib/manual-review-comment';
import { getPlayerRankViewData } from '@/lib/player-rank';
import { getCompletedSeriesGames } from '@/lib/recent-series-stats';
import {
    buildCanonicalTeamIndex,
    canonicalizeMatchTeams,
    getRelatedTeamIds,
    getRelatedTeamIdsByIdentity,
} from '@/lib/team-canonical';
import { getTeamShortDisplayName } from '@/lib/team-display';

export const dynamic = 'force-dynamic';

const MATCH_DETAIL_INCLUDE = {
    teamA: { include: { players: true, teamComments: { orderBy: { createdAt: 'desc' as const }, take: 1 } } },
    teamB: { include: { players: true, teamComments: { orderBy: { createdAt: 'desc' as const }, take: 1 } } },
    games: { orderBy: { gameNumber: 'asc' as const } },
    odds: true,
    comments: { orderBy: { createdAt: 'desc' as const } },
    manualReviews: { orderBy: { createdAt: 'desc' as const } },
};

const ANALYSIS_TEAM_SELECT = {
    id: true,
    name: true,
    shortName: true,
    logo: true,
    region: true,
} as const;

const ROLE_ORDER = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
type RoleKey = (typeof ROLE_ORDER)[number];

type SnapshotLite = {
    playerId: string | null;
    tournamentName: string;
    seasonYear: string;
    confidence: number | null;
    stateScore: number | null;
    masteryScore: number | null;
    laneScore: number | null;
    overallScore: number | null;
    relativeScore: number | null;
    relativeZScore: number | null;
    recentWinRatePct: number | null;
    winRatePct: number | null;
    kda: number | null;
    avgKills: number | null;
    avgDeaths: number | null;
    avgAssists: number | null;
    damagePerMin: number | null;
    killParticipationPct: number | null;
    goldDiffAt15: number | null;
    csDiffAt15: number | null;
    xpDiffAt15: number | null;
    evaluationLabel: string | null;
    trendScore: number | null;
    sampleGames: number | null;
    currentTotalGames: number | null;
    games: number;
    syncedAt: Date;
};

function getExpectedGameCount(formatValue?: string | null): number {
    const formatText = String(formatValue || '').toUpperCase();
    const match = formatText.match(/BO\s*(\d+)/i) || formatText.match(/(\d+)/);
    const parsed = match ? parseInt(match[1], 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getDisplayTeamName(team?: { shortName?: string | null; name?: string | null } | null) {
    return String(team?.shortName || team?.name || '未知队伍').trim();
}

async function ensureGamesByFormat(match: any): Promise<boolean> {
    const expected = getExpectedGameCount(match?.format);
    const existing = new Set<number>(
        (match?.games || [])
            .map((g: any) => Number(g?.gameNumber))
            .filter((n: number) => Number.isFinite(n) && n > 0),
    );

    const missingRows: Array<{ matchId: string; gameNumber: number; blueSideTeamId: string | null; redSideTeamId: string | null }> = [];
    for (let i = 1; i <= expected; i += 1) {
        if (!existing.has(i)) {
            missingRows.push({
                matchId: match.id,
                gameNumber: i,
                blueSideTeamId: match.teamAId || null,
                redSideTeamId: match.teamBId || null,
            });
        }
    }

    if (missingRows.length === 0) return false;

    await prisma.$transaction(
        missingRows.map((row) =>
            prisma.game.create({
                data: row,
            }),
        ),
    );
    return true;
}

async function ensureMappedVersion(match: any): Promise<boolean> {
    const existingVersion = String(match?.gameVersion || '').trim();
    if (existingVersion) return false;

    const resolvedVersion = await resolveGameVersionForMatch({
        startTime: match?.startTime,
        tournament: match?.tournament,
        teamARegion: match?.teamA?.region || null,
        teamBRegion: match?.teamB?.region || null,
    });

    if (!resolvedVersion) return false;

    await prisma.match.update({
        where: { id: match.id },
        data: { gameVersion: resolvedVersion },
    });
    return true;
}

function buildReviewRailEntries(match: any) {
    const reviewRows = Array.isArray(match?.manualReviews) ? match.manualReviews : [];
    const recentManualReviewsByTeam = {
        teamA: [] as Array<any>,
        teamB: [] as Array<any>,
    };

    for (const row of reviewRows) {
        const entry = toManualReviewEntry(row);
        if (entry.teamId === match.teamAId && recentManualReviewsByTeam.teamA.length < 2) {
            recentManualReviewsByTeam.teamA.push(entry);
        }
        if (entry.teamId === match.teamBId && recentManualReviewsByTeam.teamB.length < 2) {
            recentManualReviewsByTeam.teamB.push(entry);
        }
        if (recentManualReviewsByTeam.teamA.length >= 2 && recentManualReviewsByTeam.teamB.length >= 2) {
            break;
        }
    }

    return recentManualReviewsByTeam;
}

function sortMatchesByStartTimeDesc<T extends { startTime?: Date | string | null }>(rows: T[]) {
    return [...rows].sort((left, right) => {
        const leftTime = left.startTime ? new Date(left.startTime).getTime() : 0;
        const rightTime = right.startTime ? new Date(right.startTime).getTime() : 0;
        return rightTime - leftTime;
    });
}

function dedupeMatches<T extends { id: string }>(rows: T[]) {
    const seen = new Set<string>();
    return rows.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
    });
}

function collectAnalysisTeamIds(
    canonicalTeamId: string | null | undefined,
    canonicalTeam: { name?: string | null; shortName?: string | null; region?: string | null } | null | undefined,
    rawTeamId: string | null | undefined,
    rawTeam: { name?: string | null; shortName?: string | null; region?: string | null } | null | undefined,
    canonicalIndex: ReturnType<typeof buildCanonicalTeamIndex>,
) {
    return Array.from(
        new Set(
            [
                ...getRelatedTeamIds(canonicalTeamId, canonicalIndex),
                ...getRelatedTeamIds(rawTeamId, canonicalIndex),
                ...getRelatedTeamIdsByIdentity(canonicalTeam || null, canonicalIndex, canonicalTeam?.region),
                ...getRelatedTeamIdsByIdentity(rawTeam || null, canonicalIndex, rawTeam?.region),
            ].filter(Boolean),
        ),
    );
}

function normalizeRoleKey(value: string | null | undefined): RoleKey | null {
    const normalized = String(value || '').trim().toUpperCase().replace(/[_\s-]+/g, '');
    if (!normalized) return null;
    if (['TOP', 'TOPLANE', '上单'].includes(normalized)) return 'TOP';
    if (['JUN', 'JG', 'JUNGLE', '打野'].includes(normalized)) return 'JUNGLE';
    if (['MID', 'MIDDLE', '中单'].includes(normalized)) return 'MID';
    if (['ADC', 'BOT', 'BOTTOM', '下路'].includes(normalized)) return 'ADC';
    if (['SUP', 'SUPPORT', '辅助'].includes(normalized)) return 'SUPPORT';
    return null;
}

function formatRoleLabel(role: RoleKey) {
    if (role === 'TOP') return '上单';
    if (role === 'JUNGLE') return '打野';
    if (role === 'MID') return '中单';
    if (role === 'ADC') return '下路';
    return '辅助';
}

function toNullableNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function normalizeName(value: unknown) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function parseJsonObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, any>) : {};
    } catch {
        return {};
    }
}

function parsePlayersBlob(blob: unknown): any[] {
    if (!blob) return [];
    if (Array.isArray(blob)) return blob as any[];
    const parsed = parseJsonObject(blob) as any;
    if (Array.isArray(parsed.players)) return parsed.players as any[];
    if (Array.isArray(parsed.damage_data)) return parsed.damage_data as any[];
    if (Array.isArray(parsed.teamA?.players) || Array.isArray(parsed.teamB?.players)) {
        return [...((parsed.teamA?.players || []) as any[]), ...((parsed.teamB?.players || []) as any[])];
    }
    try {
        const json = JSON.parse(String(blob));
        if (Array.isArray(json)) return json;
        if (Array.isArray(json?.players)) return json.players;
        if (Array.isArray(json?.damage_data)) return json.damage_data;
    } catch {
        return [];
    }
    return [];
}

function readAnalysisPayload(value: unknown): Record<string, any> {
    return parseJsonObject(value) as Record<string, any>;
}

function findPlayerStats(rows: any[], playerKey: string, roleKey: string | null) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const exact = rows.find((item: any) =>
        normalizeName(item?.name || item?.player || item?.player_name || item?.playerName || item?.summonerName) === playerKey,
    );
    if (exact) return exact;
    if (!roleKey) return null;
    const byRole = rows.find((item: any) => normalizeRoleKey(item?.role || item?.position || item?.lane) === roleKey);
    return byRole || null;
}

function extractChampionName(stats: any) {
    return String(stats?.hero || stats?.champion || stats?.championName || stats?.character || 'Unknown').trim() || 'Unknown';
}

function resolveGameWinnerForTeam(game: any, teamId: string) {
    const winnerRaw = String(game?.winnerId || '').trim();
    if (!winnerRaw) return null;
    if (winnerRaw === teamId) return true;
    if (/^(BLUE|RED)$/i.test(winnerRaw)) {
        const winnerTeamId =
            winnerRaw.toUpperCase() === 'BLUE' ? String(game?.blueSideTeamId || '') : String(game?.redSideTeamId || '');
        return winnerTeamId.length > 0 ? winnerTeamId === teamId : null;
    }
    return false;
}

function pickPlayerStatsFromGame(game: any, match: any, teamId: string, player: any) {
    const playerKey = normalizeName(player?.name);
    const roleKey = normalizeRoleKey(player?.role);
    const analysis = readAnalysisPayload(game?.analysisData);

    let sideAPlayers = parsePlayersBlob(game?.teamAStats);
    let sideBPlayers = parsePlayersBlob(game?.teamBStats);

    if (sideAPlayers.length === 0) {
        sideAPlayers = (analysis.teamA?.players || []) as any[];
    }
    if (sideBPlayers.length === 0) {
        sideBPlayers = (analysis.teamB?.players || []) as any[];
    }

    const teamSide = match?.teamAId === teamId ? 'A' : match?.teamBId === teamId ? 'B' : '';
    const pickFromSide = (side: 'A' | 'B', sidePlayers: any[]) => {
        const stats = findPlayerStats(sidePlayers, playerKey, roleKey);
        if (!stats) return null;
        return { stats, side };
    };

    let picked: { stats: any; side: 'A' | 'B' } | null = null;
    if (teamSide === 'A') picked = pickFromSide('A', sideAPlayers);
    if (!picked && teamSide === 'B') picked = pickFromSide('B', sideBPlayers);
    if (!picked) picked = pickFromSide('A', sideAPlayers);
    if (!picked) picked = pickFromSide('B', sideBPlayers);

    if (!picked) {
        const analysisAPlayers = (analysis.teamA?.players || []) as any[];
        const analysisBPlayers = (analysis.teamB?.players || []) as any[];
        picked = pickFromSide('A', analysisAPlayers) || pickFromSide('B', analysisBPlayers);
    }

    if (!picked && Array.isArray(analysis.damage_data)) {
        const stats = findPlayerStats(analysis.damage_data as any[], playerKey, roleKey);
        if (stats) {
            picked = { stats, side: teamSide === 'B' ? 'B' : 'A' };
        }
    }

    return picked;
}

function buildFallbackPlayerForm(player: any, teamId: string, matches: any[]) {
    if (!player || !teamId) return null;

    let sampleGames = 0;
    let wins = 0;
    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;
    const championCounter = new Map<string, number>();

    for (const match of matches) {
        const completedGames = getCompletedSeriesGames(match?.format, match?.games || []);
        for (const game of completedGames) {
            const picked = pickPlayerStatsFromGame(game, match, teamId, player);
            if (!picked?.stats) continue;

            sampleGames += 1;
            totalKills += toNullableNumber(picked.stats?.kills ?? picked.stats?.k) ?? 0;
            totalDeaths += toNullableNumber(picked.stats?.deaths ?? picked.stats?.d) ?? 0;
            totalAssists += toNullableNumber(picked.stats?.assists ?? picked.stats?.a) ?? 0;

            const isWin = resolveGameWinnerForTeam(game, teamId);
            if (isWin === true) wins += 1;

            const champion = extractChampionName(picked.stats);
            if (champion && champion !== 'Unknown') {
                championCounter.set(champion, (championCounter.get(champion) || 0) + 1);
            }
        }
    }

    if (sampleGames === 0) return null;

    const losses = Math.max(sampleGames - wins, 0);
    const kda = (totalKills + totalAssists) / Math.max(totalDeaths, 1);
    const topChampions = [...championCounter.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 3)
        .map(([name]) => name);

    return {
        sampleGames,
        recentWinRate: (wins / sampleGames) * 100,
        kda,
        avgKills: totalKills / sampleGames,
        avgDeaths: totalDeaths / sampleGames,
        avgAssists: totalAssists / sampleGames,
        topChampions,
        recentRecordText: `${wins} 胜 ${losses} 负`,
        sourceLabel: '赛事统计回退',
        evaluationLabel: sampleGames >= 6 ? '近场样本可用' : '样本偏少',
    };
}

function buildAnalysisTeamInfo(team: any): PreMatchAnalysisTeamInfo {
    return {
        id: team?.id || null,
        name: String(team?.name || '未知战队'),
        shortName: getTeamShortDisplayName(team),
        logo: team?.logo || null,
        region: team?.region || null,
    };
}

function getSeriesScore(match: any, teamAId: string, teamBId: string) {
    let scoreA = 0;
    let scoreB = 0;
    const games = getCompletedSeriesGames(match?.format, match?.games || []);
    for (const game of games) {
        if (game?.winnerId === teamAId) scoreA += 1;
        if (game?.winnerId === teamBId) scoreB += 1;
    }
    return { scoreA, scoreB };
}

function gameHasResolvedData(game: any) {
    return Boolean(
        game?.winnerId ||
            toNullableNumber(game?.duration) !== null ||
            toNullableNumber(game?.blueKills) !== null ||
            toNullableNumber(game?.redKills) !== null ||
            toNullableNumber(game?.totalKills) !== null ||
            game?.analysisData ||
            game?.teamAStats ||
            game?.teamBStats,
    );
}

function matchHasResolvedSeries(match: any) {
    if (match?.winnerId) return true;
    const games: any[] = Array.isArray(match?.games) ? match.games : [];
    return games.some((game: any) => gameHasResolvedData(game));
}

function buildHeadToHeadStatusLabel(match: any, hasResult: boolean) {
    if (hasResult) return '已完赛';
    const status = String(match?.status || '').trim().toUpperCase();
    if (status === 'LIVE' || status === 'IN_PROGRESS') return '进行中';
    if (status === 'SCHEDULED' || status === 'NOT_STARTED') return '待开赛';
    if (status === 'FINISHED' || status === 'COMPLETED') return '赛果待同步';
    return '待同步';
}

function getTeamGameNumbers(game: any, teamId: string) {
    const blueId = String(game?.blueSideTeamId || '');
    const redId = String(game?.redSideTeamId || '');
    const blueKills = toNullableNumber(game?.blueKills);
    const redKills = toNullableNumber(game?.redKills);

    if (blueId && blueId === teamId) {
        return { kills: blueKills, deaths: redKills };
    }
    if (redId && redId === teamId) {
        return { kills: redKills, deaths: blueKills };
    }

    return { kills: null, deaths: null };
}

function buildRecentSummary(matches: any[], teamId: string): PreMatchAnalysisRecentSummary {
    const recent10 = matches.slice(0, 10);
    const recent5 = recent10
        .slice(0, 5)
        .map((match) => (match?.winnerId === teamId ? 'W' : match?.winnerId ? 'L' : '-'));

    let seriesWins = 0;
    let gameWins = 0;
    let gameLosses = 0;
    let totalDuration = 0;
    let durationGames = 0;
    let totalKills = 0;
    let killSamples = 0;
    let totalDeaths = 0;
    let deathSamples = 0;

    for (const match of recent10) {
        if (match?.winnerId === teamId) seriesWins += 1;
        const completedGames = getCompletedSeriesGames(match?.format, match?.games || []);

        for (const game of completedGames) {
            if (game?.winnerId === teamId) gameWins += 1;
            if (game?.winnerId && game?.winnerId !== teamId) gameLosses += 1;

            const { kills, deaths } = getTeamGameNumbers(game, teamId);
            if (kills !== null) {
                totalKills += kills;
                killSamples += 1;
            }
            if (deaths !== null) {
                totalDeaths += deaths;
                deathSamples += 1;
            }

            const duration = toNullableNumber(game?.duration);
            if (duration !== null) {
                totalDuration += duration;
                durationGames += 1;
            }
        }
    }

    const avgDurationSeconds = durationGames > 0 ? Math.round(totalDuration / durationGames) : null;
    const avgDurationLabel =
        avgDurationSeconds === null
            ? '--'
            : `${Math.floor(avgDurationSeconds / 60)}:${String(avgDurationSeconds % 60).padStart(2, '0')}`;
    const avgKills = killSamples > 0 ? totalKills / killSamples : null;
    const avgDeaths = deathSamples > 0 ? totalDeaths / deathSamples : null;
    const avgKdRatio = avgKills !== null && avgDeaths !== null ? avgKills / Math.max(avgDeaths, 1) : null;

    return {
        seriesWins,
        seriesCount: recent10.length,
        gameWins,
        gameLosses,
        recent5,
        avgDurationLabel,
        avgKills,
        avgDeaths,
        avgKillDiff: avgKills !== null && avgDeaths !== null ? avgKills - avgDeaths : null,
        avgKdRatio,
    };
}

function buildTrendPoints(matches: any[], teamId: string, ownName: string): PreMatchAnalysisTrendPoint[] {
    return matches.slice(0, 5).map((match: any) => {
        const completedGames = getCompletedSeriesGames(match?.format, match?.games || []);
        const { scoreA, scoreB } = getSeriesScore(match, match.teamAId, match.teamBId);
        const isTeamA = match.teamAId === teamId;
        const opponentName = isTeamA ? getDisplayTeamName(match.teamB) : getDisplayTeamName(match.teamA);
        const result: 'W' | 'L' | '-' = match?.winnerId === teamId ? 'W' : match?.winnerId ? 'L' : '-';

        let totalDuration = 0;
        let durationGames = 0;
        let totalKills = 0;
        let totalDeaths = 0;
        let killSamples = 0;
        let deathSamples = 0;

        for (const game of completedGames) {
            const duration = toNullableNumber(game?.duration);
            if (duration !== null) {
                totalDuration += duration;
                durationGames += 1;
            }
            const { kills, deaths } = getTeamGameNumbers(game, teamId);
            if (kills !== null) {
                totalKills += kills;
                killSamples += 1;
            }
            if (deaths !== null) {
                totalDeaths += deaths;
                deathSamples += 1;
            }
        }

        const avgDurationSeconds = durationGames > 0 ? Math.round(totalDuration / durationGames) : null;
        const avgKills = killSamples > 0 ? totalKills / killSamples : null;
        const avgDeaths = deathSamples > 0 ? totalDeaths / deathSamples : null;
        const scoreLabel = isTeamA ? `${ownName} ${scoreA} : ${scoreB} ${opponentName}` : `${ownName} ${scoreB} : ${scoreA} ${opponentName}`;

        return {
            matchId: String(match.id),
            startTime: match?.startTime ? new Date(match.startTime).toISOString() : null,
            opponent: opponentName,
            result,
            scoreLabel,
            durationLabel:
                avgDurationSeconds === null
                    ? '--'
                    : `${Math.floor(avgDurationSeconds / 60)}:${String(avgDurationSeconds % 60).padStart(2, '0')}`,
            kills: avgKills,
            deaths: avgDeaths,
            kdRatio: avgKills !== null && avgDeaths !== null ? avgKills / Math.max(avgDeaths, 1) : null,
        };
    });
}

function extractChampionNames(rows: unknown): string[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => String((row as any)?.champion_id || '').trim())
        .filter(Boolean);
}

function buildChampionHighlights(champions: string[]) {
    const counter = new Map<string, number>();
    for (const champion of champions) {
        counter.set(champion, (counter.get(champion) || 0) + 1);
    }
    return [...counter.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 6)
        .map(([name]) => name);
}

function buildBpInsights(match: any, teamAName: string, teamBName: string) {
    const games = Array.isArray(match?.games) ? match.games : [];
    const bpGames: PreMatchAnalysisBpGame[] = [];
    const teamAChampions: string[] = [];
    const teamBChampions: string[] = [];

    for (const game of games) {
        const raw = String(game?.analysisData || '').trim();
        if (!raw) continue;

        try {
            const parsed = JSON.parse(raw) as { source?: string; payload?: any };
            const payload = parsed?.payload;
            if (!payload || !Array.isArray(payload.blue_picks) || !Array.isArray(payload.red_picks)) continue;

            const matchTeamAIsBlue = String(game?.blueSideTeamId || '') === String(match?.teamAId || '');
            const currentTeamAChampions = extractChampionNames(matchTeamAIsBlue ? payload.blue_picks : payload.red_picks);
            const currentTeamBChampions = extractChampionNames(matchTeamAIsBlue ? payload.red_picks : payload.blue_picks);

            teamAChampions.push(...currentTeamAChampions);
            teamBChampions.push(...currentTeamBChampions);

            bpGames.push({
                gameNumber: Number(game?.gameNumber || bpGames.length + 1),
                sideLabel: matchTeamAIsBlue ? `${teamAName} 蓝方` : `${teamAName} 红方`,
                teamAChampions: currentTeamAChampions,
                teamBChampions: currentTeamBChampions,
            });
        } catch {
            continue;
        }
    }

    return {
        totalGames: bpGames.length,
        teamAHighlights: buildChampionHighlights(teamAChampions),
        teamBHighlights: buildChampionHighlights(teamBChampions),
        games: bpGames.sort((left, right) => left.gameNumber - right.gameNumber),
    };
}

function pickPreferredSnapshot(
    current: SnapshotLite | null,
    candidate: SnapshotLite,
    currentTournament: string,
    currentSeasonYear: string,
) {
    const score = (row: SnapshotLite) => {
        let total = 0;
        const totalGames = Number(row.currentTotalGames || row.sampleGames || row.games || 0);
        const tournamentGames = Number(row.games || 0);
        const confidence = Number(row.confidence || 0);
        const hasCoreScore =
            row.overallScore !== null ||
            row.relativeScore !== null ||
            row.laneScore !== null ||
            row.stateScore !== null ||
            row.masteryScore !== null ||
            row.trendScore !== null;
        const hasLiveMetrics =
            Number(row.damagePerMin || 0) > 0 ||
            Number(row.killParticipationPct || 0) > 0 ||
            Number(row.kda || 0) > 0 ||
            Number(row.avgKills || 0) > 0 ||
            Number(row.avgDeaths || 0) > 0 ||
            Number(row.avgAssists || 0) > 0;
        const isLikelyIncomplete =
            tournamentGames <= 1 &&
            totalGames >= 10 &&
            Number(row.damagePerMin || 0) <= 0 &&
            Number(row.killParticipationPct || 0) <= 0 &&
            Number(row.kda || 0) <= 0;

        if (row.seasonYear === currentSeasonYear) total += 30000;
        if (row.tournamentName === currentTournament) total += hasLiveMetrics ? 12000 : 1500;
        if (hasCoreScore) total += 12000;
        if (hasLiveMetrics) total += 18000;
        total += totalGames * 150;
        total += tournamentGames * 250;
        total += confidence * 40;
        if (isLikelyIncomplete) total -= 120000;
        total += row.syncedAt.getTime() / 100000000;
        return total;
    };

    if (!current) return candidate;
    return score(candidate) > score(current) ? candidate : current;
}

function buildRankText(rankView: Awaited<ReturnType<typeof getPlayerRankViewData>> | null) {
    if (!rankView) return null;
    const tier = String(rankView.summary.currentTier || '').trim();
    const rank = String(rankView.summary.currentRank || '').trim();
    if (!tier || tier === '未上榜') return '未上榜';
    return `${tier}${rank ? ` ${rank}` : ''}`;
}

function buildPlayerCard(
    player: any | null,
    snapshot: SnapshotLite | null,
    rankView: Awaited<ReturnType<typeof getPlayerRankViewData>> | null,
    fallbackForm?: ReturnType<typeof buildFallbackPlayerForm> | null,
): PreMatchAnalysisPlayerCard | null {
    if (!player) return null;
    const hasPreciseSnapshot =
        snapshot?.overallScore !== null ||
        snapshot?.relativeScore !== null ||
        snapshot?.laneScore !== null ||
        snapshot?.stateScore !== null ||
        snapshot?.masteryScore !== null ||
        snapshot?.trendScore !== null;
    const sourceLabel = hasPreciseSnapshot ? '已接入完整快照评分' : fallbackForm?.sourceLabel ?? null;
    const sourceDetail = hasPreciseSnapshot
        ? '数据来源：PlayerStatSnapshot，总分/赛区分/对线评分/状态分直接取数据库快照。'
        : fallbackForm?.sourceLabel
          ? '数据来源：近场赛事原始统计，仅展示真实样本，不生成综合评分。'
          : '当前还没有可用快照或赛事样本。';
    return {
        playerId: player.id || null,
        name: String(player.name || '未知选手'),
        role: formatRoleLabel(normalizeRoleKey(player.role) || 'TOP'),
        overallScore: snapshot?.overallScore ?? null,
        relativeScore: snapshot?.relativeScore ?? null,
        confidence: snapshot?.confidence ?? null,
        laneScore: snapshot?.laneScore ?? null,
        stateScore: snapshot?.stateScore ?? null,
        masteryScore: snapshot?.masteryScore ?? null,
        trendScore: snapshot?.trendScore ?? null,
        sampleGames: snapshot?.currentTotalGames ?? snapshot?.sampleGames ?? snapshot?.games ?? fallbackForm?.sampleGames ?? null,
        winRate: snapshot?.winRatePct ?? null,
        recentWinRate: snapshot?.recentWinRatePct ?? fallbackForm?.recentWinRate ?? null,
        kda: snapshot?.kda ?? fallbackForm?.kda ?? null,
        avgKills: snapshot?.avgKills ?? fallbackForm?.avgKills ?? null,
        avgDeaths: snapshot?.avgDeaths ?? fallbackForm?.avgDeaths ?? null,
        avgAssists: snapshot?.avgAssists ?? fallbackForm?.avgAssists ?? null,
        damagePerMin: snapshot?.damagePerMin ?? null,
        killParticipationPct: snapshot?.killParticipationPct ?? null,
        goldDiffAt15: snapshot?.goldDiffAt15 ?? null,
        csDiffAt15: snapshot?.csDiffAt15 ?? null,
        xpDiffAt15: snapshot?.xpDiffAt15 ?? null,
        evaluationLabel: snapshot?.evaluationLabel ?? fallbackForm?.evaluationLabel ?? null,
        rankText: buildRankText(rankView),
        leaguePoints: rankView?.summary.leaguePoints ?? null,
        activityLabel: rankView?.summary.activityLabel ?? null,
        activityScore: rankView?.summary.activityScore ?? null,
        topChampions:
            (rankView?.recentState.topChampions || []).map((item) => item.championName).filter(Boolean).slice(0, 3).length > 0
                ? (rankView?.recentState.topChampions || []).map((item) => item.championName).filter(Boolean).slice(0, 3)
                : fallbackForm?.topChampions || [],
        recentRecordText: fallbackForm?.recentRecordText ?? null,
        sourceLabel,
        sourceDetail,
    };
}

function buildChampionPool(rankViews: Array<Awaited<ReturnType<typeof getPlayerRankViewData>> | null>) {
    const counter = new Map<string, number>();
    for (const rankView of rankViews) {
        for (const champion of rankView?.recentState.topChampions || []) {
            const name = String(champion?.championName || '').trim();
            if (!name) continue;
            counter.set(name, (counter.get(name) || 0) + 1);
        }
    }

    return [...counter.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 5)
        .map(([name]) => name);
}

function buildTeamRankSummary(rankViews: Array<Awaited<ReturnType<typeof getPlayerRankViewData>> | null>) {
    const available = rankViews.filter(Boolean) as Array<NonNullable<Awaited<ReturnType<typeof getPlayerRankViewData>>>>;
    const covered = available.filter((row) => row.summary.accountCount > 0 || row.summary.currentTier !== '未上榜');
    const avgActivity = covered.length > 0 ? covered.reduce((sum, row) => sum + row.summary.activityScore, 0) / covered.length : null;
    const maxLp = covered.reduce<number | null>((best, row) => {
        if (row.summary.leaguePoints === null || row.summary.leaguePoints === undefined) return best;
        if (best === null) return row.summary.leaguePoints;
        return row.summary.leaguePoints > best ? row.summary.leaguePoints : best;
    }, null);
    const lastSyncedAt =
        covered
            .map((row) => row.sync.lastSyncedAt)
            .filter(Boolean)
            .sort((left, right) => (right ? right.getTime() : 0) - (left ? left.getTime() : 0))[0] || null;

    return {
        coveredPlayers: covered.length,
        rankedPlayers: rankViews.length,
        avgActivity,
        maxLp,
        highActivityPlayers: covered.filter((row) => ['火热', '活跃'].includes(row.summary.activityLabel)).length,
        lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
        topChampions: buildChampionPool(covered),
    };
}

function scoreCanonicalPlayerCandidate(candidate: any, expectedRole: RoleKey | null, relatedTeamIds: Set<string>) {
    const snapshots = Array.isArray(candidate?.statSnapshots) ? candidate.statSnapshots : [];
    let score = snapshots.length * 5;
    score += snapshots.reduce(
        (acc: number, item: any) => acc + Number(item?.currentTotalGames || item?.games || 0),
        0,
    ) * 0.05;
    if (
        snapshots.some(
            (item: any) =>
                item?.overallScore !== null ||
                item?.relativeScore !== null ||
                item?.damagePerMin !== null ||
                item?.killParticipationPct !== null,
        )
    ) {
        score += 20;
    }
    if (expectedRole && normalizeRoleKey(candidate?.role) === expectedRole) score += 8;
    if (relatedTeamIds.has(String(candidate?.teamId || ''))) score += 6;
    score += new Date(candidate?.updatedAt || 0).getTime() * 0.000000000001;
    return score;
}

function resolveCanonicalPlayersForRoster(players: any[], candidateMap: Map<string, any[]>, relatedTeamIds: string[]) {
    const relatedSet = new Set(relatedTeamIds);
    return players.map((player) => {
        const key = normalizeName(player?.name);
        const expectedRole = normalizeRoleKey(player?.role);
        const candidates = (candidateMap.get(key) || []).filter((candidate) => {
            const candidateRole = normalizeRoleKey(candidate?.role);
            if (!expectedRole || !candidateRole) return true;
            return candidateRole === expectedRole;
        });

        if (candidates.length === 0) return player;

        const picked =
            [...candidates].sort(
                (left, right) =>
                    scoreCanonicalPlayerCandidate(right, expectedRole, relatedSet) -
                    scoreCanonicalPlayerCandidate(left, expectedRole, relatedSet),
            )[0] || player;

        return {
            ...player,
            id: picked.id || player.id,
            name: picked.name || player.name,
            role: picked.role || player.role,
            teamId: picked.teamId || player.teamId,
        };
    });
}

function scoreRosterSource(team: any, preferredTeamId?: string | null) {
    const players = Array.isArray(team?.players) ? team.players : [];
    const roleCoverage = new Set(
        players
            .map((player: any) => normalizeRoleKey(player?.role))
            .filter(Boolean),
    ).size;
    const namedPlayers = players.filter((player: any) => String(player?.name || '').trim()).length;
    const idPlayers = players.filter((player: any) => String(player?.id || '').trim()).length;

    let score = roleCoverage * 100 + namedPlayers * 10 + idPlayers * 4 + players.length;
    if (preferredTeamId && String(team?.id || '') === String(preferredTeamId)) score += 12;
    return score;
}

function pickBestRosterSource(teams: any[], preferredTeamId?: string | null) {
    return [...teams].sort((left, right) => scoreRosterSource(right, preferredTeamId) - scoreRosterSource(left, preferredTeamId))[0] || null;
}

function scoreRosterPlayer(player: any) {
    let score = 0;
    if (String(player?.name || '').trim()) score += 10;
    if (String(player?.id || '').trim()) score += 8;
    if (normalizeRoleKey(player?.role)) score += 6;
    if (String(player?.teamId || '').trim()) score += 3;
    return score;
}

function mergeRosterPlayers(...groups: any[][]) {
    const merged = new Map<string, any>();

    for (const group of groups) {
        for (const player of group || []) {
            const normalizedName = normalizeName(player?.name);
            const normalizedRole = normalizeRoleKey(player?.role) || 'UNKNOWN';
            const playerId = String(player?.id || '').trim();
            const key = normalizedName ? `${normalizedRole}::${normalizedName}` : `ID::${playerId}`;
            if (!key || key === 'ID::') continue;

            const current = merged.get(key);
            if (!current || scoreRosterPlayer(player) > scoreRosterPlayer(current)) {
                merged.set(key, player);
            }
        }
    }

    return [...merged.values()];
}

function pickPlayersByRole(players: any[], snapshotMap: Map<string, SnapshotLite>, limitPerRole = 3) {
    const result = new Map<RoleKey, any[]>();

    for (const role of ROLE_ORDER) {
        const candidates = players.filter((player) => normalizeRoleKey(player?.role) === role);
        const picked = [...candidates]
            .sort((left, right) => {
                const leftSnapshot = snapshotMap.get(left.id);
                const rightSnapshot = snapshotMap.get(right.id);
                const leftScore = Number(leftSnapshot?.currentTotalGames || leftSnapshot?.sampleGames || leftSnapshot?.games || 0);
                const rightScore = Number(rightSnapshot?.currentTotalGames || rightSnapshot?.sampleGames || rightSnapshot?.games || 0);
                if (rightScore !== leftScore) return rightScore - leftScore;
                return String(left?.name || '').localeCompare(String(right?.name || ''));
            })
            .slice(0, limitPerRole);

        result.set(role, picked);
    }

    return result;
}

function buildMatchupEdgeText(
    teamAPlayer: PreMatchAnalysisPlayerCard | null,
    teamBPlayer: PreMatchAnalysisPlayerCard | null,
    teamAShortName: string,
    teamBShortName: string,
) {
    const normalizeComparisonScore = (player: PreMatchAnalysisPlayerCard | null) => {
        if (!player) return null;
        if (player.overallScore !== null && player.overallScore !== undefined) return { value: player.overallScore, label: '总分' };
        if (player.relativeScore !== null && player.relativeScore !== undefined) return { value: player.relativeScore, label: '赛区分' };
        if (player.laneScore !== null && player.laneScore !== undefined) return { value: player.laneScore, label: '对线评分' };
        if (player.stateScore !== null && player.stateScore !== undefined) return { value: player.stateScore, label: '状态分' };
        return null;
    };

    const leftScore = normalizeComparisonScore(teamAPlayer);
    const rightScore = normalizeComparisonScore(teamBPlayer);

    if (leftScore === null || rightScore === null) {
        return { edgeText: '快照不完整，暂不做综合优劣', edgeValue: null, edgeMetricLabel: null };
    }
    if (leftScore.label !== rightScore.label) {
        return { edgeText: '评分字段不一致，先看下方原始指标', edgeValue: null, edgeMetricLabel: null };
    }
    const diff = leftScore.value - rightScore.value;
    if (Math.abs(diff) < 3) return { edgeText: '双方接近，属于五五开对位', edgeValue: diff, edgeMetricLabel: leftScore.label };
    if (diff > 0) return { edgeText: `${teamAShortName} 位置占优，+${diff.toFixed(1)}`, edgeValue: diff, edgeMetricLabel: leftScore.label };
    return { edgeText: `${teamBShortName} 位置占优，+${Math.abs(diff).toFixed(1)}`, edgeValue: diff, edgeMetricLabel: leftScore.label };
}

function buildSummaryText(params: {
    teamA: PreMatchAnalysisTeamInfo;
    teamB: PreMatchAnalysisTeamInfo;
    teamARecent: PreMatchAnalysisRecentSummary;
    teamBRecent: PreMatchAnalysisRecentSummary;
    headToHead: PreMatchAnalysisHeadToHeadEntry[];
    teamARank: ReturnType<typeof buildTeamRankSummary>;
    teamBRank: ReturnType<typeof buildTeamRankSummary>;
    matchups: Array<{ role: string; edgeValue: number | null }>;
    bpReady: boolean;
}) {
    const { teamA, teamB, teamARecent, teamBRecent, headToHead, teamARank, teamBRank, matchups, bpReady } = params;

    const recentWinRateA = teamARecent.seriesCount > 0 ? teamARecent.seriesWins / teamARecent.seriesCount : 0;
    const recentWinRateB = teamBRecent.seriesCount > 0 ? teamBRecent.seriesWins / teamBRecent.seriesCount : 0;
    const headToHeadAWins = headToHead.filter((item) => item.winnerSide === 'A').length;
    const headToHeadBWins = headToHead.filter((item) => item.winnerSide === 'B').length;
    const avgActivityA = teamARank.avgActivity ?? 0;
    const avgActivityB = teamBRank.avgActivity ?? 0;

    let scoreA = 0;
    let scoreB = 0;

    if (recentWinRateA > recentWinRateB + 0.12) scoreA += 2;
    else if (recentWinRateB > recentWinRateA + 0.12) scoreB += 2;

    if (avgActivityA > avgActivityB + 6) scoreA += 1;
    else if (avgActivityB > avgActivityA + 6) scoreB += 1;

    if (headToHeadAWins > headToHeadBWins) scoreA += 1;
    else if (headToHeadBWins > headToHeadAWins) scoreB += 1;

    if ((teamARecent.avgKillDiff ?? 0) > (teamBRecent.avgKillDiff ?? 0) + 2) scoreA += 1;
    else if ((teamBRecent.avgKillDiff ?? 0) > (teamARecent.avgKillDiff ?? 0) + 2) scoreB += 1;

    const leanTeam = scoreA === scoreB ? 'EVEN' : scoreA > scoreB ? 'A' : 'B';
    const leanLabel =
        leanTeam === 'EVEN'
            ? '综合判断：双方接近'
            : leanTeam === 'A'
              ? `综合判断：${teamA.shortName} 略优`
              : `综合判断：${teamB.shortName} 略优`;

    const riskLabel =
        headToHead.length < 2 || teamARecent.seriesCount < 4 || teamBRecent.seriesCount < 4
            ? '高，样本偏少'
            : teamARank.coveredPlayers < 3 || teamBRank.coveredPlayers < 3
              ? '中，Rank 覆盖一般'
              : '低，可作参考';

    const recentEdgeText =
        recentWinRateA === recentWinRateB
            ? '近期状态接近'
            : recentWinRateA > recentWinRateB
              ? `${teamA.shortName} 近 10 场更稳`
              : `${teamB.shortName} 近 10 场更稳`;

    const rankEdgeText =
        Math.abs(avgActivityA - avgActivityB) < 5
            ? 'Rank 热度接近'
            : avgActivityA > avgActivityB
              ? `${teamA.shortName} Rank 热度更高`
              : `${teamB.shortName} Rank 热度更高`;

    const headToHeadText =
        headToHead.length > 0
            ? `${teamA.shortName} ${headToHeadAWins} 胜 / ${headToHeadBWins} 胜 ${teamB.shortName}`
            : '暂无已完赛交手';

    const bpStatusText = bpReady ? '已接入 BP 英雄倾向' : '当前未接入 BP 明细';
    const strongestMatchup = [...matchups]
        .filter((item) => item.edgeValue !== null)
        .sort((left, right) => Math.abs((right.edgeValue as number)) - Math.abs((left.edgeValue as number)))[0];
    const focusText = strongestMatchup
        ? `${strongestMatchup.role} 位置值得重点看`
        : headToHead.length > 0
          ? '交手样本可作辅助参考'
          : '优先看近期状态与 Rank 热度';

    return {
        leanLabel,
        leanTeam,
        riskLabel,
        headToHeadText,
        rankEdgeText,
        recentEdgeText,
        bpStatusText,
        focusText,
    } as PreMatchAnalysisData['summary'];
}

export default async function MatchDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { id } = await params;
    const { gameNumber } = await searchParams;

    let match = await prisma.match.findUnique({
        where: { id },
        include: MATCH_DETAIL_INCLUDE,
    });

    if (!match) notFound();

    const [patchedGames, patchedVersion] = await Promise.all([ensureGamesByFormat(match), ensureMappedVersion(match)]);

    if (patchedGames || patchedVersion) {
        const refreshed = await prisma.match.findUnique({
            where: { id },
            include: MATCH_DETAIL_INCLUDE,
        });
        if (!refreshed) notFound();
        match = refreshed;
    }

    const allTeams = await prisma.team.findMany({
        select: {
            id: true,
            name: true,
            shortName: true,
            logo: true,
            region: true,
        },
    });

    const canonicalIndex = buildCanonicalTeamIndex(allTeams);
    const canonicalMatch = canonicalizeMatchTeams(match as any, canonicalIndex);
    const teamMap = new Map(canonicalIndex.canonicalTeams.map((team) => [team.id, team]));

    const gamesWithTeams = (canonicalMatch.games as any[]).map((g: Game) => ({
        ...g,
        blueSideTeam: g.blueSideTeamId ? teamMap.get(g.blueSideTeamId) : null,
        redSideTeam: g.redSideTeamId ? teamMap.get(g.redSideTeamId) : null,
    }));

    const hydratedManualReviews = (canonicalMatch.manualReviews || []).map((entry: any) => {
        const normalized = toManualReviewEntry(entry);
        return {
            ...normalized,
            createdAt: entry.createdAt,
            opponentTeamName:
                normalized.opponentTeamName && normalized.opponentTeamName !== '--'
                    ? normalized.opponentTeamName
                    : normalized.teamId === canonicalMatch.teamAId
                      ? getDisplayTeamName(canonicalMatch.teamB)
                      : getDisplayTeamName(canonicalMatch.teamA),
        };
    });

    const matchWithTeams = {
        ...canonicalMatch,
        games: gamesWithTeams,
        manualReviews: hydratedManualReviews,
    };

    const serializedMatch = JSON.parse(JSON.stringify(matchWithTeams));
    const recentManualReviewsByTeam = buildReviewRailEntries(matchWithTeams);

    const teamAStats = canonicalMatch.teamAId
        ? await getCachedRecentStats(canonicalMatch.teamAId)
        : { duration: null, kills: null, tenMinKills: null };
    const teamBStats = canonicalMatch.teamBId
        ? await getCachedRecentStats(canonicalMatch.teamBId)
        : { duration: null, kills: null, tenMinKills: null };

    let serializedPreMatchAnalysis: PreMatchAnalysisData | null = null;

    if (canonicalMatch.teamAId && canonicalMatch.teamBId) {
        const teamARelatedIds = collectAnalysisTeamIds(
            canonicalMatch.teamAId,
            canonicalMatch.teamA || null,
            match.teamAId || null,
            match.teamA || null,
            canonicalIndex,
        );
        const teamBRelatedIds = collectAnalysisTeamIds(
            canonicalMatch.teamBId,
            canonicalMatch.teamB || null,
            match.teamBId || null,
            match.teamB || null,
            canonicalIndex,
        );

        const [recentTeamARaw, recentTeamBRaw, headToHeadRaw, relatedTeamsWithPlayers] = await Promise.all([
            prisma.match.findMany({
                where: {
                    id: { not: id },
                    winnerId: { not: null },
                    OR: [{ teamAId: { in: teamARelatedIds } }, { teamBId: { in: teamARelatedIds } }],
                },
                include: {
                    teamA: { select: ANALYSIS_TEAM_SELECT },
                    teamB: { select: ANALYSIS_TEAM_SELECT },
                    games: { orderBy: { gameNumber: 'asc' } },
                },
                orderBy: { startTime: 'desc' },
                take: 30,
            }),
            prisma.match.findMany({
                where: {
                    id: { not: id },
                    winnerId: { not: null },
                    OR: [{ teamAId: { in: teamBRelatedIds } }, { teamBId: { in: teamBRelatedIds } }],
                },
                include: {
                    teamA: { select: ANALYSIS_TEAM_SELECT },
                    teamB: { select: ANALYSIS_TEAM_SELECT },
                    games: { orderBy: { gameNumber: 'asc' } },
                },
                orderBy: { startTime: 'desc' },
                take: 30,
            }),
            prisma.match.findMany({
                where: {
                    id: { not: id },
                    OR: [
                        {
                            AND: [{ teamAId: { in: teamARelatedIds } }, { teamBId: { in: teamBRelatedIds } }],
                        },
                        {
                            AND: [{ teamAId: { in: teamBRelatedIds } }, { teamBId: { in: teamARelatedIds } }],
                        },
                    ],
                },
                include: {
                    teamA: { select: ANALYSIS_TEAM_SELECT },
                    teamB: { select: ANALYSIS_TEAM_SELECT },
                    games: { orderBy: { gameNumber: 'asc' } },
                },
                orderBy: { startTime: 'desc' },
                take: 12,
            }),
            prisma.team.findMany({
                where: {
                    id: { in: Array.from(new Set([...teamARelatedIds, ...teamBRelatedIds])) },
                },
                include: {
                    players: true,
                },
            }),
        ]);

        const normalizeAnalysisMatches = (rows: any[]) =>
            dedupeMatches(
                sortMatchesByStartTimeDesc(rows.map((row) => canonicalizeMatchTeams(row, canonicalIndex)).filter((row) => row.id !== id)),
            );

        const recentTeamAMatches = normalizeAnalysisMatches(recentTeamARaw)
            .filter((row) => row.teamAId === canonicalMatch.teamAId || row.teamBId === canonicalMatch.teamAId)
            .slice(0, 10);
        const recentTeamBMatches = normalizeAnalysisMatches(recentTeamBRaw)
            .filter((row) => row.teamAId === canonicalMatch.teamBId || row.teamBId === canonicalMatch.teamBId)
            .slice(0, 10);
        const teamAIdSet = new Set(teamARelatedIds);
        const teamBIdSet = new Set(teamBRelatedIds);
        const directHeadToHeadMatches = normalizeAnalysisMatches(headToHeadRaw)
            .filter(
                (row) =>
                    (row.teamAId === canonicalMatch.teamAId && row.teamBId === canonicalMatch.teamBId) ||
                    (row.teamAId === canonicalMatch.teamBId && row.teamBId === canonicalMatch.teamAId) ||
                    (teamAIdSet.has(String(row.teamAId || '')) && teamBIdSet.has(String(row.teamBId || ''))) ||
                    (teamBIdSet.has(String(row.teamAId || '')) && teamAIdSet.has(String(row.teamBId || ''))),
            );
        const headToHeadMatches = directHeadToHeadMatches.filter((row) => matchHasResolvedSeries(row)).slice(0, 5);

        const originalTeamAPlayers = Array.isArray(match.teamA?.players) ? match.teamA.players : [];
        const originalTeamBPlayers = Array.isArray(match.teamB?.players) ? match.teamB.players : [];
        const teamARosterSources = relatedTeamsWithPlayers
            .filter((team) => teamARelatedIds.includes(String(team.id)))
            .sort((left, right) => scoreRosterSource(right, canonicalMatch.teamAId) - scoreRosterSource(left, canonicalMatch.teamAId));
        const teamBRosterSources = relatedTeamsWithPlayers
            .filter((team) => teamBRelatedIds.includes(String(team.id)))
            .sort((left, right) => scoreRosterSource(right, canonicalMatch.teamBId) - scoreRosterSource(left, canonicalMatch.teamBId));
        const teamAPlayers = mergeRosterPlayers(...teamARosterSources.map((team) => team.players || []), originalTeamAPlayers);
        const teamBPlayers = mergeRosterPlayers(...teamBRosterSources.map((team) => team.players || []), originalTeamBPlayers);

        const rosterNames = Array.from(
            new Set(
                [...teamAPlayers, ...teamBPlayers]
                    .map((player: any) => String(player?.name || '').trim())
                    .filter(Boolean),
            ),
        );

        const canonicalPlayerCandidates =
            rosterNames.length > 0
                ? await prisma.player.findMany({
                      where: {
                          name: { in: rosterNames },
                      },
                      include: {
                          statSnapshots: {
                              select: {
                                  games: true,
                                  currentTotalGames: true,
                                  overallScore: true,
                                  relativeScore: true,
                                  damagePerMin: true,
                                  killParticipationPct: true,
                              },
                              orderBy: [{ syncedAt: 'desc' }, { games: 'desc' }],
                              take: 20,
                          },
                      },
                  })
                : [];

        const canonicalPlayerMap = new Map<string, any[]>();
        for (const candidate of canonicalPlayerCandidates) {
            const key = normalizeName(candidate?.name);
            if (!key) continue;
            const current = canonicalPlayerMap.get(key) || [];
            current.push(candidate);
            canonicalPlayerMap.set(key, current);
        }

        const teamACanonicalPlayers = resolveCanonicalPlayersForRoster(teamAPlayers, canonicalPlayerMap, teamARelatedIds);
        const teamBCanonicalPlayers = resolveCanonicalPlayersForRoster(teamBPlayers, canonicalPlayerMap, teamBRelatedIds);

        const analysisPlayerIds = Array.from(
            new Set(
                [...teamACanonicalPlayers, ...teamBCanonicalPlayers]
                    .map((player: any) => String(player?.id || '').trim())
                    .filter(Boolean),
            ),
        );

        const snapshotRows: SnapshotLite[] =
            analysisPlayerIds.length > 0
                ? await prisma.playerStatSnapshot.findMany({
                      where: {
                          playerId: { in: analysisPlayerIds },
                      },
                      select: {
                          playerId: true,
                          tournamentName: true,
                          seasonYear: true,
                          confidence: true,
                          stateScore: true,
                          masteryScore: true,
                          laneScore: true,
                          overallScore: true,
                          relativeScore: true,
                          relativeZScore: true,
                          winRatePct: true,
                          recentWinRatePct: true,
                          kda: true,
                          avgKills: true,
                          avgDeaths: true,
                          avgAssists: true,
                          damagePerMin: true,
                          killParticipationPct: true,
                          goldDiffAt15: true,
                          csDiffAt15: true,
                          xpDiffAt15: true,
                          evaluationLabel: true,
                          trendScore: true,
                          sampleGames: true,
                          currentTotalGames: true,
                          games: true,
                          syncedAt: true,
                      },
                      orderBy: [{ syncedAt: 'desc' }],
                  })
                : [];

        const currentSeasonYear = String(new Date(canonicalMatch.startTime || Date.now()).getFullYear());
        const snapshotMap = new Map<string, SnapshotLite>();
        for (const row of snapshotRows) {
            const playerId = String(row.playerId || '').trim();
            if (!playerId) continue;
            snapshotMap.set(
                playerId,
                pickPreferredSnapshot(snapshotMap.get(playerId) || null, row, String(canonicalMatch.tournament || ''), currentSeasonYear),
            );
        }

        const rankEntries = await Promise.all(
            analysisPlayerIds.map(async (playerId) => [playerId, await getPlayerRankViewData(playerId)] as const),
        );
        const rankMap = new Map(rankEntries);

        const teamAPlayersByRole = pickPlayersByRole(teamACanonicalPlayers, snapshotMap);
        const teamBPlayersByRole = pickPlayersByRole(teamBCanonicalPlayers, snapshotMap);
        const teamALineupPlayers = ROLE_ORDER.map((role) => (teamAPlayersByRole.get(role) || [])[0]).filter(Boolean) as any[];
        const teamBLineupPlayers = ROLE_ORDER.map((role) => (teamBPlayersByRole.get(role) || [])[0]).filter(Boolean) as any[];

        const matchups = ROLE_ORDER.map((role) => {
            const teamAPlayersForRole = teamAPlayersByRole.get(role) || [];
            const teamBPlayersForRole = teamBPlayersByRole.get(role) || [];
            const teamAPlayer = teamAPlayersForRole[0] || null;
            const teamBPlayer = teamBPlayersForRole[0] || null;
            const teamAFallbackForm =
                teamAPlayer && canonicalMatch.teamAId ? buildFallbackPlayerForm(teamAPlayer, canonicalMatch.teamAId, recentTeamAMatches) : null;
            const teamBFallbackForm =
                teamBPlayer && canonicalMatch.teamBId ? buildFallbackPlayerForm(teamBPlayer, canonicalMatch.teamBId, recentTeamBMatches) : null;
            const teamAPlayerCard = buildPlayerCard(
                teamAPlayer,
                teamAPlayer?.id ? snapshotMap.get(teamAPlayer.id) || null : null,
                teamAPlayer?.id ? rankMap.get(teamAPlayer.id) || null : null,
                teamAFallbackForm,
            );
            const teamBPlayerCard = buildPlayerCard(
                teamBPlayer,
                teamBPlayer?.id ? snapshotMap.get(teamBPlayer.id) || null : null,
                teamBPlayer?.id ? rankMap.get(teamBPlayer.id) || null : null,
                teamBFallbackForm,
            );
            const teamAPlayerCards = teamAPlayersForRole
                .map((player: any, index: number) => {
                    const fallbackForm =
                        index === 0 && teamAFallbackForm
                            ? teamAFallbackForm
                            : canonicalMatch.teamAId
                              ? buildFallbackPlayerForm(player, canonicalMatch.teamAId, recentTeamAMatches)
                              : null;
                    return buildPlayerCard(
                        player,
                        player?.id ? snapshotMap.get(player.id) || null : null,
                        player?.id ? rankMap.get(player.id) || null : null,
                        fallbackForm,
                    );
                })
                .filter(Boolean) as PreMatchAnalysisPlayerCard[];
            const teamBPlayerCards = teamBPlayersForRole
                .map((player: any, index: number) => {
                    const fallbackForm =
                        index === 0 && teamBFallbackForm
                            ? teamBFallbackForm
                            : canonicalMatch.teamBId
                              ? buildFallbackPlayerForm(player, canonicalMatch.teamBId, recentTeamBMatches)
                              : null;
                    return buildPlayerCard(
                        player,
                        player?.id ? snapshotMap.get(player.id) || null : null,
                        player?.id ? rankMap.get(player.id) || null : null,
                        fallbackForm,
                    );
                })
                .filter(Boolean) as PreMatchAnalysisPlayerCard[];
            const matchupEdge = buildMatchupEdgeText(
                teamAPlayerCard,
                teamBPlayerCard,
                getTeamShortDisplayName(canonicalMatch.teamA),
                getTeamShortDisplayName(canonicalMatch.teamB),
            );

            return {
                role: formatRoleLabel(role),
                teamAPlayer: teamAPlayerCard,
                teamBPlayer: teamBPlayerCard,
                teamAPlayers: teamAPlayerCards,
                teamBPlayers: teamBPlayerCards,
                edgeText: matchupEdge.edgeText,
                edgeValue: matchupEdge.edgeValue,
                edgeMetricLabel: matchupEdge.edgeMetricLabel,
            };
        });

        const teamARecentSummary = buildRecentSummary(recentTeamAMatches, canonicalMatch.teamAId);
        const teamBRecentSummary = buildRecentSummary(recentTeamBMatches, canonicalMatch.teamBId);
        const teamATrends = buildTrendPoints(recentTeamAMatches, canonicalMatch.teamAId, getTeamShortDisplayName(canonicalMatch.teamA));
        const teamBTrends = buildTrendPoints(recentTeamBMatches, canonicalMatch.teamBId, getTeamShortDisplayName(canonicalMatch.teamB));
        const teamARankSummary = buildTeamRankSummary(teamALineupPlayers.map((player: any) => rankMap.get(player.id) || null));
        const teamBRankSummary = buildTeamRankSummary(teamBLineupPlayers.map((player: any) => rankMap.get(player.id) || null));
        const bpInsights = buildBpInsights(canonicalMatch, getTeamShortDisplayName(canonicalMatch.teamA), getTeamShortDisplayName(canonicalMatch.teamB));

        const headToHeadEntries: PreMatchAnalysisHeadToHeadEntry[] = headToHeadMatches.map((headMatch: any) => {
            const hasResult = matchHasResolvedSeries(headMatch);
            const { scoreA, scoreB } = getSeriesScore(headMatch, canonicalMatch.teamAId!, canonicalMatch.teamBId!);
            const completedGames = getCompletedSeriesGames(headMatch?.format, headMatch?.games || []);
            let totalDuration = 0;
            let durationSamples = 0;
            let teamAKills = 0;
            let teamBKills = 0;
            let hasTeamAKills = false;
            let hasTeamBKills = false;
            const gameEntries: PreMatchAnalysisHeadToHeadEntry['games'] = completedGames.map((game: any) => {
                const duration = toNullableNumber(game?.duration);
                const left = getTeamGameNumbers(game, canonicalMatch.teamAId!);
                const right = getTeamGameNumbers(game, canonicalMatch.teamBId!);
                const blueId = String(game?.blueSideTeamId || '');
                const redId = String(game?.redSideTeamId || '');
                const blueTenMinKills = toNullableNumber(game?.blueTenMinKills);
                const redTenMinKills = toNullableNumber(game?.redTenMinKills);
                return {
                    gameNumber: Number(game?.gameNumber || 0) || 0,
                    winnerSide:
                        game?.winnerId === canonicalMatch.teamAId
                            ? 'A'
                            : game?.winnerId === canonicalMatch.teamBId
                              ? 'B'
                              : 'NONE',
                    mapSideWin:
                        game?.winnerId && String(game?.winnerId) === blueId
                            ? 'BLUE'
                            : game?.winnerId && String(game?.winnerId) === redId
                              ? 'RED'
                              : 'NONE',
                    teamASide:
                        blueId && blueId === String(canonicalMatch.teamAId || '')
                            ? 'BLUE'
                            : redId && redId === String(canonicalMatch.teamAId || '')
                              ? 'RED'
                              : 'NONE',
                    teamBSide:
                        blueId && blueId === String(canonicalMatch.teamBId || '')
                            ? 'BLUE'
                            : redId && redId === String(canonicalMatch.teamBId || '')
                              ? 'RED'
                              : 'NONE',
                    teamAKills: left.kills,
                    teamBKills: right.kills,
                    teamATenMinKills:
                        blueId && blueId === String(canonicalMatch.teamAId || '')
                            ? blueTenMinKills
                            : redId && redId === String(canonicalMatch.teamAId || '')
                              ? redTenMinKills
                              : null,
                    teamBTenMinKills:
                        blueId && blueId === String(canonicalMatch.teamBId || '')
                            ? blueTenMinKills
                            : redId && redId === String(canonicalMatch.teamBId || '')
                              ? redTenMinKills
                              : null,
                    totalKills:
                        left.kills !== null || right.kills !== null
                            ? (left.kills ?? 0) + (right.kills ?? 0)
                            : null,
                    durationLabel:
                        duration === null
                            ? '--'
                            : `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`,
                };
            });

            for (const game of completedGames) {
                const duration = toNullableNumber(game?.duration);
                if (duration !== null) {
                    totalDuration += duration;
                    durationSamples += 1;
                }

                const left = getTeamGameNumbers(game, canonicalMatch.teamAId!);
                const right = getTeamGameNumbers(game, canonicalMatch.teamBId!);
                if (left.kills !== null) {
                    teamAKills += left.kills;
                    hasTeamAKills = true;
                }
                if (right.kills !== null) {
                    teamBKills += right.kills;
                    hasTeamBKills = true;
                }
            }

            const avgDurationSeconds = durationSamples > 0 ? Math.round(totalDuration / durationSamples) : null;
            return {
                id: headMatch.id,
                startTime: headMatch.startTime ? new Date(headMatch.startTime).toISOString() : null,
                tournament: String(headMatch.tournament || '未知赛事'),
                stage: String(headMatch.stage || '--'),
                scoreA: hasResult ? scoreA : null,
                scoreB: hasResult ? scoreB : null,
                winnerSide:
                    headMatch.winnerId === canonicalMatch.teamAId
                        ? 'A'
                        : headMatch.winnerId === canonicalMatch.teamBId
                          ? 'B'
                          : 'NONE',
                hasResult,
                statusLabel: buildHeadToHeadStatusLabel(headMatch, hasResult),
                teamAKills: hasTeamAKills ? teamAKills : null,
                teamBKills: hasTeamBKills ? teamBKills : null,
                totalKills: hasTeamAKills || hasTeamBKills ? teamAKills + teamBKills : null,
                avgDurationLabel:
                    avgDurationSeconds === null
                        ? '--'
                        : `${Math.floor(avgDurationSeconds / 60)}:${String(avgDurationSeconds % 60).padStart(2, '0')}`,
                games: gameEntries,
            };
        });

        const teamAInfo = buildAnalysisTeamInfo(canonicalMatch.teamA);
        const teamBInfo = buildAnalysisTeamInfo(canonicalMatch.teamB);

        const preMatchAnalysis: PreMatchAnalysisData = {
            teamA: teamAInfo,
            teamB: teamBInfo,
            summary: buildSummaryText({
                teamA: teamAInfo,
                teamB: teamBInfo,
                teamARecent: teamARecentSummary,
                teamBRecent: teamBRecentSummary,
                headToHead: headToHeadEntries,
                teamARank: teamARankSummary,
                teamBRank: teamBRankSummary,
                matchups: matchups.map((item) => ({ role: item.role, edgeValue: item.edgeValue })),
                bpReady: bpInsights.totalGames > 0,
            }),
            recent: {
                teamA: teamARecentSummary,
                teamB: teamBRecentSummary,
                headToHead: headToHeadEntries,
                teamATrends,
                teamBTrends,
            },
            matchups,
            rank: {
                teamA: teamARankSummary,
                teamB: teamBRankSummary,
            },
            bp: {
                ready: Boolean(canonicalMatch.bpSourceMatchId && bpInsights.totalGames > 0),
                sourceMatchId: canonicalMatch.bpSourceMatchId || null,
                note: canonicalMatch.bpSourceMatchId
                    ? bpInsights.totalGames > 0
                        ? '当前已经从绑定的 BP 源比赛里提取出每局英雄，下面优先展示常见英雄和每局 Pick 走向。'
                        : '当前比赛已经绑定 BP 源比赛，但本地还没有拿到可渲染的英雄明细，等同步补齐后这里会自动变完整。'
                    : '当前还没有绑定稳定 BP 明细来源，所以这次先把赛前分析主体接好，后面再把 BP 数据并入这一块。',
                totalGames: bpInsights.totalGames,
                teamAHighlights: bpInsights.teamAHighlights,
                teamBHighlights: bpInsights.teamBHighlights,
                games: bpInsights.games,
            },
        };

        serializedPreMatchAnalysis = JSON.parse(JSON.stringify(preMatchAnalysis));
    }

    const initialGameNumber = gameNumber ? parseInt(Array.isArray(gameNumber) ? gameNumber[0] : gameNumber, 10) : undefined;

    return (
        <div className="min-h-screen">
            <Suspense
                fallback={
                    <div className="flex flex-col items-center justify-center gap-4 p-20">
                        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                        <div className="animate-pulse text-xs font-bold tracking-widest text-gray-400">比赛数据加载中...</div>
                    </div>
                }
            >
                <MatchDetailClient
                    match={serializedMatch}
                    initialGameNumber={initialGameNumber}
                    teamAStats={teamAStats}
                    teamBStats={teamBStats}
                    preMatchAnalysis={serializedPreMatchAnalysis}
                    recentManualReviews={recentManualReviewsByTeam}
                    manualReviews={serializedMatch.manualReviews || []}
                />
            </Suspense>
        </div>
    );
}
