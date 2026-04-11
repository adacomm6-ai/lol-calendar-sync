import { prisma } from './db';
import { unstable_cache } from 'next/cache';
import { calculateRecentSeriesAverages } from './recent-series-stats';
import { sortByStartTimeDesc, toEpochMs } from './time-utils';
import { buildCanonicalTeamIndex, canonicalizeMatchTeams, getRelatedTeamIds } from './team-canonical';

const cacheScope = `${process.env.APP_DB_TARGET || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev')}:${process.env.DATABASE_URL || 'no-db-url'}`;
const scopedKey = (base: string) => [base, cacheScope];

export const getCachedTeamsForCanonicalization = unstable_cache(
    async () => {
        return prisma.team.findMany({
            select: {
                id: true,
                name: true,
                shortName: true,
                region: true,
                logo: true,
            },
        });
    },
    scopedKey('all-teams-canonical-input-v1'),
    { revalidate: 60, tags: ['teams'] },
);

const OTHER_REGION_ID = 'OTHER';
const LEGACY_OTHER_REGION_IDS = ['其它赛区', '其他赛区', 'OTHER'];
const OTHER_TOURNAMENT_KEYWORDS = ['OTHER', 'LEC', 'LCS', 'LTA', 'CBLOL', 'LJL', 'LLA', 'LCP', 'PCS', 'VCS', 'TCL'];
const WORLD_TOURNAMENT_KEYWORDS_UPPER = ['MSI', 'WORLD', 'WORLDS', 'ALL-STAR'];
const WORLD_TOURNAMENT_KEYWORDS_RAW = ['世界赛', '全球先锋赛', '全球总决赛'];

function looksLikeCupStyleCompetition(value: string | null | undefined) {
    const text = String(value || '').trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    return text.includes('\u676f') || lower.includes('cup');
}

function isInRangeByMs(value: unknown, startMs: number | null, endMsExclusive: number | null) {
    if (startMs === null && endMsExclusive === null) return true;
    const time = toEpochMs(value);
    if (time === null) return true;
    if (startMs !== null && time < startMs) return false;
    if (endMsExclusive !== null && time >= endMsExclusive) return false;
    return true;
}

function isOtherRegionValue(value: string) {
    const text = String(value || '').trim();
    const upper = text.toUpperCase();
    return LEGACY_OTHER_REGION_IDS.includes(text) || upper.includes('OTHER');
}

function isWorldRegionValue(value: string) {
    const text = String(value || '').trim();
    const upper = text.toUpperCase();
    return text.includes('世界赛') || text.includes('全球先锋赛') || upper === 'WORLDS' || upper === 'WORLD' || upper === 'INTERNATIONAL';
}

function normalizeScheduleKeyword(value: string | null | undefined) {
    return String(value || '')
        .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s\-_()/]+/g, '');
}

const CLEAN_OTHER_REGION_IDS = ['其它赛区', '其他赛区', 'OTHER'];
const CLEAN_WORLD_KEYWORDS_RAW = ['世界赛', '全球先锋赛', '全球总决赛'];
const CLEAN_EXCLUDE_STAGE_KEYWORDS = ['Playoffs', '季后赛', '淘汰赛', 'Bracket', 'Grand Final', 'Semifinal', 'Upper', 'Lower']
    .map((value) => normalizeScheduleKeyword(value))
    .filter(Boolean);

function isOtherRegionValueSafe(value: string) {
    const text = String(value || '').trim();
    const upper = text.toUpperCase();
    return CLEAN_OTHER_REGION_IDS.includes(text) || upper.includes('OTHER');
}

function isWorldRegionValueSafe(value: string) {
    const text = String(value || '').trim();
    const upper = text.toUpperCase();
    return (
        text.includes('世界赛') ||
        text.includes('全球先锋赛') ||
        text.includes('全球总决赛') ||
        upper === 'WORLDS' ||
        upper === 'WORLD' ||
        upper === 'INTERNATIONAL'
    );
}

