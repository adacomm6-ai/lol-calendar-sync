import { addDays } from 'date-fns';
import Link from 'next/link';

import { formatBeijingTime } from '@/lib/date-utils';
import { getSystemConfig } from '@/lib/config-service';
import { getCachedScheduleMatches, getCachedTeamsForCanonicalization } from '@/lib/data-cache';
import { comparePreferredEventCandidates } from '@/lib/event-defaults';
import { getTeamShortDisplayName } from '@/lib/team-display';
import {
    buildCanonicalTeamIndex,
    canonicalizeMatchTeams,
    getCanonicalTeam,
    getCanonicalTeamByIdentity,
    pickPreferredCanonicalTeam,
} from '@/lib/team-canonical';
import PlayoffBracketView from '@/components/schedule/PlayoffBracketView';
import CalendarExportActions from '@/components/schedule/CalendarExportActions';
import TeamLogo from '@/components/TeamLogo';

export const dynamic = 'force-dynamic';

type MatchWithTeams = Awaited<ReturnType<typeof getCachedScheduleMatches>>[number] & {
    games: any[];
    stageLabel?: string;
};

type TeamRecord = {
    id: string;
    name?: string | null;
    shortName?: string | null;
    logo?: string | null;
    region?: string | null;
};

type StagePreferenceSummary = {
    normalizedStageId: string;
    label: string;
    totalCount: number;
    latestTimestampMs: number;
    hasUpcoming: boolean;
};

function toStartMs(input: Date | string | null | undefined): number | null {
    if (!input) return null;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d.getTime();
}

function toBeijingDateKey(input: Date | string | null | undefined): string | null {
    const ms = toStartMs(input);
    if (ms === null) return null;
    const beijing = new Date(ms + 8 * 60 * 60 * 1000);
    return beijing.toISOString().slice(0, 10);
}

function buildScheduleDedupGroupKey(match: MatchWithTeams) {
    const dayKey = toBeijingDateKey(match.startTime || null);
    const teamA = String(match.teamAId || '').trim();
    const teamB = String(match.teamBId || '').trim();
    if (!dayKey || !teamA || !teamB) return null;
    const pair = [teamA, teamB].sort().join('__');
    const fmt = String(match.format || '').toUpperCase() || 'BO3';
    return `${dayKey}__${fmt}__${pair}`;
}

function scoreMatchForDedup(match: MatchWithTeams) {
    let score = 0;
    const status = String(match.status || '').toUpperCase();
    if (status === 'FINISHED' || status === 'COMPLETED') score += 40;
    if (match.winnerId) score += 10;
    if ((match.games || []).length > 0) score += 20;
    if (String((match as any).externalMatchId || '').trim()) score += 8;
    if (String(match.stage || '').trim()) score += 2;
    return score;
}

function pickBestMatchFromCluster(items: MatchWithTeams[]) {
    return [...items].sort((a, b) => {
        const scoreDiff = scoreMatchForDedup(b) - scoreMatchForDedup(a);
        if (scoreDiff !== 0) return scoreDiff;
        const aTime = toStartMs(a.startTime) ?? 0;
        const bTime = toStartMs(b.startTime) ?? 0;
        if (aTime !== bTime) return bTime - aTime;
        return String(a.id || '').localeCompare(String(b.id || ''));
    })[0];
}

function dedupeScheduleMatches(matches: MatchWithTeams[]) {
    const grouped = new Map<string, MatchWithTeams[]>();
    const passthrough: MatchWithTeams[] = [];

    for (const match of matches) {
        const key = buildScheduleDedupGroupKey(match);
        if (!key) {
            passthrough.push(match);
            continue;
        }
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(match);
    }

    const kept: MatchWithTeams[] = [];

    for (const list of grouped.values()) {
        if (list.length === 1) {
            kept.push(list[0]);
            continue;
        }

        const sorted = [...list].sort((a, b) => {
            const aMs = toStartMs(a.startTime) ?? Number.MAX_SAFE_INTEGER;
            const bMs = toStartMs(b.startTime) ?? Number.MAX_SAFE_INTEGER;
            return aMs - bMs;
        });

        let cluster: MatchWithTeams[] = [];
        let clusterStartMs: number | null = null;

        for (const item of sorted) {
            const ms = toStartMs(item.startTime);
            if (ms === null) {
                kept.push(item);
                continue;
            }

            if (cluster.length === 0) {
                cluster = [item];
                clusterStartMs = ms;
                continue;
            }

            // 3 ??????????????
            if (clusterStartMs !== null && ms - clusterStartMs <= 3 * 60 * 60 * 1000) {
                cluster.push(item);
                continue;
            }

            kept.push(pickBestMatchFromCluster(cluster));
            cluster = [item];
            clusterStartMs = ms;
        }

        if (cluster.length > 0) {
            kept.push(pickBestMatchFromCluster(cluster));
        }
    }

    return [...kept, ...passthrough].sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
    });
}

