
'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useEffect, useMemo, useState } from 'react';

import {
    fetchManualOddsRecords,
    mergeLegacyManualOddsRecords,
    replaceManualOddsForMatchSafe,
} from '@/app/manual-odds/actions';
import {
    buildOddsValue,
    HelpTooltipLabel,
    OddsSplitField,
    PrefixedNumericField,
    splitOddsParts,
} from '@/components/analysis/odds-form-controls';
import TeamOddsSummaryCard from '@/components/analysis/TeamOddsSummaryCard';
import {
    TEAM_METRIC_LABELS,
    buildExactMarketSummaries,
    buildTeamOddsSummary,
    calculateResultValueFromStake,
    createMatchLookup,
    detectOddsFormat,
    formatAmountNumber,
    formatSignedNumber,
    formatWinRate,
    getRecordActualOdds,
    getRecordProviderLabel,
    getRecordSelectionLabel,
    getStatusFromResultValue,
    resolveAutoSettlementStatusFromMatch,
    getTeamShortDisplayName,
    LEGACY_MANUAL_ODDS_MIGRATION_KEY,
    loadAllLegacyStoredOdds,
    normalizeUnifiedOdds,
    type OddsMatchMeta,
    type OddsType,
    type StoredOddsResult,
} from '@/lib/odds-history';
import { MAJOR3_REGION_ID, MAJOR3_REGION_IDS, type RegionConfig, type SplitConfig } from '@/lib/config-shared';

interface TeamOption {
    id: string;
    name: string;
    shortName?: string | null;
    region?: string | null;
    logo?: string | null;
    aliasIds?: string[];
}

interface OddsStatsClientProps {
    teams: TeamOption[];
    matches: OddsMatchMeta[];
    regions: RegionConfig[];
    years: string[];
    splits: SplitConfig[];
    allSplits: SplitConfig[];
    selectedRegion: string;
    selectedYear: string;
    selectedSplit: string;
    defaultYear: string;
}

type HistoryFilterKey = 'ALL' | OddsType;
type HistorySortKey = 'NEWEST' | 'OLDEST';

const HISTORY_FILTER_OPTIONS: Array<{ key: HistoryFilterKey; label: string }> = [
    { key: 'ALL', label: '全部' },
    { key: 'WINNER', label: '胜负盘' },
    { key: 'HANDICAP', label: '让分盘' },
    { key: 'KILLS', label: '人头盘' },
    { key: 'TIME', label: '时间盘' },
];

const HISTORY_PAGE_SIZE = 15;
const ALL_SPLITS_ID = '__ALL_SPLITS__';
const ODDS_FILTERS_STORAGE_KEY = 'odds-stats-filters-v1';

function splitLooksLikeWorlds(split: SplitConfig) {
    const text = `${split.id || ''} ${split.name || ''} ${split.mapping || ''}`.toUpperCase();
    return text.includes('WORLDS') || text.includes('WORLD') || text.includes('MSI') || text.includes('FIRST STAND') || text.includes('全球先锋赛') || text.includes('全球总决赛');
}

function splitBelongsToOddsRegion(split: SplitConfig, selectedRegion: string) {
    const regions = (split.regions || []).map((item) => String(item || '').trim().toUpperCase());
    if (selectedRegion === 'ALL') return true;
    if (selectedRegion === MAJOR3_REGION_ID) {
        return splitLooksLikeWorlds(split) || regions.some((region) => MAJOR3_REGION_IDS.includes(region));
    }
    if (selectedRegion === 'WORLDS') {
        return splitLooksLikeWorlds(split) || regions.includes('WORLDS');
    }
    if (selectedRegion === 'OTHER') {
        if (splitLooksLikeWorlds(split) || regions.includes('WORLDS')) return false;
        if (!regions.length) return true;
        return regions.includes('OTHER') || regions.includes('LEC');
    }
    if (!regions.length) return true;
    return regions.includes(selectedRegion);
}

function normalizeOddsRegionSelection(region?: string | null) {
    const upper = String(region || '').trim().toUpperCase();
    if (upper === 'LEC') return 'OTHER';
    if (upper === 'ALL') return 'ALL';
    return String(region || '');
}
function buildMergedTeams(teams: TeamOption[]) {
    const merged = new Map<string, TeamOption>();
    for (const team of teams) {
        const shortName = getTeamShortDisplayName(team.shortName || team.name);
        const region = String(team.region || '').trim().toUpperCase();
        const key = `${shortName}::${region}`;
        const existing = merged.get(key);
        if (existing) {
            existing.aliasIds = Array.from(new Set([...(existing.aliasIds || [existing.id]), team.id]));
            if (!existing.logo && team.logo) existing.logo = team.logo;
            continue;
        }

        merged.set(key, {
            ...team,
            shortName,
            aliasIds: [team.id],
        });
    }

    return Array.from(merged.values());
}

type TeamSummary = ReturnType<typeof buildTeamOddsSummary>;
type TeamSummaryMetric = TeamSummary['metrics'][keyof TeamSummary['metrics']];
type TeamRecommendation = {
    id: string;
    teamId: string;
    teamName: string;
    metricLabel: string;
    winRate: number | null;
    total: number;
    direction: 'increase' | 'decrease';
    reason: string;
    averageOdds?: number | null;
    expectedUnitReturn?: number | null;
    lossRate?: number | null;
};
function createExactMarketLabel(record: StoredOddsResult, actualThreshold: number | null): string {
    if (record.type === 'WINNER') {
        return record.side === 'LEFT'
            ? getTeamShortDisplayName(record.teamAName || '队伍A')
            : getTeamShortDisplayName(record.teamBName || '队伍B');
    }

    if (record.type === 'HANDICAP') {
        const threshold = formatThreshold(actualThreshold);
        if (record.side === 'LEFT') {
            return `${record.teamAName || '队伍A'} ${Number(actualThreshold || 0) > 0 ? '+' : ''}${threshold}`;
        }
        const invert = Number(actualThreshold || 0) * -1;
        return `${record.teamBName || '队伍B'} ${invert > 0 ? '+' : ''}${formatThreshold(invert)}`;
    }

    if (record.type === 'KILLS') {
        return record.side === 'LEFT' ? `大于 ${formatThreshold(actualThreshold)}` : `小于 ${formatThreshold(actualThreshold)}`;
    }

    return record.side === 'LEFT' ? `大于 ${formatThreshold(actualThreshold)} 分钟` : `小于 ${formatThreshold(actualThreshold)} 分钟`;
}
function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div className="text-xs text-slate-400">{label}</div>
            <div className="mt-2 text-3xl font-black text-white">{value}</div>
            <div className="mt-1 text-xs text-slate-500">{helper}</div>
        </div>
    );
}

function EditIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