function isGenericFirstStageSplitSafe(
    split: { id?: string | null; name?: string | null; mapping?: string | null; type?: string | null } | null | undefined,
) {
    if (!split) return false;
    const sourceText = `${split.id || ''} ${split.name || ''} ${split.mapping || ''}`;
    const sourceLower = sourceText.toLowerCase();
    const isFirstStage = sourceLower.includes('split 1') || sourceText.includes('第一赛段');
    const isPlayoffStage =
        split.type === 'playoff' ||
        sourceLower.includes('playoff') ||
        sourceText.includes('季后赛') ||
        sourceText.includes('淘汰赛');
    return isFirstStage && !isPlayoffStage;
}

function matchIsWorldLikeSafe(match: {
    tournament?: string | null;
    stage?: string | null;
    teamA?: { region?: string | null } | null;
    teamB?: { region?: string | null } | null;
}) {
    const text = `${match.tournament || ''} ${match.stage || ''}`;
    const upper = text.toUpperCase();

    const keywordHit =
        WORLD_TOURNAMENT_KEYWORDS_UPPER.some((k) => upper.includes(k)) ||
        CLEAN_WORLD_KEYWORDS_RAW.some((k) => text.includes(k));

    if (keywordHit) return true;

    const teamARegion = String(match.teamA?.region || '').toUpperCase();
    const teamBRegion = String(match.teamB?.region || '').toUpperCase();
    return (
        teamARegion.includes('WORLD') ||
        teamBRegion.includes('WORLD') ||
        teamARegion.includes('WORLDS') ||
        teamBRegion.includes('WORLDS')
    );
}

function buildSplitKeywordSet(
    split: { id?: string | null; name?: string | null; mapping?: string | null } | null | undefined,
    fallback?: string | null,
) {
    return Array.from(
        new Set(
            [split?.id, split?.name, split?.mapping, fallback]
                .map((value) => String(value || '').trim())
                .filter(Boolean),
        ),
    );
}

function splitAppliesToRegion(
    split: { regions?: string[] | null } | null | undefined,
    regionNorm: string,
) {
    const regions = (split?.regions || []).map((value) => String(value || '').trim()).filter(Boolean);
    if (regions.length === 0) return true;
    if (isWorldRegionValueSafe(regionNorm)) return regions.some((value) => isWorldRegionValueSafe(value));
    if (isOtherRegionValueSafe(regionNorm)) return regions.some((value) => isOtherRegionValueSafe(value));
    return regions.some((value) => value.toUpperCase() === regionNorm.toUpperCase());
}

function isGenericFirstStageSplit(
    split: { id?: string | null; name?: string | null; mapping?: string | null; type?: string | null } | null | undefined,
) {
    if (!split) return false;
    const sourceText = `${split.id || ''} ${split.name || ''} ${split.mapping || ''}`;
    const sourceLower = sourceText.toLowerCase();
    const isFirstStage = sourceLower.includes('split 1') || sourceText.includes('第一赛段');
    const isPlayoffStage =
        split.type === 'playoff' ||
        sourceLower.includes('playoff') ||
        sourceText.includes('季后赛') ||
        sourceText.includes('淘汰赛');
    return isFirstStage && !isPlayoffStage;
}

function matchIsWorldLike(match: {
    tournament?: string | null;
    stage?: string | null;
    teamA?: { region?: string | null } | null;
    teamB?: { region?: string | null } | null;
}) {
    const text = `${match.tournament || ''} ${match.stage || ''}`;
    const upper = text.toUpperCase();

    const keywordHit =
        WORLD_TOURNAMENT_KEYWORDS_UPPER.some((k) => upper.includes(k)) ||
        WORLD_TOURNAMENT_KEYWORDS_RAW.some((k) => text.includes(k));

    if (keywordHit) return true;

    const teamARegion = String(match.teamA?.region || '').toUpperCase();
    const teamBRegion = String(match.teamB?.region || '').toUpperCase();
    return (
        teamARegion.includes('WORLD') ||
        teamBRegion.includes('WORLD') ||
        teamARegion.includes('WORLDS') ||
        teamBRegion.includes('WORLDS')
    );
}