function isFirstStagePlayoffsStage(s: { id?: string; name?: string; mapping?: string }) {
    const text = `${s.id || ''} ${s.name || ''} ${s.mapping || ''}`;
    const lower = text.toLowerCase();
    const isFirstStage = lower.includes('split 1') || text.includes('第一赛段');
    const isPlayoffs = lower.includes('playoff') || text.includes('季后赛');
    return isFirstStage && isPlayoffs;
}

function summarizeStagePreference(stageId: string, label: string, matches: MatchWithTeams[]): StagePreferenceSummary {
    const latestTimestampMs = matches.reduce((max, match) => Math.max(max, toStartMs(match.startTime) ?? 0), 0);
    const hasUpcoming = matches.some((match) => {
        if (isFinishedMatchStatus(match.status)) return false;
        const startMs = toStartMs(match.startTime);
        return startMs === null || startMs >= Date.now();
    });

    return {
        normalizedStageId: stageId,
        label,
        totalCount: matches.length,
        latestTimestampMs,
        hasUpcoming,
    };
}

function buildScheduleHref(region: string, year: string, stage: string) {
    const params = new URLSearchParams({ region, year, stage });
    return `/schedule?${params.toString()}`;
}

function buildCalendarHref(region: string, year: string, stage: string) {
    const params = new URLSearchParams({ region, year, stage, status: 'upcoming' });
    return `/api/calendar/ics?${params.toString()}`;
}

function getScheduleSections(matches: MatchWithTeams[], todayStr: string) {
    const upcomingByDate: Record<string, MatchWithTeams[]> = {};
    const recentFinishedByDate: Record<string, MatchWithTeams[]> = {};
    const tbdUpcoming: MatchWithTeams[] = [];

    matches.forEach((match) => {
        const status = String(match.status || '').toUpperCase();
        const isFinished = status === 'FINISHED' || status === 'COMPLETED';

        if (!match.startTime) {
            if (!isFinished) tbdUpcoming.push(match);
            return;
        }

        const dateKey = formatBeijingTime(match.startTime, 'yyyy-MM-dd');
        const bucket = isFinished ? recentFinishedByDate : upcomingByDate;

        if (!bucket[dateKey]) bucket[dateKey] = [];
        bucket[dateKey].push(match);
    });

    const sortByStartTimeAsc = (a: MatchWithTeams, b: MatchWithTeams) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
    };

    const sortByStartTimeDesc = (a: MatchWithTeams, b: MatchWithTeams) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        return bTime - aTime;
    };

    Object.values(upcomingByDate).forEach((items) => items.sort(sortByStartTimeAsc));
    Object.values(recentFinishedByDate).forEach((items) => items.sort(sortByStartTimeDesc));
    tbdUpcoming.sort(sortByStartTimeAsc);

    const upcomingDates = Object.keys(upcomingByDate).sort();
    const recentFinishedDates = Object.keys(recentFinishedByDate).sort((a, b) => b.localeCompare(a));
    const focusDate =
        upcomingDates.find((date) => date >= todayStr) ||
        upcomingDates[0] ||
        recentFinishedDates[0] ||
        null;

    const upcomingCount = upcomingDates.reduce((sum, date) => sum + upcomingByDate[date].length, 0) + tbdUpcoming.length;
    const recentFinishedCount = recentFinishedDates.reduce((sum, date) => sum + recentFinishedByDate[date].length, 0);

    return {
        upcomingByDate,
        recentFinishedByDate,
        tbdUpcoming,
        upcomingDates,
        recentFinishedDates,
        upcomingCount,
        recentFinishedCount,
        hasUpcomingSection: upcomingCount > 0,
        hasRecentSection: recentFinishedCount > 0,
    };
}

