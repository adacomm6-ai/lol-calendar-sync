'use client';

import { useEffect, useMemo, useState } from 'react';

import { fetchManualOddsRecords, mergeLegacyManualOddsRecords } from '@/app/manual-odds/actions';

import {
    TEAM_METRIC_LABELS,
    buildExactMarketSummaries,
    buildTeamOddsSummary,
    createMatchLookup,
    formatWinRate,
    getGroupedStatusFromRecords,
    getRecordSelectionLabel,
    getStatusFromResultValue,
    LEGACY_MANUAL_ODDS_MIGRATION_KEY,
    loadAllLegacyStoredOdds,
    type OddsMatchMeta,
    type StoredOddsResult,
    type TeamMetricKey,
    type TeamMetricSummary,
} from '@/lib/odds-history';

interface TeamLiteInfo {
    id: string;
    name: string;
    shortName?: string | null;
}

interface MatchOddsHintBadgesProps {
    team: TeamLiteInfo;
    matchMeta: OddsMatchMeta[];
}

interface ExactLossStreakHint {
    key: string;
    label: string;
    streak: number;
    total: number;
}

interface ExactWinStreakHint {
    key: string;
    label: string;
    streak: number;
    total: number;
}

function getLossBadgeTone(streak: number) {
    if (streak >= 3) {
        return {
            className: 'border-emerald-500/45 bg-emerald-600/15 text-emerald-100',
            textClassName: 'text-emerald-200/85',
        };
    }

    return {
        className: 'border-lime-400/35 bg-lime-500/10 text-lime-100',
        textClassName: 'text-lime-200/80',
    };
}

function getWinBadgeTone(streak: number) {
    if (streak >= 3) {
        return {
            className: 'border-red-500/45 bg-red-600/15 text-red-100',
            textClassName: 'text-red-200/85',
        };
    }

    return {
        className: 'border-rose-400/35 bg-rose-500/10 text-rose-100',
        textClassName: 'text-rose-200/80',
    };
}

function toBeijingDateKey(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return beijing.toISOString().slice(0, 10);
}

function getMetricKeysForTeam(record: StoredOddsResult, teamId: string): TeamMetricKey[] {
    const selectedTeamId = record.side === 'LEFT' ? record.teamAId : record.teamBId;
    if (record.type === 'WINNER' && selectedTeamId === teamId) return ['winner'];
    if (record.type === 'HANDICAP' && selectedTeamId === teamId) return ['handicap'];

    const involvesTeam = record.teamAId === teamId || record.teamBId === teamId;
    if (!involvesTeam) return [];

    if (record.type === 'KILLS') return ['killsAll', record.side === 'LEFT' ? 'killsOver' : 'killsUnder'];
    if (record.type === 'TIME') return ['timeAll', record.side === 'LEFT' ? 'timeOver' : 'timeUnder'];
    return [];
}

function getRecordDateKey(record: StoredOddsResult) {
    return toBeijingDateKey(record.matchStartTime || record.createdAt);
}

function pickIncreaseMetric(metrics: TeamMetricSummary[]): TeamMetricSummary | null {
    return metrics
        .filter((metric) => metric.key !== 'killsAll' && metric.key !== 'timeAll')
        .filter((metric) => (metric.winRate || 0) >= 60 && metric.total > 0 && metric.counter.WIN + metric.counter.LOSE >= 3)
        .sort((a, b) => (b.winRate || 0) - (a.winRate || 0) || b.total - a.total)[0] || null;
}

function pickDecreaseMetric(metrics: TeamMetricSummary[]): TeamMetricSummary | null {
    return metrics
        .filter((metric) => metric.key !== 'killsAll' && metric.key !== 'timeAll')
        .filter((metric) => (metric.winRate || 100) <= 40 && metric.total < 0 && metric.counter.WIN + metric.counter.LOSE >= 3)
        .sort((a, b) => (a.winRate || 100) - (b.winRate || 100) || a.total - b.total)[0] || null;
}