function matchBelongsToScheduleRegion(
    match: {
        tournament?: string | null;
        stage?: string | null;
        teamA?: { region?: string | null } | null;
        teamB?: { region?: string | null } | null;
    },
    regionNorm: string,
) {
    const tournamentText = String(match.tournament || '');
    const stageText = String(match.stage || '');
    const combinedText = `${tournamentText} ${stageText}`;
    const combinedUpper = combinedText.toUpperCase();
    const teamARegion = String(match.teamA?.region || '');
    const teamBRegion = String(match.teamB?.region || '');

    if (isWorldRegionValueSafe(regionNorm)) {
        return matchIsWorldLikeSafe(match);
    }

    if (regionNorm === 'LPL') {
        return teamARegion.includes('LPL') || teamBRegion.includes('LPL') || combinedUpper.includes('LPL');
    }

    if (regionNorm === 'LCK') {
        return teamARegion.includes('LCK') || teamBRegion.includes('LCK') || combinedUpper.includes('LCK');
    }

    if (isOtherRegionValueSafe(regionNorm)) {
        if (matchIsWorldLikeSafe(match)) return false;
        return (
            isOtherRegionValueSafe(teamARegion) ||
            isOtherRegionValueSafe(teamBRegion) ||
            OTHER_TOURNAMENT_KEYWORDS.some((keyword) => combinedUpper.includes(keyword.toUpperCase()))
        );
    }

    return teamARegion.includes(regionNorm) || teamBRegion.includes(regionNorm) || combinedUpper.includes(regionNorm.toUpperCase());
}

// Cache Teams (Sidebar/List) - Revalidate 60s
export const getCachedTeams = unstable_cache(
    async () => {
        const teams = await prisma.team.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                shortName: true,
                region: true,
                logo: true,
            },
        });

        const canonicalIndex = buildCanonicalTeamIndex(teams);
        return canonicalIndex.canonicalTeams.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
    },
    scopedKey('all-teams-v5'),
    { revalidate: 60, tags: ['teams'] },
);

// Cache Active Matches (Schedule/Home) - Revalidate 60s
export const getCachedMatches = unstable_cache(
    async () => {
        return await prisma.match.findMany({
            orderBy: { startTime: 'asc' },
            where: {
                startTime: {
                    gte: new Date(new Date().getFullYear(), 0, 1),
                },
            },
            include: {
                teamA: {
                    include: { teamComments: { orderBy: { createdAt: 'desc' }, take: 1 } },
                },
                teamB: {
                    include: { teamComments: { orderBy: { createdAt: 'desc' }, take: 1 } },
                },
                games: true,
                comments: true,
            },
        });
    },
    scopedKey('all-matches'),
    { revalidate: 60, tags: ['matches'] },
);

// Cache Upcoming Matches (Home Page Light) - Revalidate 60s
export const getCachedUpcomingMatches = unstable_cache(
    async () => {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        const nextTwoWeeks = new Date(now);
        nextTwoWeeks.setDate(nextTwoWeeks.getDate() + 14);

        const [matches, teams] = await Promise.all([
            prisma.match.findMany({
                where: {
                    startTime: {
                        gte: yesterday,
                        lte: nextTwoWeeks,
                    },
                },
                orderBy: { startTime: 'asc' },
                include: {
                    teamA: {
                        include: { teamComments: { orderBy: { createdAt: 'desc' }, take: 1 } },
                    },
                    teamB: {
                        include: { teamComments: { orderBy: { createdAt: 'desc' }, take: 1 } },
                    },
                },
            }),
            getCachedTeamsForCanonicalization(),
        ]);

        const canonicalIndex = buildCanonicalTeamIndex(teams);
        return matches.map((match) => canonicalizeMatchTeams(match, canonicalIndex));
    },
    scopedKey('upcoming-matches-light-v2'),
    { revalidate: 60, tags: ['matches'] },
);