function formatDateHeading(date: string, todayStr: string) {
    if (date === todayStr) return '今天';
    return formatBeijingTime(new Date(date), 'MM月dd日 EEEE');
}

function isFinishedMatchStatus(status: string | null | undefined) {
    const upper = String(status || '').toUpperCase();
    return upper === 'FINISHED' || upper === 'COMPLETED';
}

function isOngoingMatch(match: MatchWithTeams, now: Date) {
    if (!match.startTime) return false;
    if (isFinishedMatchStatus(match.status)) return false;
    return new Date(match.startTime) <= now;
}

function resolveDisplayTeam(
    rawTeam: TeamRecord | null | undefined,
    rawTeamId: string | null | undefined,
    teamMap: Map<string, TeamRecord>,
    canonicalIndex: ReturnType<typeof buildCanonicalTeamIndex<TeamRecord>>,
) {
    const seedCandidates: Array<TeamRecord | null> = [
        rawTeamId ? teamMap.get(rawTeamId) || null : null,
        rawTeam?.id ? teamMap.get(rawTeam.id) || null : null,
        rawTeam || null,
    ];

    let preferred: TeamRecord | null = null;

    for (const candidate of seedCandidates) {
        if (!candidate) continue;
        preferred = pickPreferredCanonicalTeam(preferred, candidate as any);
        preferred = pickPreferredCanonicalTeam(
            preferred,
            candidate.id ? (getCanonicalTeam(candidate.id, canonicalIndex as any) as TeamRecord | null) : null,
        );
        preferred = pickPreferredCanonicalTeam(
            preferred,
            getCanonicalTeamByIdentity(candidate as any, canonicalIndex as any, candidate.region) as TeamRecord | null,
        );
    }

    preferred = pickPreferredCanonicalTeam(
        preferred,
        rawTeamId ? (getCanonicalTeam(rawTeamId, canonicalIndex as any) as TeamRecord | null) : null,
    );
    preferred = pickPreferredCanonicalTeam(
        preferred,
        getCanonicalTeamByIdentity(rawTeam as any, canonicalIndex as any, rawTeam?.region) as TeamRecord | null,
    );

    return preferred || rawTeam || (rawTeamId ? teamMap.get(rawTeamId) || null : null) || null;
}