function buildExactLossStreakHint(records: StoredOddsResult[], team: TeamLiteInfo, targetDateKey: string): ExactLossStreakHint | null {
    if (!targetDateKey) return null;

    const dailyRecords = records.filter((record) => getRecordDateKey(record) === targetDateKey);
    const grouped = new Map<string, StoredOddsResult[]>();

    for (const record of dailyRecords) {
        const metricKeys = getMetricKeysForTeam(record, team.id);
        if (metricKeys.length === 0) continue;
        const metricKey = metricKeys[metricKeys.length - 1];
        const label = getRecordSelectionLabel(record) || TEAM_METRIC_LABELS[metricKey];
        const groupKey = `${metricKey}::${label}`;
        const list = grouped.get(groupKey) || [];
        list.push(record);
        grouped.set(groupKey, list);
    }

    const totals = new Map(
        buildExactMarketSummaries(dailyRecords, team).map((summary) => [summary.key, summary.total] as const),
    );

    const ranked: ExactLossStreakHint[] = [];
    for (const [key, list] of grouped.entries()) {
        const groupedByGame = new Map<string, StoredOddsResult[]>();
        for (const record of list) {
            const gameKey = `${record.matchId}::${record.gameNumber}`;
            const bucket = groupedByGame.get(gameKey) || [];
            bucket.push(record);
            groupedByGame.set(gameKey, bucket);
        }

        const sorted = [...groupedByGame.values()].sort((a, b) => {
            const ag = a[0];
            const bg = b[0];
            if ((bg?.gameNumber || 0) !== (ag?.gameNumber || 0)) return (bg?.gameNumber || 0) - (ag?.gameNumber || 0);
            return new Date(bg?.createdAt || 0).getTime() - new Date(ag?.createdAt || 0).getTime();
        });

        let streak = 0;
        for (const group of sorted) {
            const status = getGroupedStatusFromRecords(group);
            if (status === 'LOSE') {
                streak += 1;
                continue;
            }
            break;
        }

        if (streak < 2) continue;
        ranked.push({
            key,
            label: key.split('::')[1] || key,
            streak,
            total: totals.get(key) || 0,
        });
    }

    return ranked.sort((a, b) => b.streak - a.streak || a.total - b.total)[0] || null;
}

function buildExactWinStreakHint(records: StoredOddsResult[], team: TeamLiteInfo, targetDateKey: string): ExactWinStreakHint | null {
    if (!targetDateKey) return null;

    const dailyRecords = records.filter((record) => getRecordDateKey(record) === targetDateKey);
    const grouped = new Map<string, StoredOddsResult[]>();

    for (const record of dailyRecords) {
        const metricKeys = getMetricKeysForTeam(record, team.id);
        if (metricKeys.length === 0) continue;
        const metricKey = metricKeys[metricKeys.length - 1];
        const label = getRecordSelectionLabel(record) || TEAM_METRIC_LABELS[metricKey];
        const groupKey = `${metricKey}::${label}`;
        const list = grouped.get(groupKey) || [];
        list.push(record);
        grouped.set(groupKey, list);
    }

    const totals = new Map(
        buildExactMarketSummaries(dailyRecords, team).map((summary) => [summary.key, summary.total] as const),
    );

    const ranked: ExactWinStreakHint[] = [];
    for (const [key, list] of grouped.entries()) {
        const groupedByGame = new Map<string, StoredOddsResult[]>();
        for (const record of list) {
            const gameKey = `${record.matchId}::${record.gameNumber}`;
            const bucket = groupedByGame.get(gameKey) || [];
            bucket.push(record);
            groupedByGame.set(gameKey, bucket);
        }

        const sorted = [...groupedByGame.values()].sort((a, b) => {
            const ag = a[0];
            const bg = b[0];
            if ((bg?.gameNumber || 0) !== (ag?.gameNumber || 0)) return (bg?.gameNumber || 0) - (ag?.gameNumber || 0);
            return new Date(bg?.createdAt || 0).getTime() - new Date(ag?.createdAt || 0).getTime();
        });

        let streak = 0;
        for (const group of sorted) {
            const status = getGroupedStatusFromRecords(group);
            if (status === 'WIN') {
                streak += 1;
                continue;
            }
            break;
        }

        if (streak < 2) continue;
        ranked.push({
            key,
            label: key.split('::')[1] || key,
            streak,
            total: totals.get(key) || 0,
        });
    }

    return ranked.sort((a, b) => b.streak - a.streak || b.total - a.total)[0] || null;
}