// Home page needs the freshest future schedule in production. Avoid unstable_cache here.
export async function getCachedHomeRecentMatches() {
    const now = new Date();
    const ongoingWindow = new Date(now);
    ongoingWindow.setDate(ongoingWindow.getDate() - 1);
    const futureWindow = new Date(now);
    futureWindow.setDate(futureWindow.getDate() + 90);

    const [matches, teams] = await Promise.all([
        prisma.match.findMany({
            where: {
                startTime: {
                    gte: ongoingWindow,
                    lte: futureWindow,
                },
            },
            orderBy: { startTime: 'asc' },
            take: 240,
            include: {
                teamA: {
                    select: { id: true, name: true, shortName: true, logo: true, region: true },
                },
                teamB: {
                    select: { id: true, name: true, shortName: true, logo: true, region: true },
                },
                games: {
                    select: {
                        winnerId: true,
                        blueSideTeamId: true,
                        redSideTeamId: true,
                    },
                },
            },
        }),
        getCachedTeamsForCanonicalization(),
    ]);

    const canonicalIndex = buildCanonicalTeamIndex(teams);
    return matches.map((match) => canonicalizeMatchTeams(match, canonicalIndex));
}

// Helper for Standings (Light payload to avoid cache-size/runtime issues)
export async function getCachedStandingsData(region: string, year: string, split: string) {
    const config = await import('./config-service').then((m) => m.getSystemConfig());
    const splitConfig = config.splits.find((s) => s.id === split);

    const splitKeywords = Array.from(
        new Set(
            [split, splitConfig?.name, splitConfig?.mapping]
                .filter((v): v is string => !!v && v.trim().length > 0)
                .map((v) => v.trim()),
        ),
    );
    let rangeStartMs: number | null = null;
    let rangeEndMs: number | null = null;
    const y = Number.parseInt(year, 10);
    if (!Number.isNaN(y)) {
        rangeStartMs = new Date(`${y}-01-01T00:00:00.000Z`).getTime();
        rangeEndMs = new Date(`${y + 1}-01-01T00:00:00.000Z`).getTime();
    }

    const isOtherRegion = isOtherRegionValue(region);
    const isWorldRegion = isWorldRegionValue(region);

    const regionFilter: any = isWorldRegion
        ? {}
        : isOtherRegion
          ? {
                OR: [
                    { teamA: { region: { contains: OTHER_REGION_ID } } },
                    { teamB: { region: { contains: OTHER_REGION_ID } } },
                    { teamA: { region: { contains: '其它赛区' } } },
                    { teamB: { region: { contains: '其它赛区' } } },
                    ...OTHER_TOURNAMENT_KEYWORDS.map((keyword) => ({ tournament: { contains: keyword } })),
                ],
            }
          : {
                OR: [
                    { teamA: { region: { contains: region } } },
                    { teamB: { region: { contains: region } } },
                    { tournament: { contains: region } },
                ],
            };

    const keywordFilter =
        isOtherRegion || isWorldRegion
            ? undefined
            : splitKeywords.length > 0
              ? {
                    OR: splitKeywords.flatMap((k) => [{ tournament: { contains: k } }, { stage: { contains: k } }]),
                }
              : undefined;

    const andClauses: any[] = [regionFilter];
    if (keywordFilter) andClauses.push(keywordFilter);

    const matches = await prisma.match.findMany({
        where: {
            status: 'FINISHED',
            AND: andClauses,
        },
        select: {
            id: true,
            teamAId: true,
            teamBId: true,
            winnerId: true,
            status: true,
            stage: true,
            startTime: true,
            tournament: true,
            teamA: {
                select: {
                    id: true,
                    name: true,
                    shortName: true,
                    logo: true,
                    region: true,
                },
            },
            teamB: {
                select: {
                    id: true,
                    name: true,
                    shortName: true,
                    logo: true,
                    region: true,
                },
            },
            games: {
                select: {
                    winnerId: true,
                },
            },
        },
        orderBy: { startTime: 'asc' },
    });

    const dateFiltered = matches.filter((m) => isInRangeByMs(m.startTime, rangeStartMs, rangeEndMs));

    if (!isWorldRegion) {
        return dateFiltered;
    }

    return dateFiltered.filter((m) => matchIsWorldLike(m));
}