export default async function SchedulePage({
    searchParams,
}: {
    searchParams: Promise<{ region?: string; year?: string; stage?: string }>;
}) {
    const config = await getSystemConfig();
    const resolvedSearchParams = await searchParams;
    const requestedRegion = resolvedSearchParams.region || config.defaultRegion;
    const region = requestedRegion === 'LEC' || requestedRegion === 'MAJOR3' ? 'OTHER' : requestedRegion;
    const year = resolvedSearchParams.year || config.defaultYear;

    const mergedFirstStage =
        config.splits.find(
            (s) =>
                !isFirstStagePlayoffsStage(s) &&
                ((s.id || '').toLowerCase().includes('split 1') ||
                    (s.name || '').includes('第一赛段') ||
                    (s.mapping || '').includes('第一赛段')),
        ) || config.splits.find((s) => s.id === 'Split 1');
    const mergedFirstStageId = mergedFirstStage?.id || config.defaultSplit;

    const normalizeStage = (value: string) => {
        const matched = config.splits.find((s) => s.id === value);
        if (matched && isFirstStagePlayoffsStage(matched)) return mergedFirstStageId;

        const lower = value.toLowerCase();
        const looksLikeFirstPlayoffs =
            (lower.includes('split 1') || value.includes('第一赛段')) &&
            (lower.includes('playoff') || value.includes('季后赛'));
        if (looksLikeFirstPlayoffs) return mergedFirstStageId;

        return value;
    };

    const regions = config.regions
        .map((r) => r.id)
        .filter((id) => id !== 'MAJOR3' && id !== 'LEC');
    const years = config.years;
    const getVisibleStagesForRegion = (targetRegion: string) =>
        config.splits.filter((s) => {
            if (isFirstStagePlayoffsStage(s)) return false;
            if (!s.regions || s.regions.length === 0) return true;
            return s.regions.includes(targetRegion);
        });

    const preferredStageEntries = await Promise.all(
        regions.flatMap((targetRegion) =>
            years.map(async (targetYear) => {
                const visibleStages = getVisibleStagesForRegion(targetRegion);
                const uniqueStageCandidates = Array.from(
                    new Map(
                        visibleStages.map((stageConfig) => [
                            normalizeStage(stageConfig.id),
                            {
                                normalizedStageId: normalizeStage(stageConfig.id),
                                label: stageConfig.name || stageConfig.id,
                            },
                        ]),
                    ).values(),
                );

                const stageSummaries = await Promise.all(
                    uniqueStageCandidates.map(async (candidate) =>
                        summarizeStagePreference(
                            candidate.normalizedStageId,
                            candidate.label,
                            (await getCachedScheduleMatches(targetRegion, targetYear, candidate.normalizedStageId)) as MatchWithTeams[],
                        ),
                    ),
                );

                const preferredStageId =
                    stageSummaries
                        .filter((item) => item.totalCount > 0)
                        .sort((left, right) =>
                            comparePreferredEventCandidates(
                                {
                                    label: left.label,
                                    latestTimestampMs: left.latestTimestampMs,
                                    hasUpcoming: left.hasUpcoming,
                                    totalCount: left.totalCount,
                                },
                                {
                                    label: right.label,
                                    latestTimestampMs: right.latestTimestampMs,
                                    hasUpcoming: right.hasUpcoming,
                                    totalCount: right.totalCount,
                                },
                            ),
                        )[0]?.normalizedStageId ||
                    uniqueStageCandidates[0]?.normalizedStageId ||
                    normalizeStage(config.defaultSplit);

                return [`${targetRegion}::${targetYear}`, preferredStageId] as const;
            }),
        ),
    );

    const preferredStageByRegionYear = Object.fromEntries(preferredStageEntries) as Record<string, string>;
    const rawStage = resolvedSearchParams.stage || preferredStageByRegionYear[`${region}::${year}`] || config.defaultSplit;
    const stage = normalizeStage(rawStage);

    const rawMatches = await getCachedScheduleMatches(region, year, stage);
    const allTeams = await getCachedTeamsForCanonicalization();
    const canonicalIndex = buildCanonicalTeamIndex(allTeams as TeamRecord[]);
    const canonicalMatches = rawMatches.map((match: any) => canonicalizeMatchTeams(match, canonicalIndex));
    const teamMap = new Map(allTeams.map((team) => [team.id, team as TeamRecord]));
    const stageLabelMap = new Map((config.matchStageOptions || []).map((s) => [s.id, s.label || s.id]));

    const displayResolvedMatches = canonicalMatches.map((m: any) => {
        const displayTeamA = resolveDisplayTeam(m.teamA || null, m.teamAId || null, teamMap, canonicalIndex as any);
        const displayTeamB = resolveDisplayTeam(m.teamB || null, m.teamBId || null, teamMap, canonicalIndex as any);

        return {
            ...m,
            teamAId: displayTeamA?.id || m.teamAId || m.teamA?.id || null,
            teamBId: displayTeamB?.id || m.teamBId || m.teamB?.id || null,
            teamA: displayTeamA || m.teamA,
            teamB: displayTeamB || m.teamB,
            stageLabel: stageLabelMap.get(m.stage || '') || m.stage || '',
            games: m.games.map((g: { blueSideTeamId: string | null; redSideTeamId: string | null; blueSideTeam?: TeamRecord | null; redSideTeam?: TeamRecord | null }) => {
                const displayBlue = resolveDisplayTeam(g.blueSideTeam || null, g.blueSideTeamId || null, teamMap, canonicalIndex as any);
                const displayRed = resolveDisplayTeam(g.redSideTeam || null, g.redSideTeamId || null, teamMap, canonicalIndex as any);
                return {
                    ...g,
                    blueSideTeamId: displayBlue?.id || g.blueSideTeamId || g.blueSideTeam?.id || null,
                    redSideTeamId: displayRed?.id || g.redSideTeamId || g.redSideTeam?.id || null,
                    blueSideTeam: displayBlue,
                    redSideTeam: displayRed,
                };
            }),
        };
    });

    const filteredMatches = dedupeScheduleMatches(displayResolvedMatches);
    const calendarHref = buildCalendarHref(region, year, stage);

    const todayStr = formatBeijingTime(new Date(), 'yyyy-MM-dd');
    const {
        upcomingByDate,
        recentFinishedByDate,
        tbdUpcoming,
        upcomingDates,
        recentFinishedDates,
        upcomingCount,
        recentFinishedCount,
        hasUpcomingSection,
        hasRecentSection,
    } = getScheduleSections(filteredMatches, todayStr);

    const visibleStages = getVisibleStagesForRegion(region);

    const intlStages: any[] = [];
    const currentStageConfig = config.splits.find((s) => s.id === stage);
    const showBracket = currentStageConfig?.type === 'playoff';

    return (
        <div className="mx-auto w-full max-w-[1220px] space-y-6">
            <div className="flex flex-col gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
                    <div className="flex p-1 gap-1">
                        {regions.map((r) => {
                            const preferredStage = preferredStageByRegionYear[`${r}::${year}`] || normalizeStage(config.defaultSplit);

                            return (
                                <a
                                    key={r}
                                    href={buildScheduleHref(r, year, preferredStage)}
                                    className={`flex-1 text-center py-2 rounded-lg font-black text-xl transition-all ${
                                        region === r
                                            ? 'bg-blue-600 text-white shadow-md scale-[1.01]'
                                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {r}
                                </a>
                            );
                        })}
                    </div>

                    <div className="h-px bg-gray-100 mx-2 my-1"></div>

                    <div className="flex justify-center gap-8 py-2">
                        {years.map((y) => (
                            <a
                                key={y}
                                href={buildScheduleHref(region, y, preferredStageByRegionYear[`${region}::${y}`] || stage)}
                                className={`text-sm font-bold transition-colors border-b-2 px-2 pb-0.5 ${
                                    year === y
                                        ? 'text-gray-900 border-blue-500'
                                        : 'text-gray-400 border-transparent hover:text-gray-600'
                                }`}
                            >
                                {y} Season
                            </a>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 px-2 pb-2 items-center">
                        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                            {visibleStages.map((s) => (
                                <a
                                    key={s.id}
                                    href={buildScheduleHref(region, year, s.id)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                                        stage === s.id
                                            ? 'bg-white text-blue-600 border-blue-500 shadow-sm'
                                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-white hover:text-gray-900'
                                    }`}
                                >
                                    {s.name}
                                </a>
                            ))}
                        </div>

                        <div className="w-px h-6 bg-gray-200 hidden md:block"></div>

                        <div className="flex gap-2 justify-center">
                            {intlStages.map((s) => (
                                <a
                                    key={s.id}
                                    href={buildScheduleHref(region, year, s.id)}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full text-xs font-black transition-all border ${
                                        stage === s.id
                                            ? 'bg-gray-900 text-white border-gray-900 shadow-md ring-2 ring-gray-200'
                                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-900'
                                    }`}
                                    title={s.name}
                                >
                                    {s.id}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 px-2 pb-2 pt-3">
                        <CalendarExportActions calendarPath={calendarHref} />
                    </div>
                </div>
            </div>

            {showBracket ? (
                rawMatches.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
                        <p className="text-gray-400 text-lg">
                            暂无 <span className="text-blue-600 font-medium">{region} {year} {stage}</span> 的树状图数据。
                        </p>
                    </div>
                ) : (
                    <PlayoffBracketView matches={filteredMatches} />
                )
            ) : !hasUpcomingSection && !hasRecentSection ? (
                <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
                    <p className="text-gray-400 text-lg">
                        暂无 <span className="text-blue-600 font-medium">{region} {year} {stage}</span> 比赛记录。
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div
                        id="schedule-quick-nav"
                        className="sticky top-20 z-30 bg-white/95 backdrop-blur rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 font-bold text-blue-700">
                                最近优先视图
                            </span>
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                                即将开始 {upcomingCount} 场
                            </span>
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                                最近结束 {recentFinishedCount} 场
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {hasUpcomingSection && (
                                <a
                                    href="#section-upcoming"
                                    className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                                >
                                    查看即将开始
                                </a>
                            )}
                            {hasRecentSection && (
                                <a
                                    href="#section-recent"
                                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                                >
                                    查看最近结束
                                </a>
                            )}
                        </div>
                    </div>

                    {hasUpcomingSection && (
                        <section id="section-upcoming" className="space-y-6 scroll-mt-28">
                            <div className="flex items-center justify-between pl-1">
                                <h3 className="text-lg font-black text-gray-900">即将开始</h3>
                                <span className="text-sm font-medium text-gray-400">按时间升序展示</span>
                            </div>

                            {upcomingDates.map((date) => (
                                <div key={date} id={`upcoming-date-${date}`} className="scroll-mt-28">
                                    <h4 className="text-lg font-bold text-gray-900 mb-3 pl-1 flex items-center gap-2">
                                        {formatDateHeading(date, todayStr)}
                                    </h4>

                                    <div className="space-y-3">
                                        {upcomingByDate[date].map((match) => (
                                            <MatchCard key={match.id} match={match} />
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {tbdUpcoming.length > 0 && (
                                <div id="upcoming-date-tbd" className="scroll-mt-28">
                                    <h4 className="text-lg font-bold text-gray-500 mb-3 pl-1 flex items-center gap-2">待定</h4>
                                    <div className="space-y-3">
                                        {tbdUpcoming.map((match) => (
                                            <MatchCard key={match.id} match={match} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {hasRecentSection && (
                        <section id="section-recent" className="space-y-6 scroll-mt-28">
                            <div className="flex items-center justify-between pl-1">
                                <h3 className="text-lg font-black text-gray-900">最近结束</h3>
                                <span className="text-sm font-medium text-gray-400">按时间倒序展示</span>
                            </div>

                            {recentFinishedDates.map((date) => (
                                <div key={date} id={`recent-date-${date}`} className="scroll-mt-28">
                                    <h4 className="text-lg font-bold text-gray-900 mb-3 pl-1 flex items-center gap-2">
                                        {formatDateHeading(date, todayStr)}
                                    </h4>

                                    <div className="space-y-3">
                                        {recentFinishedByDate[date].map((match) => (
                                            <MatchCard key={match.id} match={match} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}

                </div>
            )}
        </div>
    );
}

function MatchCard({ match }: { match: MatchWithTeams }) {
    const now = new Date();
    const isLive = String(match.status || '').toUpperCase() === 'LIVE' || isOngoingMatch(match, now);
    const isFinished = isFinishedMatchStatus(match.status);
    const teamADisplayName = getTeamShortDisplayName(match.teamA);
    const teamBisplayName = getTeamShortDisplayName(match.teamB);

    const countWins = (teamId: string, teamName: string, teamShortName?: string | null) => {
        if (!match.games) return 0;
        return match.games.filter((g: any) => {
            const w = g.winnerId;
            if (!w) return false;
            if (w === teamId) return true;

            let winningTeam = null;
            if (w === g.blueSideTeamId) winningTeam = g.blueSideTeam;
            else if (w === g.redSideTeamId) winningTeam = g.redSideTeam;

            if (winningTeam) {
                if (winningTeam.name === teamName) return true;
                if (teamShortName && winningTeam.name === teamShortName) return true;
            }

            if (w === 'Blue' || w === 'BLUE') {
                return g.blueSideTeam?.name === teamName || (teamShortName && g.blueSideTeam?.name === teamShortName);
            }
            if (w === 'Red' || w === 'RED') {
                return g.redSideTeam?.name === teamName || (teamShortName && g.redSideTeam?.name === teamShortName);
            }
            return false;
        }).length;
    };

    const scoreA = countWins(match.teamAId || 'A', match.teamA?.name || 'A', match.teamA?.shortName);
    const scoreB = countWins(match.teamBId || 'B', match.teamB?.name || 'B', match.teamB?.shortName);

    const beijingStartTime = match.startTime ? new Date(match.startTime) : null;

    return (
        <Link href={`/match/${match.id}`} className="block group">
            <div className="bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 p-4 flex items-center">
                <div className="w-16 flex flex-col items-center justify-center border-r border-gray-100 pr-4 mr-4">
                    {beijingStartTime ? (
                        <>
                            <span className="text-xs font-bold text-gray-500">{formatBeijingTime(beijingStartTime, 'M')}月</span>
                            <span className="text-xl font-bold text-gray-900">{formatBeijingTime(beijingStartTime, 'dd')}日</span>
                        </>
                    ) : (
                        <span className="text-xl font-bold text-gray-400">待定</span>
                    )}
                </div>

                <div className="w-36 flex flex-col justify-center border-r border-gray-100 pr-4 mr-6">
                    <span className="text-xl font-bold text-gray-900 leading-none">
                        {beijingStartTime ? formatBeijingTime(beijingStartTime, 'HH:mm') : '待定'}
                    </span>
                    <div className="flex flex-col mt-1.5 gap-1">
                        <span className="text-xs font-medium text-gray-400">{match.format}</span>
                        {match.tournament && (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded w-fit whitespace-nowrap">
                                {match.tournament}
                            </span>
                        )}
                        {match.stage && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit whitespace-nowrap border border-blue-100">
                                {match.stageLabel || match.stage}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
                    <div className="flex items-center justify-end gap-3">
                        <span className="text-[15px] font-medium text-gray-800 hidden md:block">{teamADisplayName}</span>
                        <div className="w-10 h-10 flex items-center justify-center">
                            <TeamLogo src={match.teamA?.logo} name={match.teamA?.name || '待定'} className="w-10 h-10" size={40} region={match.teamA?.region} />
                        </div>
                    </div>

                    <div className="w-16 text-center">
                        {isFinished || isLive || scoreA + scoreB > 0 ? (
                            <div className="bg-gray-900 text-white font-bold px-2 py-1 rounded text-sm font-mono tracking-widest">
                                {scoreA} : {scoreB}
                            </div>
                        ) : (
                            <span className="text-2xl font-black text-gray-200 pr-1">VS</span>
                        )}
                    </div>

                    <div className="flex items-center justify-start gap-3">
                        <div className="w-10 h-10 flex items-center justify-center">
                            <TeamLogo src={match.teamB?.logo} name={match.teamB?.name || '待定'} className="w-10 h-10" size={40} region={match.teamB?.region} />
                        </div>
                        <span className="text-[15px] font-medium text-gray-800 hidden md:block">{teamBisplayName}</span>
                    </div>
                </div>

                <div className="w-32 flex justify-end pl-4 border-l border-gray-100 ml-6">
                    {(() => {
                        if (isLive) {
                            return <span className="px-4 py-1.5 rounded text-xs font-bold bg-amber-500 text-white animate-pulse">进行中</span>;
                        }

                        if (!match.startTime) {
                            return <span className="px-4 py-1.5 rounded text-xs font-bold bg-slate-200 text-slate-500">待定</span>;
                        }

                        const matchDate = formatBeijingTime(match.startTime, 'yyyy-MM-dd');
                        const today = now;
                        const todayStr = formatBeijingTime(today, 'yyyy-MM-dd');
                        const tomorrow = addDays(today, 1);
                        const tomorrowStr = formatBeijingTime(tomorrow, 'yyyy-MM-dd');

                        let label = '';
                        let labelClass = '';

                        if (isFinished || matchDate < todayStr) {
                            label = '已结束';
                            labelClass = 'bg-gray-900 text-white';
                        } else if (matchDate === todayStr) {
                            label = '今日';
                            labelClass = 'bg-red-500 text-white';
                        } else if (matchDate === tomorrowStr) {
                            label = '明日';
                            labelClass = 'bg-blue-500 text-white';
                        } else {
                            label = '未开赛';
                            labelClass = 'bg-green-500 text-white';
                        }

                        return <span className={`px-4 py-1.5 rounded text-xs font-bold transition-colors shadow-sm ${labelClass}`}>{label}</span>;
                    })()}
                </div>
            </div>
        </Link>
    );
}