function formatThreshold(value: number | null | undefined): string {
    if (!Number.isFinite(value)) return '-';
    const numeric = value as number;
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function getProfitTone(value: number): string {
    if (value > 0) return 'text-rose-300';
    if (value < 0) return 'text-emerald-300';
    return 'text-amber-300';
}

function CounterPill({
    win,
    lose,
    compact = false,
}: {
    win: number;
    lose: number;
    compact?: boolean;
}) {
    return (
        <div
            className={`inline-flex items-center rounded-full border border-white/10 bg-slate-950/85 font-black leading-none ${
                compact ? 'gap-1 px-1.5 py-0.5 text-[9px]' : 'gap-1.5 px-2.5 py-1 text-[11px]'
            }`}
        >
            <span className="text-rose-300">赢{win}</span>
            <span className="text-slate-600">/</span>
            <span className="text-emerald-300">输{lose}</span>
        </div>
    );
}
function SummaryMetricCell({
    total,
    winRate,
    win,
    lose,
}: {
    total: number;
    winRate: number | null;
    win: number;
    lose: number;
}) {
    return (
        <div className="min-w-[118px] rounded-xl border border-white/8 bg-slate-950/45 p-2.5">
            <div className={`font-black ${getProfitTone(total)}`}>{formatSignedNumber(total)}</div>
            <div className="mt-2 text-[10px] text-slate-500">胜率</div>
            <div className="mt-1 flex items-center justify-between gap-2">
                <CounterPill win={win} lose={lose} compact />
                <div className="text-xs font-black text-white">{formatWinRate(winRate)}</div>
            </div>
        </div>
    );
}

function getBestWinRateMetric(summary: TeamSummary): TeamSummaryMetric | null {
    const metrics = Object.values(summary.metrics) as TeamSummaryMetric[];
    const candidates = metrics.filter((metric) => metric.winRate !== null && metric.key !== 'killsAll' && metric.key !== 'timeAll');
    if (candidates.length === 0) return null;

    return [...candidates].sort((a, b) => {
        const rateDiff = (b.winRate || 0) - (a.winRate || 0);
        if (rateDiff !== 0) return rateDiff;

        const decidedA = a.counter.WIN + a.counter.LOSE;
        const decidedB = b.counter.WIN + b.counter.LOSE;
        if (decidedB !== decidedA) return decidedB - decidedA;

        return Math.abs(b.total) - Math.abs(a.total);
    })[0];
}

function formatBestMetricLabel(metric: TeamSummaryMetric | null): string {
    if (!metric) return '暂无有效盘口';
    if (metric.key === 'winner') return '胜负盘';
    if (metric.key === 'handicap') return '让分盘';
    if (metric.key === 'killsOver') return '大人头';
    if (metric.key === 'killsUnder') return '小人头';
    if (metric.key === 'timeOver') return '大时间';
    if (metric.key === 'timeUnder') return '小时间';
    return metric.label;
}

function buildRecommendationList(summaries: TeamSummary[], records: StoredOddsResult[], matchLookup: Map<string, OddsMatchMeta>): TeamRecommendation[] {
    const results: TeamRecommendation[] = [];

    for (const summary of summaries) {
        const exactMarkets = buildExactMarketSummaries(records, { id: summary.teamId, name: summary.teamName, aliasIds: summary.aliasIds }, matchLookup);

        for (const market of exactMarkets) {
            const decided = market.counter.WIN + market.counter.LOSE;
            if (decided < 3) continue;

            const recentWins = market.recentMatches.filter((item) => item.total > 0).length;
            const recentLoses = market.recentMatches.filter((item) => item.total < 0).length;
            const positiveReturn = market.expectedUnitReturn !== null && market.expectedUnitReturn > 0;
            const negativeReturn = market.expectedUnitReturn !== null && market.expectedUnitReturn < 0;

            if ((market.winRate || 0) >= 60 && market.total > 0 && recentWins >= 2 && !negativeReturn) {
                results.push({
                    id: summary.teamId + '-' + market.key + '-increase',
                    teamId: summary.teamId,
                    teamName: summary.teamName,
                    metricLabel: market.label,
                    winRate: market.winRate,
                    total: market.total,
                    direction: 'increase',
                    reason:
                        '历史胜率 ' +
                        formatWinRate(market.winRate) +
                        '，最近 3 个大场赢 ' +
                        recentWins +
                        ' 场。' +
                        (market.averageOdds !== null ? ` 平均赔率 ${market.averageOdds.toFixed(2)}。` : '') +
                        (positiveReturn ? ` 单注历史回报 ${market.expectedUnitReturn?.toFixed(2)}，适合优先加注。` : ' 适合优先加注。'),
                    averageOdds: market.averageOdds,
                    expectedUnitReturn: market.expectedUnitReturn,
                    lossRate: market.lossRate,
                });
            }

            if (((market.winRate || 0) <= 40 && market.total < 0 && recentLoses >= 2) || negativeReturn || (market.lossRate || 0) >= 50) {
                results.push({
                    id: summary.teamId + '-' + market.key + '-decrease',
                    teamId: summary.teamId,
                    teamName: summary.teamName,
                    metricLabel: market.label,
                    winRate: market.winRate,
                    total: market.total,
                    direction: 'decrease',
                    reason:
                        '历史胜率 ' +
                        formatWinRate(market.winRate) +
                        '，最近 3 个大场输 ' +
                        recentLoses +
                        ' 场。' +
                        (market.averageOdds !== null ? ` 平均赔率 ${market.averageOdds.toFixed(2)}。` : '') +
                        (negativeReturn ? ` 单注历史回报 ${market.expectedUnitReturn?.toFixed(2)}，建议优先减仓。` : ' 建议优先减仓。'),
                    averageOdds: market.averageOdds,
                    expectedUnitReturn: market.expectedUnitReturn,
                    lossRate: market.lossRate,
                });
            }
        }
    }

    return results;
}
function formatRecordTime(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

function formatMatchLabel(record: StoredOddsResult, matchMeta?: OddsMatchMeta): string {
    const leftName = getTeamShortDisplayName(matchMeta?.teamAName || record.teamAName || '队伍A');
    const rightName = getTeamShortDisplayName(matchMeta?.teamBName || record.teamBName || '队伍B');
    return `${leftName} VS ${rightName}`;
}

function getRecordTypeLabel(record: StoredOddsResult): string {
    if (record.type === 'WINNER') return '胜负盘';
    if (record.type === 'HANDICAP') return '让分盘';
    if (record.type === 'KILLS') return record.side === 'LEFT' ? '大人头' : '小人头';
    return record.side === 'LEFT' ? '大时间' : '小时间';
}

function getSelectionLabel(record: StoredOddsResult): string {
    const exactLabel = getRecordSelectionLabel(record);
    if (exactLabel) return exactLabel;

    if (record.type === 'WINNER') {
        return record.side === 'LEFT' ? getTeamShortDisplayName(record.teamAName || '队伍A') : getTeamShortDisplayName(record.teamBName || '队伍B');
    }

    const effectiveThreshold = record.actualThreshold ?? record.threshold;

    if (record.type === 'HANDICAP') {
        const threshold = formatThreshold(effectiveThreshold);
        if (record.side === 'LEFT') {
            return `${record.teamAName || '队伍A'} ${Number(effectiveThreshold || 0) > 0 ? '+' : ''}${threshold}`;
        }
        const invert = Number(effectiveThreshold || 0) * -1;
        return `${record.teamBName || '队伍B'} ${invert > 0 ? '+' : ''}${formatThreshold(invert)}`;
    }

    if (record.type === 'KILLS') {
        return record.side === 'LEFT' ? `大于 ${formatThreshold(effectiveThreshold)}` : `小于 ${formatThreshold(effectiveThreshold)}`;
    }

    return record.side === 'LEFT' ? `大于 ${formatThreshold(effectiveThreshold)} 分钟` : `小于 ${formatThreshold(effectiveThreshold)} 分钟`;
}

function formatActualOddsLabel(record: StoredOddsResult): string {
    const normalized = getRecordActualOdds(record);
    if (normalized === null) return '-';
    return normalized.toFixed(2);
}

function getStatusLabel(status?: StoredOddsResult['settledStatus']): string {
    if (status === 'WIN') return '赢';
    if (status === 'LOSE') return '输';
    if (status === 'PUSH') return '走';
    return '待';
}

function getHandicapPrefixForRecord(record: StoredOddsResult): string | undefined {
    if (record.type !== 'HANDICAP') return undefined;
    const label = getSelectionLabel(record);
    if (label.includes(' +')) return '+';
    if (label.includes(' -')) return '-';
    return undefined;
}


function getAutoSettledStatusForRecord(record: StoredOddsResult, matchMeta?: OddsMatchMeta, thresholdOverride?: number | null) {
    return resolveAutoSettlementStatusFromMatch({
        matchMeta,
        gameNumber: record.gameNumber,
        type: record.type,
        side: record.side,
        threshold: thresholdOverride ?? record.actualThreshold ?? record.threshold ?? null,
        teamAId: record.teamAId,
        teamBId: record.teamBId,
    });
}

function isRecordBelongToTeam(record: StoredOddsResult, teamId: string): boolean {
    return isRecordBelongToAliasTeam(record, [teamId]);
}

function isRecordBelongToAliasTeam(record: StoredOddsResult, teamIds: string[]): boolean {
    const teamIdSet = new Set(teamIds);
    if (record.type === 'WINNER' || record.type === 'HANDICAP') {
        const selectedTeamId = record.side === 'LEFT' ? record.teamAId : record.teamBId;
        return teamIdSet.has(String(selectedTeamId || ''));
    }

    return teamIdSet.has(String(record.teamAId || '')) || teamIdSet.has(String(record.teamBId || ''));
}

function getRecordTimestampMs(record: StoredOddsResult, matchMeta?: OddsMatchMeta): number {
    const candidate = matchMeta?.startTime || record.matchStartTime || record.createdAt;
    const timestamp = new Date(candidate).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getLocalDateKey(record: StoredOddsResult, matchMeta?: OddsMatchMeta): string {
    const timestamp = getRecordTimestampMs(record, matchMeta);
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function OddsStatsClient({
    teams,
    matches,
    regions,
    years,
    splits,
    allSplits,
    selectedRegion,
    selectedYear,
    selectedSplit,
    defaultYear,
}: OddsStatsClientProps) {
    const [records, setRecords] = useState<StoredOddsResult[]>([]);
    const [formRegion, setFormRegion] = useState(selectedRegion);
    const [formYear, setFormYear] = useState(selectedYear);
    const [formSplit, setFormSplit] = useState(selectedSplit);
    const [search, setSearch] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [historyFilter, setHistoryFilter] = useState<HistoryFilterKey>('ALL');
    const [historySort, setHistorySort] = useState<HistorySortKey>('NEWEST');
    const [historyMatchId, setHistoryMatchId] = useState('ALL');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_PAGE_SIZE);
    const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
    const [editingRecordId, setEditingRecordId] = useState('');
    const [editingStakeAmount, setEditingStakeAmount] = useState('');
    const [editingDetail, setEditingDetail] = useState('');
    const [editingActualThreshold, setEditingActualThreshold] = useState('');
    const [editingActualOddsWhole, setEditingActualOddsWhole] = useState('');
    const [editingActualOddsDecimal, setEditingActualOddsDecimal] = useState('');
    const [editingActualProvider, setEditingActualProvider] = useState('');

    const submitFilterWithReset = (form: HTMLFormElement | null) => {
        if (!form) return;
        const splitField = form.elements.namedItem('split') as HTMLSelectElement | null;
        if (splitField) splitField.value = ALL_SPLITS_ID;
        form.requestSubmit();
    };

    useEffect(() => {
        setFormRegion(selectedRegion);
        setFormYear(selectedYear);
        setFormSplit(selectedSplit);
    }, [selectedRegion, selectedYear, selectedSplit]);

    const visibleFormSplits = useMemo(() => {
        return allSplits.filter((split) => splitBelongsToOddsRegion(split, normalizeOddsRegionSelection(formRegion)));
    }, [allSplits, formRegion]);

    useEffect(() => {
        if (formSplit === ALL_SPLITS_ID) return;
        if (visibleFormSplits.some((split) => split.id === formSplit)) return;
        setFormSplit(ALL_SPLITS_ID);
    }, [formSplit, visibleFormSplits]);

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
                console.error('reload manual odds stats failed', error);
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

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(
            ODDS_FILTERS_STORAGE_KEY,
            JSON.stringify({
                region: normalizeOddsRegionSelection(selectedRegion),
                year: selectedYear,
                split: selectedSplit,
            }),
        );
    }, [selectedRegion, selectedYear, selectedSplit]);

    const matchLookup = useMemo(() => createMatchLookup(matches), [matches]);
    const filteredRecords = useMemo(() => records.filter((record) => matchLookup.has(record.matchId)), [records, matchLookup]);
    const mergedTeams = useMemo(() => buildMergedTeams(teams), [teams]);

    const summaries = useMemo(() => {
        return mergedTeams
            .map((team) => buildTeamOddsSummary(filteredRecords, team, matchLookup))

            .sort((a, b) => {
                if (b.totalRecords !== a.totalRecords) return b.totalRecords - a.totalRecords;
                if (b.overallTotal !== a.overallTotal) return b.overallTotal - a.overallTotal;
                return a.teamName.localeCompare(b.teamName);
            });
    }, [filteredRecords, matchLookup, mergedTeams]);

    const visibleSummaries = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return summaries;
        return summaries.filter((summary) => summary.teamName.toLowerCase().includes(keyword));
    }, [search, summaries]);

    useEffect(() => {
        if (visibleSummaries.length === 0) {
            setSelectedTeamId('');
            return;
        }

        const stillVisible = visibleSummaries.some((summary) => summary.teamId === selectedTeamId);
        if (stillVisible) return;

        const firstWithRecords = visibleSummaries.find((summary) => summary.totalRecords > 0);
        setSelectedTeamId((firstWithRecords || visibleSummaries[0]).teamId);
    }, [selectedTeamId, visibleSummaries]);

    const selectedSummary = visibleSummaries.find((summary) => summary.teamId === selectedTeamId) || visibleSummaries[0] || null;

    const exactMarketSummaries = useMemo(() => {
        if (!selectedSummary) return [];
        return buildExactMarketSummaries(
            filteredRecords,
            { id: selectedSummary.teamId, name: selectedSummary.teamName, aliasIds: selectedSummary.aliasIds },
            matchLookup,
        ).slice(0, 12);
    }, [filteredRecords, matchLookup, selectedSummary]);


    const typeFilteredRecords = useMemo(() => {
        if (!selectedSummary) return [];

        const teamRecords = filteredRecords
            .filter((record) => isRecordBelongToAliasTeam(record, selectedSummary.aliasIds))
            .sort((a, b) => {
                const aTime = getRecordTimestampMs(a, matchLookup.get(a.matchId));
                const bTime = getRecordTimestampMs(b, matchLookup.get(b.matchId));
                return historySort === 'NEWEST' ? bTime - aTime : aTime - bTime;
            });

        if (historyFilter === 'ALL') return teamRecords;
        return teamRecords.filter((record) => record.type === historyFilter);
    }, [filteredRecords, historyFilter, historySort, matchLookup, selectedSummary]);

    const historyMatchOptions = useMemo(() => {
        const optionMap = new Map<string, { id: string; label: string; sortTime: number }>();
        for (const record of typeFilteredRecords) {
            if (optionMap.has(record.matchId)) continue;
            const meta = matchLookup.get(record.matchId);
            const label = `${formatMatchLabel(record, meta)} · ${formatRecordTime(meta?.startTime || record.matchStartTime || record.createdAt)}`;
            optionMap.set(record.matchId, {
                id: record.matchId,
                label,
                sortTime: getRecordTimestampMs(record, meta),
            });
        }

        return Array.from(optionMap.values()).sort((a, b) => b.sortTime - a.sortTime);
    }, [typeFilteredRecords, matchLookup]);

    useEffect(() => {
        if (historyMatchId === 'ALL') return;
        if (historyMatchOptions.some((option) => option.id === historyMatchId)) return;
        setHistoryMatchId('ALL');
    }, [historyMatchId, historyMatchOptions]);

    const filteredTeamRecords = useMemo(() => {
        return typeFilteredRecords.filter((record) => {
            if (historyMatchId !== 'ALL' && record.matchId !== historyMatchId) return false;

            const meta = matchLookup.get(record.matchId);
            const dateKey = getLocalDateKey(record, meta);
            if (historyDateFrom && (!dateKey || dateKey < historyDateFrom)) return false;
            if (historyDateTo && (!dateKey || dateKey > historyDateTo)) return false;

            return true;
        });
    }, [typeFilteredRecords, historyMatchId, historyDateFrom, historyDateTo, matchLookup]);

    const pagedTeamRecords = useMemo(() => {
        return filteredTeamRecords.slice(0, visibleHistoryCount);
    }, [filteredTeamRecords, visibleHistoryCount]);

    const hasMoreHistory = pagedTeamRecords.length < filteredTeamRecords.length;

    const pagedRecordIds = useMemo(() => pagedTeamRecords.map((record) => record.id), [pagedTeamRecords]);
    const allPagedSelected = pagedRecordIds.length > 0 && pagedRecordIds.every((id) => selectedHistoryIds.includes(id));

    const teamsWithRecords = visibleSummaries.filter((summary) => summary.totalRecords > 0).length;
    const totalSigned = filteredRecords.reduce((sum, record) => sum + (Number.isFinite(record.resultValue) ? Number(record.resultValue) : 0), 0);
    const totalMarkets = filteredRecords.length;
    const bestWinnerRate = visibleSummaries.reduce((best, summary) => {
        const rate = summary.metrics.winner.winRate;
        if (rate === null) return best;
        return Math.max(best, rate);
    }, 0);

    const recommendationItems = useMemo(() => buildRecommendationList(visibleSummaries, filteredRecords, matchLookup), [filteredRecords, matchLookup, visibleSummaries]);
    const increaseRecommendations = useMemo(
        () => recommendationItems.filter((item) => item.direction === 'increase').sort((a, b) => (b.winRate || 0) - (a.winRate || 0) || b.total - a.total).slice(0, 6),
        [recommendationItems],
    );
    const decreaseRecommendations = useMemo(
        () => recommendationItems.filter((item) => item.direction === 'decrease').sort((a, b) => (a.winRate || 0) - (b.winRate || 0) || a.total - b.total).slice(0, 6),
        [recommendationItems],
    );

    const startEditRecord = (record: StoredOddsResult) => {
        let nextStakeAmount = '';
        const actualOdds = getRecordActualOdds(record) ?? undefined;
        if (Number.isFinite(record.actualStakeAmount)) {
            nextStakeAmount = String(record.actualStakeAmount);
        } else if (record.settledStatus === 'LOSE' && Number.isFinite(record.resultValue)) {
            nextStakeAmount = String(Math.abs(record.resultValue as number));
        } else if (record.settledStatus === 'WIN' && Number.isFinite(record.resultValue)) {
            const profit = actualOdds === undefined ? null : (actualOdds > 1 ? actualOdds - 1 : actualOdds);
            if (profit && profit > 0) {
                nextStakeAmount = String(Number(((record.resultValue as number) / profit).toFixed(2)));
            }
        }

        const actualThresholdValue =
            record.actualThreshold === null
                ? ''
                : Number.isFinite(record.actualThreshold)
                  ? String(record.type === 'HANDICAP' ? Math.abs(record.actualThreshold as number) : record.actualThreshold)
                  : Number.isFinite(record.threshold)
                    ? String(record.type === 'HANDICAP' ? Math.abs(record.threshold as number) : record.threshold)
                    : '';
        const actualOddsParts = splitOddsParts(Number.isFinite(actualOdds) ? String(actualOdds) : '');

        setEditingRecordId(record.id);
        setEditingStakeAmount(nextStakeAmount);
        setEditingDetail(record.detail || '');
        setEditingActualThreshold(actualThresholdValue);
        setEditingActualOddsWhole(actualOddsParts.whole);
        setEditingActualOddsDecimal(actualOddsParts.decimal);
        setEditingActualProvider(record.actualProvider || record.provider || '');
    };

    const cancelEditRecord = () => {
        setEditingRecordId('');
        setEditingStakeAmount('');
        setEditingDetail('');
        setEditingActualThreshold('');
        setEditingActualOddsWhole('');
        setEditingActualOddsDecimal('');
        setEditingActualProvider('');
    };

    const saveEditedRecord = async () => {
        if (!editingRecordId) return;

        const targetRecord = records.find((record) => record.id === editingRecordId);
        if (!targetRecord) {
            cancelEditRecord();
            return;
        }

        const normalizedStake = editingStakeAmount.trim();
        const parsedStake = normalizedStake === '' ? 0 : Number.parseFloat(normalizedStake);
        if (normalizedStake !== '' && !Number.isFinite(parsedStake)) {
            alert('投注金额必须是数字');
            return;
        }
        if (Number(parsedStake) < 0) {
            alert('投注金额不能小于 0');
            return;
        }

        const normalizedThreshold = editingActualThreshold.trim();
        const parsedThresholdBase = normalizedThreshold === '' ? 0 : Number.parseFloat(normalizedThreshold);
        if (normalizedThreshold !== '' && !Number.isFinite(parsedThresholdBase)) {
            alert('实盘口线必须是数字');
            return;
        }

        const oddsValue = buildOddsValue(editingActualOddsWhole, editingActualOddsDecimal);
        const parsedOdds = oddsValue === '' ? 0 : Number.parseFloat(oddsValue);
        if (oddsValue !== '' && !Number.isFinite(parsedOdds)) {
            alert('实盘赔率必须是数字');
            return;
        }

        const matchRecords = records.filter((record) => record.matchId === targetRecord.matchId);
        const recordIndex = matchRecords.findIndex((record) => record.id === editingRecordId);
        if (recordIndex < 0) {
            alert('没有找到要编辑的盘口记录');
            cancelEditRecord();
            return;
        }

        const handicapPrefix = getHandicapPrefixForRecord(targetRecord);
        const actualThreshold =
            targetRecord.type === 'WINNER'
                ? null
                : normalizedThreshold === ''
                  ? 0
                  : targetRecord.type === 'HANDICAP'
                    ? Number(`${handicapPrefix === '-' ? '-' : ''}${normalizedThreshold.replace(/^[+-]/, '')}`)
                    : parsedThresholdBase;
        const actualOddsRaw = normalizeUnifiedOdds(parsedOdds) ?? 0;
        const targetMatchMeta = matchLookup.get(targetRecord.matchId);
        const settledStatus = getAutoSettledStatusForRecord(targetRecord, targetMatchMeta, actualThreshold);
        const resultValue = calculateResultValueFromStake(parsedStake, settledStatus, actualOddsRaw);
        if (settledStatus === 'WIN' && resultValue === undefined) {
            alert('当前赔率无法计算盈利，请检查实盘赔率');
            return;
        }

        const nextRecords = [...matchRecords];
        nextRecords[recordIndex] = {
            ...nextRecords[recordIndex],
            resultValue,
            settledStatus,
            actualOddsRaw,
            actualOddsNormalized: normalizeUnifiedOdds(actualOddsRaw) ?? undefined,
            actualOddsFormat: detectOddsFormat(actualOddsRaw) ?? undefined,
            actualProvider: editingActualProvider.trim() || undefined,
            actualStakeAmount: parsedStake,
        };

        try {
            const saveResult = await replaceManualOddsForMatchSafe(targetRecord.matchId, nextRecords);
            if (!saveResult.success) {
                throw new Error(saveResult.error);
            }
            setRecords(await fetchManualOddsRecords());
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('manual-odds-updated'));
            }
        } catch (error) {
            console.error('save edited odds record failed', error);
            alert(`盘口记录保存失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
        cancelEditRecord();
    };

    const deleteRecord = async (record: StoredOddsResult) => {
        const confirmed = await confirmAction({
            title: '删除历史记录',
            message: '确定删除这条盘口历史记录吗？',
            tone: 'danger',
        });
        if (!confirmed) return;

        const matchRecords = records.filter((item) => item.matchId === record.matchId);
        const nextRecords = matchRecords.filter((item) => item.id !== record.id);
        try {
            const saveResult = await replaceManualOddsForMatchSafe(record.matchId, nextRecords);
            if (!saveResult.success) {
                throw new Error(saveResult.error);
            }
            setRecords(await fetchManualOddsRecords());
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('manual-odds-updated'));
            }
        } catch (error) {
            console.error('delete odds record failed', error);
            alert(`删除盘口记录失败：${error instanceof Error ? error.message : '未知错误'}`);
            return;
        }

        if (editingRecordId === record.id) {
            cancelEditRecord();
        }
    };

    const toggleRecordSelection = (id: string) => {
        setSelectedHistoryIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    };

    const toggleSelectAllPaged = () => {
        setSelectedHistoryIds((prev) => {
            if (allPagedSelected) {
                return prev.filter((id) => !pagedRecordIds.includes(id));
            }
            const merged = new Set([...prev, ...pagedRecordIds]);
            return Array.from(merged);
        });
    };

    const deleteSelectedRecords = async () => {
        if (selectedHistoryIds.length === 0) return;

        const confirmed = await confirmAction({
            title: '批量删除历史记录',
            message: `确定删除已选中的 ${selectedHistoryIds.length} 条盘口历史记录吗？此操作不可撤销。`,
            tone: 'danger',
            confirmText: '批量删除',
        });

        if (!confirmed) return;

        const ids = new Set(selectedHistoryIds);
        const recordsByMatch = new Map<string, StoredOddsResult[]>();

        for (const record of filteredTeamRecords) {
            if (!ids.has(record.id)) continue;
            const bucket = recordsByMatch.get(record.matchId) || [];
            bucket.push(record);
            recordsByMatch.set(record.matchId, bucket);
        }

        try {
            for (const [matchId, matchRecordsToDelete] of recordsByMatch.entries()) {
                const matchRecords = records.filter((record) => record.matchId === matchId);
                const deleteIdSet = new Set(matchRecordsToDelete.map((record) => record.id));
                const nextRecords = matchRecords.filter((record) => !deleteIdSet.has(record.id));
                const saveResult = await replaceManualOddsForMatchSafe(matchId, nextRecords);
                if (!saveResult.success) {
                    throw new Error(`Match ${matchId}: ${saveResult.error}`);
                }
            }
            setRecords(await fetchManualOddsRecords());
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('manual-odds-updated'));
            }
        } catch (error) {
            console.error('bulk delete odds records failed', error);
            alert(`批量删除盘口记录失败：${error instanceof Error ? error.message : '未知错误'}`);
            return;
        }
        setSelectedHistoryIds([]);
        cancelEditRecord();
    };

    const resetHistoryFilters = () => {
        setHistoryMatchId('ALL');
        setHistoryDateFrom('');
        setHistoryDateTo('');
        setHistorySort('NEWEST');
    };

    useEffect(() => {
        cancelEditRecord();
        setVisibleHistoryCount(HISTORY_PAGE_SIZE);
        setSelectedHistoryIds([]);
    }, [historyFilter, selectedTeamId]);

    useEffect(() => {
        setVisibleHistoryCount(HISTORY_PAGE_SIZE);
    }, [historyMatchId, historyDateFrom, historyDateTo, historySort]);

    useEffect(() => {
        setSelectedHistoryIds((prev) => prev.filter((id) => filteredTeamRecords.some((record) => record.id === id)));
    }, [filteredTeamRecords]);

    return (
        <div className="space-y-6">
            <div className="glass rounded-3xl border border-white/10 p-6">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">盘口统计中心</div>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">按赛区与队伍查看盘口输赢、胜率与最近 3 个大场</h1>
                        <p className="mt-2 max-w-3xl text-sm text-slate-400">
                            这里统计的是你手动录入的盘口结果。页面按队伍维度拆开，不再按两队交手混算。赔率统一按 1.x 亚洲盘口径计算：1.80=盈利80%，1.23=盈利23%，2.23=盈利123%；历史旧值 0.80 会自动按 1.80 解释。
                        </p>
                    </div>

                    <form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:min-w-[760px]">
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-400">赛区</label>
                            <select name="region" value={formRegion} onChange={(event) => { setFormRegion(event.target.value); submitFilterWithReset(event.currentTarget.form); }} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white focus:outline-none">
                                {regions.map((region) => (
                                    <option key={region.id} value={region.id}>
                                        {region.name || region.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-400">赛季</label>
                            <select name="year" value={formYear} onChange={(event) => { setFormYear(event.target.value); submitFilterWithReset(event.currentTarget.form); }} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white focus:outline-none">
                                {years.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-400">赛事</label>
                            <select name="split" value={formSplit} onChange={(event) => { setFormSplit(event.target.value); event.currentTarget.form?.requestSubmit(); }} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white focus:outline-none">
                                <option value={ALL_SPLITS_ID}>全部赛事</option>
                                {visibleFormSplits.map((split) => (
                                        <option key={split.id} value={split.id}>
                                            {split.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button type="submit" className="h-[42px] w-full rounded-xl bg-cyan-500 text-sm font-black text-slate-950 transition-all hover:bg-cyan-400">
                                刷新统计
                            </button>
                        </div>                    </form>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="队伍数量" value={String(visibleSummaries.length)} helper={`有记录队伍 ${teamsWithRecords} 支`} />
                    <StatCard label="盘口记录" value={String(totalMarkets)} helper="当前筛选下的全部录入条目" />
                    <StatCard label="总输赢" value={formatSignedNumber(totalSigned)} helper="当前筛选下全部唯一盘口记录累计" />
                    <StatCard label="最佳胜负盘胜率" value={formatWinRate(bestWinnerRate || null)} helper="当前筛选下最高单队胜负盘胜率" />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-rose-500/20 bg-rose-500/8 p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">优先加注建议</div>
                        <div className="mt-1 text-xs text-slate-400">根据历史胜率、最近 3 个大场趋势和1.x 亚洲盘赔率，优先给出更适合增加投注额的队伍盘口。</div>
                        <div className="mt-4 space-y-3">
                            {increaseRecommendations.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">当前筛选下没有足够强的加注方向。</div>
                            ) : (
                                increaseRecommendations.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-black text-white">{item.teamName} · {item.metricLabel}</div>
                                            <div className="text-xs font-black text-rose-200">{formatWinRate(item.winRate)}</div>
                                        </div>
                                        <div className="mt-2 text-sm text-rose-100/90">{item.reason}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">优先减仓建议</div>
                        <div className="mt-1 text-xs text-slate-400">根据历史低胜率、近期连输趋势和1.x 亚洲盘赔率，优先给出更应该减少投注额的队伍盘口。</div>
                        <div className="mt-4 space-y-3">
                            {decreaseRecommendations.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">当前筛选下没有明显需要减仓的方向。</div>
                            ) : (
                                decreaseRecommendations.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-black text-white">{item.teamName} · {item.metricLabel}</div>
                                            <div className="text-xs font-black text-emerald-200">{formatWinRate(item.winRate)}</div>
                                        </div>
                                        <div className="mt-2 text-sm text-emerald-100/90">{item.reason}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div className="glass rounded-3xl border border-white/10 p-4">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">队伍列表</div>
                            <div className="mt-1 text-xs text-slate-400">点击队伍查看详细盘口统计</div>
                        </div>
                        <div className="text-xs text-slate-500">{visibleSummaries.length} 支</div>
                    </div>
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="搜索队伍"
                        className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <div className="mt-3 max-h-[920px] space-y-2 overflow-y-auto pr-1">
                        {visibleSummaries.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                                当前筛选下没有盘口记录
                            </div>
                        ) : (
                            visibleSummaries.map((summary) => {
                                const active = summary.teamId === selectedTeamId;
                                const bestMetric = getBestWinRateMetric(summary);
                                const bestMetricLabel = formatBestMetricLabel(bestMetric);
                                const bestWin = bestMetric?.counter.WIN || 0;
                                const bestLose = bestMetric?.counter.LOSE || 0;
                                return (
                                    <button
                                        key={summary.teamId}
                                        type="button"
                                        onClick={() => setSelectedTeamId(summary.teamId)}
                                        className={`w-full rounded-2xl border p-3 text-left transition-all ${
                                            active
                                                ? 'border-cyan-400/50 bg-cyan-500/10 shadow-lg shadow-cyan-950/30'
                                                : 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-slate-900/60'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-black text-white">{summary.teamName}</div>
                                                <div className="mt-1 text-xs text-slate-500">盘口 {summary.totalRecords} · 大场 {summary.matchCount}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-lg font-black ${getProfitTone(summary.overallTotal)}`}>{formatSignedNumber(summary.overallTotal)}</div>
                                                <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                                                    <span className="rounded-md border border-white/10 bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">最高盘口</span>
                                                    <span className="rounded-md border border-cyan-400/35 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-black text-cyan-100">{bestMetricLabel}</span>
                                                </div>
                                                <div className="mt-1 flex items-center justify-end gap-1.5">
                                                    <CounterPill win={bestWin} lose={bestLose} compact />
                                                    <div className="text-xs font-black text-white">{formatWinRate(bestMetric?.winRate ?? null)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {selectedSummary ? (
                        <>
                            <TeamOddsSummaryCard
                                summary={selectedSummary}
                                subtitle="单队盘口统计：总输赢、胜率、最近 3 个大场结果。"
                            />

                            <div className="glass rounded-3xl border border-white/10 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">具体盘口档位</div>
                                        <div className="mt-1 text-xs text-slate-400">优先按你录入的实盘口线和统一后的 1.x 亚洲盘赔率统计，用于高精度盘口判断。</div>
                                    </div>
                                    <div className="text-xs text-slate-500">已展示 {exactMarketSummaries.length} 项</div>
                                </div>
                                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                                    {exactMarketSummaries.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-500">当前队伍还没有可用于高精度统计的具体盘口记录。</div>
                                    ) : (
                                        exactMarketSummaries.map((item) => (
                                            <div key={item.key} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="inline-flex cursor-help items-center gap-1 text-sm font-black text-white" title="这里的平均赔率、单注回报、实盘均结算，全部按 1.x 亚洲盘赔率计算；盈利倍率固定按 赔率减 1。">
                                                            <span>{item.label}</span>
                                                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[10px] font-black text-cyan-300">?</span>
                                                        </div>
                                                        <div className="mt-1 text-[11px] text-slate-500">{TEAM_METRIC_LABELS[item.metricKey]}</div>
                                                    </div>
                                                    <div className={`text-lg font-black ${item.total > 0 ? 'text-rose-300' : item.total < 0 ? 'text-emerald-300' : 'text-slate-200'}`}>{formatSignedNumber(item.total)}</div>
                                                </div>
                                                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-300">
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">胜率 {formatWinRate(item.winRate)}</div>
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">输盘率 {formatWinRate(item.lossRate)}</div>
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">平均赔率 {item.averageOdds === null ? '-' : item.averageOdds.toFixed(2)}</div>
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">单注回报 {item.expectedUnitReturn === null ? '-' : formatSignedNumber(item.expectedUnitReturn)}</div>
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">实盘均额 {item.averageStake === null ? '-' : formatAmountNumber(item.averageStake)}</div>
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">实盘均结算 {item.averageSettlement === null ? '-' : formatSignedNumber(item.averageSettlement)}</div>
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">盘口偏差 {item.averageLineDelta === null ? '-' : formatSignedNumber(item.averageLineDelta)}</div>
                                                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">样本数 {item.settledCount}</div>
                                                </div>
                                                <div className="mt-3 text-xs leading-6 text-slate-400">赢 / 输 / 走 / 待：{item.counter.WIN} / {item.counter.LOSE} / {item.counter.PUSH} / {item.counter.PENDING}</div>
                                                <div className="mt-2 text-xs leading-6 text-slate-500">最近 3 大场：{item.recentMatches.length === 0 ? '暂无' : item.recentMatches.map((recent) => `${recent.opponentName} ${formatSignedNumber(recent.total)}`).join('；')}</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="glass rounded-3xl border border-dashed border-white/10 px-6 py-20 text-center text-slate-500">
                            当前筛选下还没有可展示的队伍盘口记录。
                        </div>
                    )}

                    <div className="glass rounded-3xl border border-white/10 p-4">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">历史详细记录</div>
                                    <div className="mt-1 text-xs text-slate-400">
                                        {selectedSummary
                                            ? `当前队伍 ${selectedSummary.teamName} · 当前筛选 ${filteredTeamRecords.length} 条（总 ${typeFilteredRecords.length} 条）`
                                            : '当前没有可编辑的盘口历史记录'}
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {HISTORY_FILTER_OPTIONS.map((option) => {
                                        const active = historyFilter === option.key;
                                        return (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => setHistoryFilter(option.key)}
                                                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                                                    active
                                                        ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                                                        : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/20 hover:text-white'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        disabled={selectedHistoryIds.length === 0}
                                        onClick={deleteSelectedRecords}
                                        className="h-8 rounded-lg border border-rose-500/35 bg-rose-500/15 px-3 text-xs font-black text-rose-200 transition-all hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        批量删除（{selectedHistoryIds.length}）
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_160px_150px_150px_auto]">
                                <div>
                                    <label className="mb-1 block text-[11px] font-bold text-slate-500">大场筛选</label>
                                    <select
                                        value={historyMatchId}
                                        onChange={(event) => setHistoryMatchId(event.target.value)}
                                        className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    >
                                        <option value="ALL">全部大场</option>
                                        {historyMatchOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-bold text-slate-500">日期开始</label>
                                    <input
                                        type="date"
                                        value={historyDateFrom}
                                        onChange={(event) => setHistoryDateFrom(event.target.value)}
                                        className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-bold text-slate-500">日期结束</label>
                                    <input
                                        type="date"
                                        value={historyDateTo}
                                        onChange={(event) => setHistoryDateTo(event.target.value)}
                                        className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-bold text-slate-500">排序</label>
                                    <select
                                        value={historySort}
                                        onChange={(event) => setHistorySort(event.target.value as HistorySortKey)}
                                        className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    >
                                        <option value="NEWEST">日期从新到旧</option>
                                        <option value="OLDEST">日期从旧到新</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={resetHistoryFilters}
                                        className="h-10 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-xs font-bold text-slate-300 transition-all hover:border-white/20 hover:text-white"
                                    >
                                        清空筛选
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[1220px] text-sm text-slate-200">
                                <thead>
                                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                        <th className="px-3 py-3 text-left">
                                            <input
                                                type="checkbox"
                                                checked={allPagedSelected}
                                                onChange={toggleSelectAllPaged}
                                                className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500"
                                                title="全选当前已显示"
                                            />
                                        </th>
                                        <th className="px-3 py-3 text-left">时间</th>
                                        <th className="px-3 py-3 text-left">VS</th>
                                        <th className="px-3 py-3 text-left">场次</th>
                                        <th className="px-3 py-3 text-left">盘口</th>
                                        <th className="px-3 py-3 text-left">选项</th>
                                        <th className="px-3 py-3 text-left">结算结果</th>
                                        <th className="px-3 py-3 text-left">详细记录</th>
                                        <th className="px-3 py-3 text-left">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTeamRecords.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="px-3 py-12 text-center text-sm text-slate-500">
                                                当前筛选下没有历史盘口记录
                                            </td>
                                        </tr>
                                    ) : (
                                        pagedTeamRecords.map((record) => {
                                            const isEditing = editingRecordId === record.id;
                                            const isChecked = selectedHistoryIds.includes(record.id);
                                            const matchMeta = matchLookup.get(record.matchId);
                                            const resultValue = Number.isFinite(record.resultValue) ? (record.resultValue as number) : null;
                                            const resultClass =
                                                resultValue === null
                                                    ? 'text-slate-500'
                                                    : resultValue > 0
                                                      ? 'font-black text-rose-300'
                                                      : resultValue < 0
                                                        ? 'font-black text-emerald-300'
                                                        : 'font-black text-amber-300';

                                            return (
                                                <tr key={record.id} className="border-b border-white/5 align-top hover:bg-white/[0.02]">
                                                    <td className="px-3 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleRecordSelection(record.id)}
                                                            className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3 text-xs text-slate-400">
                                                        {formatRecordTime(matchMeta?.startTime || record.matchStartTime || record.createdAt)}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="font-bold text-white">{formatMatchLabel(record, matchMeta)}</div>
                                                        <div className="mt-1 text-[11px] text-slate-500">
                                                            {(matchMeta?.tournament || record.tournament || '-')}
                                                            {' · '}
                                                            {(matchMeta?.stage || record.stage || '未标注阶段')}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-xs font-bold text-slate-300">Game {record.gameNumber}</td>
                                                    <td className="px-3 py-3 text-xs font-bold text-cyan-300">{getRecordTypeLabel(record)}</td>
                                                    <td className="max-w-[260px] px-3 py-3 text-xs text-slate-300">
                                                        <div className="truncate font-bold" title={getSelectionLabel(record)}>
                                                            {getSelectionLabel(record)}
                                                        </div>
                                                        <div className="mt-1 text-[11px] text-slate-500">
                                                            实盘赔率：{formatActualOddsLabel(record)}
                                                            {getRecordProviderLabel(record) ? ` · ${getRecordProviderLabel(record)}` : ''}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <div className="w-[260px] space-y-2 rounded-xl border border-white/8 bg-slate-950/60 p-3">
                                                                <label className="block">
                                                                    <HelpTooltipLabel label="投注金额" tip="填写这条历史记录的实际投注金额。留空保存时按 0 处理。" />
                                                                    <input
                                                                        value={editingStakeAmount}
                                                                        onChange={(event) => setEditingStakeAmount(event.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1'))}
                                                                        placeholder="-"
                                                                        className="h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                                                                    />
                                                                </label>
                                                                <div>
                                                                    <HelpTooltipLabel label="赛果自动判定" tip="不再手动选择赢输走待。系统会根据赛果和实盘口线自动判断；如果赛果未出，则自动记为待。" />
                                                                    <div className="flex h-8 items-center justify-between rounded-lg border border-white/10 bg-slate-900 px-3 text-[11px]">
                                                                        <span className="text-slate-400">当前判定</span>
                                                                        <span className="font-black text-cyan-200">
                                                                            {getStatusLabel(
                                                                                getAutoSettledStatusForRecord(
                                                                                    record,
                                                                                    matchMeta,
                                                                                    record.type === 'WINNER'
                                                                                        ? null
                                                                                        : editingActualThreshold.trim() === ''
                                                                                          ? 0
                                                                                          : record.type === 'HANDICAP'
                                                                                            ? Number(`${(getHandicapPrefixForRecord(record) || '+') === '-' ? '-' : ''}${editingActualThreshold.replace(/^[+-]/, '')}`)
                                                                                            : Number(editingActualThreshold),
                                                                                ),
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                {record.type !== 'WINNER' ? (
                                                                    <label className="block">
                                                                        <HelpTooltipLabel label="实盘口线" tip={record.type === 'HANDICAP' ? '让方自动带 -，受让方自动带 +，你只需要填写盘口数字本体。留空保存时按 0。' : '填写这条记录实际买到的盘口线，留空保存时按 0。'} />
                                                                        <PrefixedNumericField
                                                                            prefix={record.type === 'HANDICAP' ? getHandicapPrefixForRecord(record) : undefined}
                                                                            value={editingActualThreshold}
                                                                            onChange={setEditingActualThreshold}
                                                                            placeholder="-"
                                                                        />
                                                                    </label>
                                                                ) : null}
                                                                <label className="block">
                                                                    <HelpTooltipLabel label="实盘赔率" tip="赔率统一按 1.x 亚洲盘口径录入与计算。1.80 表示盈利 80%，1.23 表示盈利 23%，2.23 表示盈利 123%。历史旧值 0.80 会按 1.80 解释。留空保存时按 0。" />
                                                                    <OddsSplitField
                                                                        wholeValue={editingActualOddsWhole}
                                                                        decimalValue={editingActualOddsDecimal}
                                                                        onWholeChange={setEditingActualOddsWhole}
                                                                        onDecimalChange={setEditingActualOddsDecimal}
                                                                        wholePlaceholder="-"
                                                                        decimalPlaceholder="--"
                                                                        className="h-9"
                                                                    />
                                                                </label>
                                                            </div>
                                                        ) : (
                                                            <div className={resultClass}>
                                                                {resultValue === null ? '未录入' : formatSignedNumber(resultValue)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="min-w-[300px] px-3 py-3">
                                                        {isEditing ? (
                                                            <div className="space-y-2 rounded-xl border border-white/8 bg-slate-950/60 p-3">
                                                                <label className="block">
                                                                    <HelpTooltipLabel label="实盘来源 / 平台" tip="记录这条历史记录来自哪个平台或场景，例如 Pinnacle、赛中、补仓等。" />
                                                                    <input
                                                                        value={editingActualProvider}
                                                                        onChange={(event) => setEditingActualProvider(event.target.value)}
                                                                        placeholder="例如 Pinnacle / 某平台"
                                                                        className="h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                                                                    />
                                                                </label>
                                                                <textarea
                                                                    rows={2}
                                                                    value={editingDetail}
                                                                    onChange={(event) => setEditingDetail(event.target.value)}
                                                                    placeholder="补充这条盘口的详细说明（可选）"
                                                                    className="w-full resize-y rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="max-w-[420px] whitespace-pre-wrap break-words text-xs text-slate-400">
                                                                {record.detail?.trim() || '-'}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={cancelEditRecord}
                                                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-slate-800 text-sm font-black text-slate-300 transition-all hover:bg-slate-700 hover:text-white"
                                                                    title="取消"
                                                                    aria-label="取消"
                                                                >
                                                                    ×
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={saveEditedRecord}
                                                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/15 text-sm font-black text-cyan-200 transition-all hover:bg-cyan-500/25"
                                                                    title="保存"
                                                                    aria-label="保存"
                                                                >
                                                                    √
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => deleteRecord(record)}
                                                                    className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-300 transition-all hover:bg-rose-500/20"
                                                                >
                                                                    删除
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditRecord(record)}
                                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-blue-600/90 text-white shadow-md shadow-blue-900/30 transition-all hover:bg-blue-500"
                                                                title="编辑这条历史记录"
                                                                aria-label="编辑这条历史记录"
                                                            >
                                                                <EditIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                            <div className="text-xs text-slate-500">
                                已显示 {pagedTeamRecords.length} / {filteredTeamRecords.length} 条，已选中 {selectedHistoryIds.length} 条
                            </div>
                            {hasMoreHistory && (
                                <button
                                    type="button"
                                    onClick={() => setVisibleHistoryCount((prev) => prev + HISTORY_PAGE_SIZE)}
                                    className="h-9 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 text-xs font-black text-cyan-200 transition-all hover:bg-cyan-500/20"
                                >
                                    加载更多
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="glass rounded-3xl border border-white/10 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">赛区队伍总表</div>
                                <div className="mt-1 text-xs text-slate-400">按队伍汇总各盘口的总输赢与胜率</div>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1280px] text-sm text-slate-200">
                                <thead>
                                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                        <th rowSpan={2} className="px-3 py-3 text-left">队伍</th>
                                        <th rowSpan={2} className="px-3 py-3 text-left">总输赢</th>
                                        <th rowSpan={2} className="px-3 py-3 text-left">胜负盘</th>
                                        <th rowSpan={2} className="px-3 py-3 text-left">让分盘</th>
                                        <th colSpan={3} className="px-3 py-3 text-left text-cyan-300">人头盘口组</th>
                                        <th colSpan={3} className="px-3 py-3 text-left text-emerald-300">时间盘口组</th>
                                    </tr>
                                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                        <th className="px-3 py-2 text-left">总盘</th>
                                        <th className="px-3 py-2 text-left">大人头</th>
                                        <th className="px-3 py-2 text-left">小人头</th>
                                        <th className="px-3 py-2 text-left">总盘</th>
                                        <th className="px-3 py-2 text-left">大时间</th>
                                        <th className="px-3 py-2 text-left">小时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleSummaries.map((summary) => (
                                        <tr key={`row-${summary.teamId}`} className="border-b border-white/5 align-top text-slate-300 hover:bg-white/[0.02]">
                                            <td className="px-3 py-3">
                                                <div className="font-black text-white">{summary.teamName}</div>
                                                <div className="mt-1 text-xs text-slate-500">盘口 {summary.totalRecords} · 大场 {summary.matchCount}</div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className={`text-base font-black ${getProfitTone(summary.overallTotal)}`}>{formatSignedNumber(summary.overallTotal)}</div>
                                            </td>
                                            {[
                                                summary.metrics.winner,
                                                summary.metrics.handicap,
                                                summary.metrics.killsAll,
                                                summary.metrics.killsOver,
                                                summary.metrics.killsUnder,
                                                summary.metrics.timeAll,
                                                summary.metrics.timeOver,
                                                summary.metrics.timeUnder,
                                            ].map((metric) => (
                                                <td key={`${summary.teamId}-${metric.key}`} className="px-3 py-3">
                                                    <SummaryMetricCell
                                                        total={metric.total}
                                                        winRate={metric.winRate}
                                                        win={metric.counter.WIN}
                                                        lose={metric.counter.LOSE}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}






























