// Cache Global Stats (Home)
export const getCachedGlobalStats = unstable_cache(
    async () => {
        const [teamCount, matchCount] = await Promise.all([prisma.team.count(), prisma.match.count()]);
        return { teamCount, matchCount };
    },
    scopedKey('global-stats-v2'),
    { revalidate: 60, tags: ['stats'] },
);

// Cache Match Detail - Revalidate 30s (Comments update often)
export const getCachedMatchDetail = unstable_cache(
    async (matchId: string) => {
        return await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                teamA: { include: { players: true, teamComments: { orderBy: { createdAt: 'desc' }, take: 1 } } },
                teamB: { include: { players: true, teamComments: { orderBy: { createdAt: 'desc' }, take: 1 } } },
                games: { orderBy: { gameNumber: 'asc' } },
                odds: true,
                comments: { orderBy: { createdAt: 'desc' } },
            },
        });
    },
    scopedKey('match-detail'),
    { revalidate: 30, tags: ['match'] },
);

// Cache Player Profile - Revalidate 60s
export const getCachedPlayerProfile = unstable_cache(
    async (playerId: string) => {
        return await prisma.player.findUnique({
            where: { id: playerId },
            include: {
                team: true,
            },
        });
    },
    scopedKey('player-profile-v2'),
    { revalidate: 60, tags: ['player'] },
);

// Cache Player Match History (Expensive)
export const getCachedPlayerMatches = unstable_cache(
    async (teamId: string) => {
        const matches = await prisma.match.findMany({
            where: {
                OR: [{ teamAId: teamId }, { teamBId: teamId }],
                status: 'FINISHED',
            },
            include: {
                teamA: true,
                teamB: true,
                games: true,
            },
        });
        return sortByStartTimeDesc(matches);
    },
    scopedKey('team-matches-v3'),
    { revalidate: 60, tags: ['matches'] },
);

// Cache Recent Stats for a Team (Used in Match Detail)
export const getCachedRecentStats = unstable_cache(
    async (teamId: string, count: number = 2) => {
        const teams = await getCachedTeamsForCanonicalization();
        const canonicalIndex = buildCanonicalTeamIndex(teams);
        const relatedTeamIds = getRelatedTeamIds(teamId, canonicalIndex);
        const candidateMatches = await prisma.match.findMany({
            where: {
                OR: relatedTeamIds.flatMap((relatedId) => [{ teamAId: relatedId }, { teamBId: relatedId }]),
                status: 'FINISHED',
                format: { in: ['BO3', 'BO5'] },
            },
            include: {
                games: true,
                teamA: true,
                teamB: true,
            },
        });

        const recentMatches = sortByStartTimeDesc(
            candidateMatches.map((match) => canonicalizeMatchTeams(match, canonicalIndex)),
        ).slice(0, count);

        if (recentMatches.length === 0) return { duration: null, kills: null, tenMinKills: null, matches: [] };

        const stats = calculateRecentSeriesAverages(recentMatches);

        return {
            duration: stats.duration,
            kills: stats.kills,
            tenMinKills: stats.tenMinKills,
            matches: stats.matches as any[],
        };
    },
    scopedKey('team-recent-stats-v5'),
    { revalidate: 60, tags: ['stats', 'matches'] },
);