export default function MatchOddsHintBadges({ team, matchMeta }: MatchOddsHintBadgesProps) {
    const [records, setRecords] = useState<StoredOddsResult[]>([]);

    useEffect(() => {
        let cancelled = false;

        const migrateLegacyManualOdds = async () => {
            if (typeof window === 'undefined') return;
            if (window.localStorage.getItem(LEGACY_MANUAL_ODDS_MIGRATION_KEY) === '1') return;

            const legacyRecords = loadAllLegacyStoredOdds();
            if (legacyRecords.length === 0) {
                window.localStorage.setItem(LEGACY_MANUAL_ODDS_MIGRATION_KEY, '1');
                return;
            }

            const result = await mergeLegacyManualOddsRecords(legacyRecords);
            if (result.inserted >= 0) {
                window.localStorage.setItem(LEGACY_MANUAL_ODDS_MIGRATION_KEY, '1');
            }
        };

        const reload = async () => {
            try {
                await migrateLegacyManualOdds();
                const nextRecords = await fetchManualOddsRecords();
                if (!cancelled) setRecords(nextRecords);
            } catch (error) {
                console.error('reload match odds hint badges failed', error);
            }
        };

        void reload();
        const handleRefresh = () => {
            void reload();
        };
        window.addEventListener('manual-odds-updated', handleRefresh as EventListener);
        return () => {
            cancelled = true;
            window.removeEventListener('manual-odds-updated', handleRefresh as EventListener);
        };
    }, []);

    const matchLookup = useMemo(() => createMatchLookup(matchMeta), [matchMeta]);
    const summary = useMemo(() => buildTeamOddsSummary(records, team, matchLookup), [matchLookup, records, team]);
    const metrics = useMemo(() => Object.values(summary.metrics), [summary.metrics]);
    const increaseMetric = useMemo(() => pickIncreaseMetric(metrics), [metrics]);
    const decreaseMetric = useMemo(() => pickDecreaseMetric(metrics), [metrics]);
    const targetDateKey = useMemo(() => toBeijingDateKey(matchMeta[0]?.startTime || null), [matchMeta]);
    const exactLossStreakHint = useMemo(() => buildExactLossStreakHint(records, team, targetDateKey), [records, targetDateKey, team]);
    const exactWinStreakHint = useMemo(() => buildExactWinStreakHint(records, team, targetDateKey), [records, targetDateKey, team]);
    const lossBadgeTone = exactLossStreakHint ? getLossBadgeTone(exactLossStreakHint.streak) : null;
    const winBadgeTone = exactWinStreakHint ? getWinBadgeTone(exactWinStreakHint.streak) : null;

    if (!increaseMetric && !decreaseMetric && !exactLossStreakHint && !exactWinStreakHint) return null;

    return (
        <div className="mt-2 flex w-full max-w-full flex-wrap items-center gap-2 overflow-hidden">
            {exactLossStreakHint ? (
                <div
                    className={`inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full border px-2.5 py-1 text-[11px] font-black ${lossBadgeTone?.className}`}
                    title={`${exactLossStreakHint.label} 按不同小局统计，今天已连续亏损 ${exactLossStreakHint.streak} 局，当前总输赢 ${exactLossStreakHint.total > 0 ? '+' : ''}${exactLossStreakHint.total}`}
                >
                    <span className="shrink-0">!</span>
                    <span className="truncate">{exactLossStreakHint.label}</span>
                    <span className={`shrink-0 ${lossBadgeTone?.textClassName}`}>连亏 {exactLossStreakHint.streak}</span>
                </div>
            ) : null}
            {exactWinStreakHint ? (
                <div
                    className={`inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full border px-2.5 py-1 text-[11px] font-black ${winBadgeTone?.className}`}
                    title={`${exactWinStreakHint.label} 按不同小局统计，今天已连续盈利 ${exactWinStreakHint.streak} 局，当前总输赢 ${exactWinStreakHint.total > 0 ? '+' : ''}${exactWinStreakHint.total}`}
                >
                    <span className="shrink-0">+</span>
                    <span className="truncate">{exactWinStreakHint.label}</span>
                    <span className={`shrink-0 ${winBadgeTone?.textClassName}`}>连赢 {exactWinStreakHint.streak}</span>
                </div>
            ) : null}
            {increaseMetric ? (
                <div
                    className="inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-black text-rose-100"
                    title={`${increaseMetric.label} 历史胜率 ${formatWinRate(increaseMetric.winRate)}，总输赢 ${increaseMetric.total > 0 ? '+' : ''}${increaseMetric.total}`}
                >
                    <span className="shrink-0">+</span>
                    <span className="truncate">{increaseMetric.label}</span>
                    <span className="shrink-0 text-rose-200/80">{formatWinRate(increaseMetric.winRate)}</span>
                </div>
            ) : null}
            {decreaseMetric ? (
                <div
                    className="inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-100"
                    title={`${decreaseMetric.label} 历史胜率 ${formatWinRate(decreaseMetric.winRate)}，总输赢 ${decreaseMetric.total > 0 ? '+' : ''}${decreaseMetric.total}`}
                >
                    <span className="shrink-0">!</span>
                    <span className="truncate">{decreaseMetric.label}</span>
                    <span className="shrink-0 text-emerald-200/80">{formatWinRate(decreaseMetric.winRate)}</span>
                </div>
            ) : null}
        </div>
    );
}