// Cache Schedule/Filtered Matches
export const getCachedScheduleMatches = unstable_cache(
    async (region: string, year: string, stage: string) => {
        const config = await import('./config-service').then((m) => m.getSystemConfig());
        const regionNorm = (region || '').trim();
        const isWorldRegion = isWorldRegionValueSafe(regionNorm);
        let rangeStartMs: number | null = null;
        let rangeEndMs: number | null = null;
        const y = parseInt(year, 10);
        if (!Number.isNaN(y)) {
            rangeStartMs = new Date(`${y}-01-01T00:00:00.000Z`).getTime();
            rangeEndMs = new Date(`${y + 1}-01-01T00:00:00.000Z`).getTime();
        }

        const splitConfig = config.splits.find((s) => s.id === stage);
        const isCupStyleStage =
            looksLikeCupStyleCompetition(splitConfig?.id) ||
            looksLikeCupStyleCompetition(splitConfig?.name) ||
            looksLikeCupStyleCompetition(splitConfig?.mapping) ||
            looksLikeCupStyleCompetition(stage);
        const isGenericSplitOne = isGenericFirstStageSplitSafe(splitConfig);
        const ownKeywords = buildSplitKeywordSet(splitConfig, stage)
            .map((value) => normalizeScheduleKeyword(value))
            .filter(Boolean);
        const shouldRequireOwnKeyword = !isWorldRegion && !isGenericSplitOne;
        const siblingExplicitKeywords = config.splits
            .filter((candidate) => candidate.id !== splitConfig?.id)
            .filter((candidate) => splitAppliesToRegion(candidate, regionNorm))
            .filter((candidate) => !isGenericFirstStageSplitSafe(candidate))
            .flatMap((candidate) => buildSplitKeywordSet(candidate))
            .map((value) => normalizeScheduleKeyword(value))
            .filter(Boolean);
        const excludeStageKeywords = isCupStyleStage || isGenericSplitOne || isWorldRegion
            ? []
            : ['Playoffs', '季后赛', '淘汰赛', 'Bracket', 'Grand Final', 'Semifinal', 'Upper', 'Lower']
                  .map((value) => normalizeScheduleKeyword(value))
                  .filter(Boolean);

        const [matches, teams] = await Promise.all([
            prisma.match.findMany({
                select: {
                    id: true,
                    teamAId: true,
                    teamBId: true,
                    winnerId: true,
                    status: true,
                    format: true,
                    stage: true,
                    tournament: true,
                    startTime: true,
                    teamA: {
                        select: {
                            id: true,
                            name: true,
                            shortName: true,
                            logo: true,
                            region: true,
                        },
                    },
                    teamB: {
                        select: {
                            id: true,
                            name: true,
                            shortName: true,
                            logo: true,
                            region: true,
                        },
                    },
                    games: {
                        select: {
                            id: true,
                            winnerId: true,
                            blueSideTeamId: true,
                            redSideTeamId: true,
                        },
                    },
                },
                orderBy: { startTime: 'asc' },
            }),
            getCachedTeamsForCanonicalization(),
        ]);

        const canonicalIndex = buildCanonicalTeamIndex(teams);
        const canonicalMatches = matches.map((match) => canonicalizeMatchTeams(match, canonicalIndex));

        const regionFiltered = canonicalMatches.filter((m) => matchBelongsToScheduleRegion(m, regionNorm));

        const stageFiltered = regionFiltered.filter((m) => {
            const text = normalizeScheduleKeyword(`${m.tournament || ''} ${m.stage || ''}`);
            if (shouldRequireOwnKeyword && ownKeywords.length > 0 && !ownKeywords.some((keyword) => text.includes(keyword))) {
                return false;
            }
            if (isGenericSplitOne && siblingExplicitKeywords.some((keyword) => text.includes(keyword))) {
                return false;
            }
            if (excludeStageKeywords.some((keyword) => text.includes(keyword))) {
                return false;
            }
            return true;
        });

        const dateFiltered = stageFiltered.filter((m) => isInRangeByMs(m.startTime, rangeStartMs, rangeEndMs));

        if (isWorldRegion) {
            return dateFiltered.filter((m) => matchIsWorldLikeSafe(m));
        }

        return dateFiltered.filter((m) => !matchIsWorldLikeSafe(m));
    },
    scopedKey('schedule-matches-v13'),
    { revalidate: 10, tags: ['schedule', 'matches'] },
);






