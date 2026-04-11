'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
    fetchStrategyRuntimeState,
    fetchStrategyScopeState,
    mergeLegacyStrategyState,
    saveStrategyRuntimeState,
    saveStrategyScopeState,
} from '@/app/strategy/state-actions';
import {
    buildDailyStrategyBoard,
    getDefaultStrategyDate,
    getStrategyDayWindow,
    getStrategyDateKeyFromIso,
    getStrategyMatchSelectionStorageKey,
    normalizeHundredAmount,
    normalizeStrategySettings,
    parseStoredMatchSelection,
    parseStoredStrategySettings,
    type StrategyAlertSnapshot,
    type StrategyScoreBreakdownItem,
    type StrategyTeamOption,
    type StrategySettings,
} from '@/lib/odds-strategy';
import { STRATEGY_STATE_DB_MIGRATION_KEY, loadLegacyStrategyStateFromStorage } from '@/lib/strategy-state';
import type { StrategyScorePresetId, StrategyScorePresetOverrides, StrategyScoreWeightsConfig } from '@/lib/config-shared';
import { formatSignedNumber, formatWinRate, TEAM_METRIC_ORDER, TEAM_METRIC_LABELS, type OddsMatchMeta, type StoredOddsResult } from '@/lib/odds-history';

export type StrategyCenterTab = 'overview' | 'alerts' | 'recommendations';

interface DailyStrategyDashboardProps {
    teams: StrategyTeamOption[];
    matches: OddsMatchMeta[];
    records: StoredOddsResult[];
    selectedRegion: string;
    activeTab?: StrategyCenterTab;
    scopeKey: string;
    strategyScoreWeights: StrategyScoreWeightsConfig;
    strategyScorePresetId?: StrategyScorePresetId;
    strategyScorePresetOverrides?: StrategyScorePresetOverrides;
}

const METRIC_KEYS = TEAM_METRIC_ORDER;

const FIELD_HELPERS: Record<'dayCutoffTime' | 'startingCapital' | 'addedCapital' | 'dailyTarget' | 'stopLine' | 'teamMarketStopLoss' | 'severeMultiplier', string> = {
    dayCutoffTime: '策略日切换时间之前的比赛，会归到前一个策略日。默认 06:00，适合把晚上开打、凌晨结束的连续 BO5 视为同一个比赛日。',
    startingCapital: '这是你当天开盘前准备投入的基础资金。系统会用 初始资金 + 追加资金 + 当日输赢，实时计算当前资金。',
    addedCapital: '如果你当天中途继续补资金，就填在这里。它会直接计入当前资金，所以允许先亏损、再补资金继续做的情况。',
    dailyTarget: '这是你当天设定的盈利目标。系统会围绕这个目标，结合已选大场、BO 小场数和盘口机会，自动拆分预算。',
    stopLine: '止损线可以为负数。只要 当前资金 = 初始资金 + 追加资金 + 当日输赢 小于等于止损线，就触发总预警。',
    teamMarketStopLoss: '这是某支队伍在某个具体盘口上的当日回撤阈值。低于这条线时，系统会提醒你立刻减仓。',
    severeMultiplier: '严重预警线 = 单队单盘口阈值 × 严重预警倍数。达到后会升级成红色覆盖预警，并同步到比赛详情页。',
};

function getAlertTone(severity: 'info' | 'warning' | 'danger') {
    if (severity === 'danger') return 'border-rose-500/35 bg-rose-500/12 text-rose-100';
    if (severity === 'warning') return 'border-amber-500/35 bg-amber-500/12 text-amber-100';
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100';
}

function getExactAllocationTone(priority: 'positive' | 'negative' | 'idle') {
    if (priority === 'positive') return 'border-rose-400/35 bg-rose-500/12';
    if (priority === 'negative') return 'border-emerald-400/35 bg-emerald-500/10';
    return 'border-white/10 bg-slate-950/65';
}

function getExactAllocationBadge(priority: 'positive' | 'negative' | 'idle') {
    if (priority === 'positive') return '今日正收益进行中';
    if (priority === 'negative') return '今日亏损进行中';
    return '今日未参与';
}

function getExactLossBadgeTone(streak: number) {
    return streak >= 3
        ? 'border-emerald-500/45 bg-emerald-600/18 text-emerald-100'
        : 'border-lime-400/40 bg-lime-500/16 text-lime-100';
}

function getExactWinBadgeTone(streak: number) {
    return streak >= 3
        ? 'border-red-500/45 bg-red-600/18 text-red-100'
        : 'border-rose-400/40 bg-rose-500/16 text-rose-100';
}

function getStrategyTone(active: boolean, recommended: boolean) {
    if (active) return 'border-cyan-300/70 bg-cyan-400/16 shadow-[0_0_0_1px_rgba(103,232,249,0.14)]';
    if (recommended) return 'border-amber-300/45 bg-amber-400/10';
    return 'border-white/10 bg-slate-950/45 hover:border-white/20 hover:bg-slate-900/60';
}

function getMetricTone(value: number) {
    if (value > 0) return 'text-rose-300';
    if (value < 0) return 'text-emerald-300';
    return 'text-slate-200';
}

function getCapitalTone() {
    return 'text-cyan-200';
}

function getStopGapTone(value: number) {
    if (value < 0) return 'text-rose-300';
    if (value <= 10000) return 'text-amber-300';
    return 'text-cyan-200';
}

function getRiskTone(level: 'low' | 'medium' | 'high') {
    if (level === 'high') return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
    if (level === 'low') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
    return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
}

function SectionTitle({ label, helper }: { label: string; helper: string }) {
    return (
        <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">{label}</div>
            <div className="mt-1 text-sm leading-6 text-slate-400">{helper}</div>
        </div>
    );
}

function formatScoreValue(value: number) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function getScoreBreakdownTone(tone: StrategyScoreBreakdownItem['tone']) {
    if (tone === 'positive') return 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100';
    if (tone === 'negative') return 'border-rose-400/20 bg-rose-500/10 text-rose-100';
    return 'border-white/10 bg-slate-900/70 text-slate-200';
}

function getScoreBreakdownBarTone(tone: StrategyScoreBreakdownItem['tone']) {
    if (tone === 'positive') return 'bg-cyan-300';
    if (tone === 'negative') return 'bg-rose-300';
    return 'bg-slate-400';
}

function getWeightSnapshotTone(value: number) {
    if (value >= 1.05) return 'border-rose-400/25 bg-rose-500/10 text-rose-100';
    if (value <= 0.95) return 'border-sky-400/25 bg-sky-500/10 text-sky-100';
    return 'border-white/10 bg-slate-900/70 text-slate-200';
}

function getSampleNoticeTone(mode: 'empty' | 'limited' | 'normal') {
    if (mode === 'empty') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    if (mode === 'limited') return 'border-sky-400/30 bg-sky-500/10 text-sky-100';
    return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
}

function formatWeightDelta(value: number) {
    const delta = value - 1;
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
}

function formatStrategyWindowLabel(dateKey: string, dayCutoffTime: string) {
    const { startMs, endMs } = getStrategyDayWindow(dateKey, dayCutoffTime);
    const start = new Date(startMs);
    const end = new Date(endMs - 1000);
    const formatDateTime = (value: Date) =>
        value.toLocaleString('zh-CN', {
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function ScoreBreakdown({ totalScore, items }: { totalScore: number; items: StrategyScoreBreakdownItem[] }) {
    const maxAbs = Math.max(...items.map((item) => Math.abs(item.value)), 0.12);

    return (
        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">分数拆解</div>
                <div className="text-xs font-black text-white">综合分 {formatScoreValue(totalScore)}</div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`rounded-lg border p-2.5 ${getScoreBreakdownTone(item.tone)}`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-bold">{item.label}</div>
                            <div className="text-xs font-black">{formatScoreValue(item.value)}</div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-white/8">
                            <div
                                className={`h-1.5 rounded-full ${getScoreBreakdownBarTone(item.tone)}`}
                                style={{ width: `${Math.max(Math.abs(item.value) / maxAbs * 100, Math.abs(item.value) > 0 ? 8 : 0)}%` }}
                            />
                        </div>
                        <div className="mt-2 text-[11px] leading-5 opacity-85">{item.detail}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SummaryCard({ label, value, helper, tone = 'text-white' }: { label: string; value: string; helper: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div className="text-xs text-slate-400">{label}</div>
            <div className={`mt-2 text-3xl font-black ${tone}`}>{value}</div>
            <div className="mt-1 text-xs text-slate-500">{helper}</div>
        </div>
    );
}

function SampleNoticeBanner({
    title,
    message,
    details,
    mode,
    stageLabel,
    nextTargetCount,
}: {
    title: string;
    message: string;
    details: string[];
    mode: 'empty' | 'limited' | 'normal';
    stageLabel: string;
    nextTargetCount: number | null;
}) {
    return (
        <div className={`rounded-3xl border p-4 ${getSampleNoticeTone(mode)}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <div className="text-sm font-black">{title}</div>
                    <div className="mt-2 text-sm leading-7 opacity-95">{message}</div>
                </div>
                <div className="rounded-full border border-current/20 bg-black/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]">
                    {mode === 'empty' ? '无样本降级模式' : mode === 'limited' ? '样本不足降级模式' : '历史样本正常'}
                </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-6 xl:grid-cols-3">
                <div className="rounded-2xl border border-current/15 bg-black/10 px-3 py-2">
                    当前样本阶段：{stageLabel}
                    {nextTargetCount !== null ? ` · 下一阶段目标 ${nextTargetCount} 条完整真实样本` : ' · 已达到稳定样本阶段'}
                </div>
                {details.map((detail, index) => (
                    <div key={`${title}-detail-${index}`} className="rounded-2xl border border-current/15 bg-black/10 px-3 py-2">
                        {detail}
                    </div>
                ))}
            </div>
        </div>
    );
}

function HoverHelpLabel({ label, helper }: { label: string; helper: string }) {
    return (
        <div className="group relative inline-flex items-center gap-1">
            <span className="text-xs font-bold text-slate-400">{label}</span>
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/35 text-[10px] font-black text-cyan-300">?</span>
            <div className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-30 hidden w-72 rounded-2xl border border-white/10 bg-slate-950/95 p-3 text-xs leading-6 text-slate-200 shadow-2xl group-hover:block">
                {helper}
            </div>
        </div>
    );
}

function normalizeMoneyFieldInput(raw: string, fallback: number) {
    const value = raw.trim();
    if (value === '') return 0;
    if (value === '-') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return normalizeHundredAmount(parsed, fallback);
}

type NumericDraftKey = 'startingCapital' | 'addedCapital' | 'dailyTarget' | 'stopLine' | 'teamMarketStopLoss' | 'severeMultiplier';

export default function DailyStrategyDashboard({ teams, matches, records, selectedRegion, activeTab = 'overview', scopeKey, strategyScoreWeights, strategyScorePresetId, strategyScorePresetOverrides }: DailyStrategyDashboardProps) {
    const dateInputRef = useRef<HTMLInputElement | null>(null);
    const fallbackDate = useMemo(() => getDefaultStrategyDate(matches), [matches]);
    const [settings, setSettings] = useState<StrategySettings>(() => parseStoredStrategySettings(null, fallbackDate));
    const [selectedStrategyId, setSelectedStrategyId] = useState<string>('balanced');
    const [dismissedCriticalKey, setDismissedCriticalKey] = useState<string>('');
    const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
    const [stateHydrated, setStateHydrated] = useState(false);
    const [loadedMatchSelectionKey, setLoadedMatchSelectionKey] = useState('');
    const [persistedMatchSelections, setPersistedMatchSelections] = useState<Record<string, string[]>>({});
    const [dayCutoffDraft, setDayCutoffDraft] = useState<string>(settings.dayCutoffTime);
    const [numericDrafts, setNumericDrafts] = useState<Record<NumericDraftKey, string>>(() => ({
        startingCapital: String(settings.startingCapital),
        addedCapital: String(settings.addedCapital),
        dailyTarget: String(settings.dailyTarget),
        stopLine: String(settings.stopLine),
        teamMarketStopLoss: String(settings.teamMarketStopLoss),
        severeMultiplier: String(settings.severeMultiplier),
    }));

    useEffect(() => {
        let cancelled = false;

        const hydrate = async () => {
            try {
                if (typeof window !== 'undefined' && window.localStorage.getItem(STRATEGY_STATE_DB_MIGRATION_KEY) !== '1') {
                    const legacyPayload = loadLegacyStrategyStateFromStorage(window.localStorage, scopeKey, fallbackDate);
                    await mergeLegacyStrategyState(scopeKey, fallbackDate, legacyPayload || {});
                    window.localStorage.setItem(STRATEGY_STATE_DB_MIGRATION_KEY, '1');
                }

                const [scopeState, runtimeState] = await Promise.all([
                    fetchStrategyScopeState(scopeKey, fallbackDate),
                    fetchStrategyRuntimeState(),
                ]);
                if (cancelled) return;

                setSettings(scopeState.settings);
                setSelectedStrategyId(scopeState.selectedStrategyId || 'balanced');
                setDismissedCriticalKey(runtimeState.dismissedCriticalKey || '');
                setPersistedMatchSelections(scopeState.matchSelections || {});
            } catch (error) {
                console.error('Failed to hydrate strategy dashboard state:', error);
                if (cancelled) return;
                setSettings(parseStoredStrategySettings(null, fallbackDate));
                setSelectedStrategyId('balanced');
                setDismissedCriticalKey('');
                setPersistedMatchSelections({});
            }
            if (!cancelled) setStateHydrated(true);
        };

        void hydrate();
        return () => {
            cancelled = true;
        };
    }, [fallbackDate, scopeKey]);

    const normalizedSettings = useMemo(() => normalizeStrategySettings(settings), [settings]);
    const strategyWindowLabel = useMemo(
        () => formatStrategyWindowLabel(normalizedSettings.dateKey, normalizedSettings.dayCutoffTime),
        [normalizedSettings.dateKey, normalizedSettings.dayCutoffTime],
    );

    useEffect(() => {
        setNumericDrafts((prev) => {
            const next: Record<NumericDraftKey, string> = {
                startingCapital: String(normalizedSettings.startingCapital),
                addedCapital: String(normalizedSettings.addedCapital),
                dailyTarget: String(normalizedSettings.dailyTarget),
                stopLine: String(normalizedSettings.stopLine),
                teamMarketStopLoss: String(normalizedSettings.teamMarketStopLoss),
                severeMultiplier: String(normalizedSettings.severeMultiplier),
            };
            return (
                prev.startingCapital === next.startingCapital &&
                prev.addedCapital === next.addedCapital &&
                prev.dailyTarget === next.dailyTarget &&
                prev.stopLine === next.stopLine &&
                prev.teamMarketStopLoss === next.teamMarketStopLoss &&
                prev.severeMultiplier === next.severeMultiplier
            )
                ? prev
                : next;
        });
    }, [
        normalizedSettings.startingCapital,
        normalizedSettings.addedCapital,
        normalizedSettings.dailyTarget,
        normalizedSettings.stopLine,
        normalizedSettings.teamMarketStopLoss,
        normalizedSettings.severeMultiplier,
    ]);

    useEffect(() => {
        setDayCutoffDraft(normalizedSettings.dayCutoffTime);
    }, [normalizedSettings.dayCutoffTime]);

    const dateMatches = useMemo(
        () => matches.filter((match) => match.startTime && normalizedSettings.dateKey === getStrategyDateKeyFromIso(match.startTime, normalizedSettings.dayCutoffTime)),
        [matches, normalizedSettings.dateKey, normalizedSettings.dayCutoffTime],
    );

    useEffect(() => {
        if (!stateHydrated) return;
        const storageKey = getStrategyMatchSelectionStorageKey(scopeKey, normalizedSettings.dateKey, normalizedSettings.dayCutoffTime);
        const stored = parseStoredMatchSelection(JSON.stringify(persistedMatchSelections[storageKey] || []));
        const validSet = new Set(dateMatches.map((match) => match.id));
        const validStored = stored.filter((id) => validSet.has(id));
        setSelectedMatchIds(validStored.length > 0 ? validStored : dateMatches.map((match) => match.id));
        setLoadedMatchSelectionKey(storageKey);
    }, [dateMatches, normalizedSettings.dateKey, normalizedSettings.dayCutoffTime, persistedMatchSelections, scopeKey, stateHydrated]);

    useEffect(() => {
        if (!stateHydrated) return;
        const storageKey = getStrategyMatchSelectionStorageKey(scopeKey, normalizedSettings.dateKey, normalizedSettings.dayCutoffTime);
        if (loadedMatchSelectionKey !== storageKey) return;
        setPersistedMatchSelections((prev) => {
            const current = prev[storageKey] || [];
            if (JSON.stringify(current) === JSON.stringify(selectedMatchIds)) return prev;
            return {
                ...prev,
                [storageKey]: selectedMatchIds,
            };
        });
    }, [loadedMatchSelectionKey, normalizedSettings.dateKey, normalizedSettings.dayCutoffTime, scopeKey, selectedMatchIds, stateHydrated]);

    useEffect(() => {
        if (!stateHydrated) return;
        const timer = window.setTimeout(() => {
            void saveStrategyScopeState(scopeKey, fallbackDate, {
                settings: normalizedSettings,
                selectedStrategyId,
                matchSelections: persistedMatchSelections,
                updatedAt: '',
            });
        }, 180);
        return () => window.clearTimeout(timer);
    }, [fallbackDate, normalizedSettings, persistedMatchSelections, scopeKey, selectedStrategyId, stateHydrated]);
    const dashboard = useMemo(
        () =>
            buildDailyStrategyBoard({
                teams,
                matches,
                records,
                selectedRegion,
                selectedMatchIds,
                settings: normalizedSettings,
                strategyScoreWeights,
                strategyScorePresetId,
                strategyScorePresetOverrides,
            }),
        [matches, normalizedSettings, records, selectedMatchIds, selectedRegion, strategyScoreWeights, teams],
    );

    useEffect(() => {
        if (!dashboard.strategies.some((item) => item.id === selectedStrategyId)) {
            setSelectedStrategyId(dashboard.recommendedStrategyId);
        }
    }, [dashboard.recommendedStrategyId, dashboard.strategies, selectedStrategyId]);

    useEffect(() => {
        const snapshot: StrategyAlertSnapshot = {
            dateKey: dashboard.dateKey,
            dayCutoffTime: dashboard.dayCutoffTime,
            selectedMatchIds,
            alerts: dashboard.alerts,
            criticalAlerts: dashboard.criticalAlerts,
            settledRecordCount: dashboard.settledRecordCount,
            updatedAt: new Date().toISOString(),
        };
        if (!stateHydrated) return;
        const timer = window.setTimeout(() => {
            void saveStrategyRuntimeState({
                dismissedCriticalKey,
                alertSnapshot: snapshot,
                updatedAt: '',
            });
            window.dispatchEvent(new Event('strategy-alerts-updated'));
        }, 180);
        return () => window.clearTimeout(timer);
    }, [dashboard.alerts, dashboard.criticalAlerts, dashboard.dateKey, dashboard.dayCutoffTime, dashboard.settledRecordCount, dismissedCriticalKey, selectedMatchIds, stateHydrated]);

    const activeStrategy = dashboard.strategies.find((item) => item.id === selectedStrategyId) || dashboard.strategies[0] || null;
    const criticalKey = `${dashboard.dateKey}:${dashboard.criticalAlerts.map((item) => item.id).join('|')}:${selectedMatchIds.join('|')}`;
    const showCriticalOverlay = activeTab === 'alerts' && dashboard.settledRecordCount > 0 && dashboard.criticalAlerts.length > 0 && dismissedCriticalKey !== criticalKey;
    const criticalOverlayStatus = dashboard.settledRecordCount <= 0 ? '未启用' : dashboard.criticalAlerts.length > 0 ? '已满足触发条件' : '未触发';
    const criticalOverlayTone =
        dashboard.settledRecordCount <= 0
            ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100'
            : dashboard.criticalAlerts.length > 0
              ? 'border-rose-500/25 bg-rose-500/10 text-rose-100'
              : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
    const marketBudgetPool = (activeStrategy?.suggestedMarketBudget || 0) * Math.max(dashboard.remainingMarketSlots, 1);

    const toggleMatchSelection = (matchId: string) => {
        setSelectedMatchIds((prev) => {
            const current = new Set(prev);
            if (current.has(matchId)) current.delete(matchId);
            else current.add(matchId);
            return Array.from(current);
        });
    };

    const updateDraft = (key: NumericDraftKey, value: string) => {
        setNumericDrafts((prev) => ({ ...prev, [key]: value }));
    };

    const commitMoneyField = (key: Exclude<NumericDraftKey, 'severeMultiplier'>) => {
        const nextValue = normalizeMoneyFieldInput(numericDrafts[key], normalizedSettings[key]);
        setSettings((prev) => ({ ...prev, [key]: nextValue }));
        setNumericDrafts((prev) => ({ ...prev, [key]: String(nextValue) }));
    };

    const commitSevereMultiplier = () => {
        const raw = numericDrafts.severeMultiplier.trim();
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
            const fallback = String(normalizedSettings.severeMultiplier);
            setNumericDrafts((prev) => ({ ...prev, severeMultiplier: fallback }));
            return;
        }
        const parsed = Number(raw);
        const nextValue = Number.isFinite(parsed) ? Math.max(parsed, 1.2) : normalizedSettings.severeMultiplier;
        setSettings((prev) => ({ ...prev, severeMultiplier: nextValue }));
        setNumericDrafts((prev) => ({ ...prev, severeMultiplier: String(nextValue) }));
    };

    const openDatePicker = () => {
        const input = dateInputRef.current;
        if (!input) return;
        input.focus();
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.click();
    };

    const commitDayCutoffTime = () => {
        const nextValue = /^(\d{1,2}):(\d{2})$/.test(dayCutoffDraft.trim()) ? dayCutoffDraft.trim() : normalizedSettings.dayCutoffTime;
        setSettings((prev) => ({ ...prev, dayCutoffTime: nextValue }));
        setDayCutoffDraft(nextValue);
    };

    return (
        <section className="relative glass rounded-[32px] border border-white/10 p-6">
            {showCriticalOverlay ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[32px] bg-rose-950/80 p-6 backdrop-blur-sm">
                    <div className="w-full max-w-3xl rounded-[28px] border border-rose-300/30 bg-[#26080d]/95 p-6 shadow-[0_20px_80px_rgba(127,29,29,0.45)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[12px] font-black uppercase tracking-[0.28em] text-rose-200">严重预警</div>
                                <h3 className="mt-2 text-3xl font-black text-white">当日风险已经达到红色警戒线</h3>
                                <p className="mt-3 text-sm leading-7 text-rose-100/90">
                                    当前已满足严重预警条件。建议先暂停继续下注，优先处理回撤，至少停止对触发预警的队伍和盘口继续加码。
                                </p>
                            </div>
                            <button type="button" onClick={() => setDismissedCriticalKey(criticalKey)} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white hover:bg-white/15">
                                暂时关闭
                            </button>
                        </div>
                        <div className="mt-5 grid grid-cols-1 gap-3">
                            {dashboard.criticalAlerts.map((alert) => (
                                <div key={alert.id} className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-rose-50">
                                    <div className="text-base font-black">{alert.title}</div>
                                    <div className="mt-2 text-sm leading-6 opacity-95">{alert.message}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">每日策略驾驶舱</div>
                    <h2 className="mt-2 text-3xl font-black tracking-tight text-white">按策略日查看输赢、资金、策略、预警与分仓建议</h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
                        默认按策略日查看连续赛程。切换时间之前的比赛会归到前一个策略日，适合把晚上开打、凌晨继续的 BO5 当成同一个比赛日管理。把鼠标悬停在参数名称旁边的问号上，可以直接查看参数解释。金额统一按百元步长录入和统计，不再处理百元以下单位。
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/8 px-4 py-2 text-xs font-bold text-cyan-100">
                        <span className="text-cyan-300">当前策略日时间窗</span>
                        <span className="text-slate-200">{strategyWindowLabel}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[1320px] xl:grid-cols-7">
                    <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-400">统计日期</span>
                        <div className="relative">
                            <input
                                ref={dateInputRef}
                                type="date"
                                value={normalizedSettings.dateKey}
                                onChange={(event) => setSettings((prev) => ({ ...prev, dateKey: event.target.value }))}
                                onClick={openDatePicker}
                                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 pr-11 text-sm text-white [color-scheme:dark] focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={openDatePicker}
                                aria-label="选择统计日期"
                                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-300 transition hover:text-white"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <rect x="3" y="4" width="14" height="13" rx="2" />
                                    <path d="M6 2.8v3.2M14 2.8v3.2M3 7.5h14" />
                                </svg>
                            </button>
                        </div>
                    </label>
                    <label className="block">
                        <div className="mb-1 block"><HoverHelpLabel label="策略日切换时间" helper={FIELD_HELPERS.dayCutoffTime} /></div>
                        <input
                            type="time"
                            step={60}
                            value={dayCutoffDraft}
                            onChange={(event) => setDayCutoffDraft(event.target.value)}
                            onBlur={commitDayCutoffTime}
                            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white [color-scheme:dark] focus:outline-none"
                        />
                    </label>
                    <label className="block">
                        <div className="mb-1 block"><HoverHelpLabel label="当日初始资金" helper={FIELD_HELPERS.startingCapital} /></div>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={numericDrafts.startingCapital}
                            onChange={(event) => updateDraft('startingCapital', event.target.value)}
                            onBlur={() => commitMoneyField('startingCapital')}
                            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white focus:outline-none"
                        />
                    </label>
                    <label className="block">
                        <div className="mb-1 block"><HoverHelpLabel label="追加资金" helper={FIELD_HELPERS.addedCapital} /></div>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={numericDrafts.addedCapital}
                            onChange={(event) => updateDraft('addedCapital', event.target.value)}
                            onBlur={() => commitMoneyField('addedCapital')}
                            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white focus:outline-none"
                        />
                    </label>
                    <label className="block">
                        <div className="mb-1 block"><HoverHelpLabel label="当日盈利目标" helper={FIELD_HELPERS.dailyTarget} /></div>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={numericDrafts.dailyTarget}
                            onChange={(event) => updateDraft('dailyTarget', event.target.value)}
                            onBlur={() => commitMoneyField('dailyTarget')}
                            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white focus:outline-none"
                        />
                    </label>
                    <label className="block">
                        <div className="mb-1 block"><HoverHelpLabel label="止损线（可负）" helper={FIELD_HELPERS.stopLine} /></div>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={numericDrafts.stopLine}
                            onChange={(event) => updateDraft('stopLine', event.target.value)}
                            onBlur={() => commitMoneyField('stopLine')}
                            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white focus:outline-none"
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <div className="mb-1 block"><HoverHelpLabel label="单队单盘口阈值" helper={FIELD_HELPERS.teamMarketStopLoss} /></div>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={numericDrafts.teamMarketStopLoss}
                                onChange={(event) => updateDraft('teamMarketStopLoss', event.target.value)}
                                onBlur={() => commitMoneyField('teamMarketStopLoss')}
                                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white focus:outline-none"
                            />
                        </label>
                        <label className="block">
                            <div className="mb-1 block"><HoverHelpLabel label="严重预警倍数" helper={FIELD_HELPERS.severeMultiplier} /></div>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={numericDrafts.severeMultiplier}
                                onChange={(event) => updateDraft('severeMultiplier', event.target.value)}
                                onBlur={commitSevereMultiplier}
                                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white focus:outline-none"
                            />
                        </label>
                    </div>
                </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <SectionTitle label="本策略日参与大场选择" helper={`默认展示当前策略日内符合赛区和赛事筛选的全部比赛。当前切换时间：${normalizedSettings.dayCutoffTime}，这个时间之前的比赛会归到前一个策略日。你可以在这里取消不参与投注的比赛，后续策略、预算和预警都会只按已选比赛计算。`} />
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setSelectedMatchIds(dateMatches.map((match) => match.id))} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-slate-300 hover:bg-white/10">全选</button>
                        <button type="button" onClick={() => setSelectedMatchIds([])} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-slate-300 hover:bg-white/10">清空</button>
                    </div>
                </div>
                <div className="mt-4">
                    {dateMatches.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-slate-500">这个策略日时间窗内没有比赛，所以不会再回退显示历史队伍。</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                            {dateMatches.map((match) => {
                                const checked = selectedMatchIds.includes(match.id);
                                return (
                                    <button key={match.id} type="button" onClick={() => toggleMatchSelection(match.id)} className={`rounded-2xl border p-4 text-left transition-all ${checked ? 'border-cyan-300/55 bg-cyan-500/10' : 'border-white/10 bg-slate-950/70 hover:border-white/20'}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-black text-white">{match.teamAName || '队伍A'} VS {match.teamBName || '队伍B'}</div>
                                                <div className="mt-1 text-xs text-slate-400">{match.format || 'BO3'} · {match.tournament || '未标记赛事'}{match.stage ? ` · ${match.stage}` : ''}</div>
                                                <div className="mt-1 text-[11px] font-bold text-cyan-300">归属策略日：{getStrategyDateKeyFromIso(match.startTime, normalizedSettings.dayCutoffTime)} · 切换 {normalizedSettings.dayCutoffTime}</div>
                                                <div className="mt-1 text-xs text-slate-500">{match.startTime ? new Date(match.startTime).toLocaleString('zh-CN', { hour12: false }) : '时间待定'}</div>
                                            </div>
                                            <div className={`rounded-full px-3 py-1 text-xs font-black ${checked ? 'bg-cyan-300 text-slate-950' : 'bg-white/5 text-slate-300'}`}>{checked ? '已参与' : '未参与'}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <SummaryCard label="当日大场数" value={String(dashboard.totalMatches)} helper={`已选 ${dashboard.selectedMatches} 场`} />
                <SummaryCard label="预计参与小场数" value={Number.isInteger(dashboard.expectedGames) ? String(dashboard.expectedGames) : dashboard.expectedGames.toFixed(1)} helper={`已录小场 ${dashboard.settledGames} · 剩余 ${Number.isInteger(dashboard.remainingGames) ? dashboard.remainingGames : dashboard.remainingGames.toFixed(1)} · 按策略日和历史参与率估算`} />
                <SummaryCard label="预计盘口手数" value={String(dashboard.expectedMarketSlots)} helper={`剩余可用盘口约 ${dashboard.remainingMarketSlots} · 按 BO 类型与盘口类型联合估算`} />
                <SummaryCard label="当日输赢" value={formatSignedNumber(dashboard.dailyTotal)} helper="输赢口径，已自动按百元统计" tone={getMetricTone(dashboard.dailyTotal)} />
                <SummaryCard label="当前资金" value={formatSignedNumber(dashboard.currentCapital)} helper={`资金口径：初始 ${dashboard.startingCapital} + 追加 ${dashboard.addedCapital}`} tone={getCapitalTone()} />
                <SummaryCard label="距离止损线余量" value={formatSignedNumber(dashboard.stopLineGap)} helper={dashboard.stopLineGap >= 0 ? '风险余量口径：尚未击穿止损线' : '风险余量口径：已击穿止损线'} tone={getStopGapTone(dashboard.stopLineGap)} />
            </div>
            {dashboard.sampleNotice.mode !== 'normal' ? (
                <div className="mt-5">
                    <SampleNoticeBanner
                        title={dashboard.sampleNotice.title}
                        message={dashboard.sampleNotice.message}
                        details={dashboard.sampleNotice.details}
                        mode={dashboard.sampleNotice.mode}
                        stageLabel={dashboard.sampleNotice.stageLabel}
                        nextTargetCount={dashboard.sampleNotice.nextTargetCount}
                    />
                </div>
            ) : null}
            {activeTab === 'overview' ? (
                <div className="mt-6 space-y-6">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(380px,0.7fr)]">
                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                            <div className="flex items-center justify-between gap-3">
                            <SectionTitle label="策略模式" helper={`算法已按已选 ${dashboard.selectedMatches} 个大场、${Number.isInteger(dashboard.expectedGames) ? dashboard.expectedGames : dashboard.expectedGames.toFixed(1)} 个预计参与小场、约 ${dashboard.expectedMarketSlots} 个盘口手数拆分预算。BO5/BO3 会先按历史真实局数均值估算，再按 BO 类型 + 盘口类型的参与率和每小场下手次数细算，同时把赔率盈亏平衡线、输盘率、单注回报和回报波动一起纳入。`} />
                                <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-100">当前推荐：{dashboard.strategies.find((item) => item.id === dashboard.recommendedStrategyId)?.label || '平衡推进'}</div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-4">
                                {dashboard.strategies.map((strategy) => {
                                    const active = strategy.id === selectedStrategyId;
                                    const recommended = strategy.id === dashboard.recommendedStrategyId;
                                    return (
                                        <button key={strategy.id} type="button" onClick={() => setSelectedStrategyId(strategy.id)} className={`rounded-2xl border p-4 text-left transition-all ${getStrategyTone(active, recommended)}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-black text-white">{strategy.label}</div>
                                                    <div className="mt-1 text-xs text-slate-400">{strategy.riskLabel}</div>
                                                </div>
                                                {recommended ? <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-black text-amber-100">推荐</span> : null}
                                            </div>
                                            <div className="mt-3 text-sm leading-6 text-slate-300">{strategy.description}</div>
                                            <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs leading-6 text-slate-300">
                                                <div>大场预算：{strategy.suggestedSeriesBudget}</div>
                                                <div>小场预算：{strategy.suggestedGameBudget}</div>
                                                <div>单盘口预算：{strategy.suggestedMarketBudget}</div>
                                                <div>建议参与大场：{strategy.suggestedMatches}</div>
                                            </div>
                                            <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3 text-xs leading-5 text-cyan-100/85">{strategy.oddsSummary}</div>
                                            <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">{strategy.riskSummary}</div>
                                            <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">算法依据</div>
                                                <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
                                                    {strategy.basisSummary.map((item, index) => (
                                                        <div key={`${strategy.id}-basis-${index}`}>{item}</div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="mt-3 text-xs leading-5 text-slate-500">{strategy.planText}</div>
                                            <div className="mt-2 text-xs leading-5 text-slate-500">{strategy.caution}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                            <SectionTitle label="当前执行方案" helper="你当前选择的方案会作为今天的默认策略，下面的盘口类型分仓也会按这个方案计算预算。" />
                            {activeStrategy ? (
                                <div className="mt-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-lg font-black text-white">{activeStrategy.label}</div>
                                            <div className="mt-1 text-xs text-cyan-100/80">{activeStrategy.riskLabel}</div>
                                        </div>
                                        <div className="rounded-full bg-slate-950/60 px-3 py-1 text-xs font-black text-cyan-100">已选方案</div>
                                    </div>
                                    <div className="mt-3 text-sm leading-7 text-slate-200">{activeStrategy.planText}</div>
                                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm leading-7 text-slate-300">{activeStrategy.caution}</div>
                                    <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3 text-xs leading-5 text-cyan-100/85">{activeStrategy.oddsSummary}</div>
                                    <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">{activeStrategy.riskSummary}</div>
                                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                                        <div className="text-sm font-black text-white">当前剩余盘口预算池</div>
                                        <div className="mt-2 text-3xl font-black text-cyan-200">{formatSignedNumber(marketBudgetPool)}</div>
                                        <div className="mt-1 text-xs text-slate-500">按已选方案的单盘口预算 × 剩余盘口机会数推算</div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                        <SectionTitle label="按盘口类型分仓" helper={dashboard.sampleNotice.mode === 'empty' ? '当前无历史投注样本，分仓结果已切换到模型降级口径，只保留队伍历史、赛程环境和风险控制作为参考。' : '把胜负 / 让分 / 大小盘 / 时间盘拆开计算预算、风险和建议仓位，并结合历史赔率门槛、低赔率占比和真实回报做修正。'} />
                        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-4">
                            {dashboard.marketTypeAllocations.map((allocation) => (
                                <div key={allocation.key} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-white">{allocation.label}</div>
                                            <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-black ${getRiskTone(allocation.riskLevel)}`}>{allocation.riskLevel === 'high' ? '高风险' : allocation.riskLevel === 'low' ? '低风险' : '中风险'}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[11px] text-slate-500">建议分仓</div>
                                            <div className="mt-2 text-xl font-black text-cyan-200">{Math.round(allocation.suggestedShare * 100)}%</div>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                                            <div className="text-[11px] text-slate-500">剩余预算</div>
                                            <div className="mt-2 text-lg font-black text-white">{formatSignedNumber(allocation.suggestedRemainingBudget)}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                                            <div className="text-[11px] text-slate-500">单盘口预算</div>
                                            <div className="mt-2 text-lg font-black text-white">{formatSignedNumber(allocation.suggestedSingleMarketBudget)}</div>
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs leading-6 text-slate-300">
                                        <div>今日输赢：{formatSignedNumber(allocation.dailyTotal)}</div>
                                        <div>历史输赢：{formatSignedNumber(allocation.historyTotal)}</div>
                                        <div>历史胜率：{formatWinRate(allocation.historyWinRate)}</div>
                                        <div>平均赔率：{allocation.averageOdds === null ? '-' : allocation.averageOdds.toFixed(2)}</div>
                                        <div>平均盈利倍率：{allocation.averagePayout === null ? '-' : allocation.averagePayout.toFixed(2)}</div>
                                        <div>盈亏平衡胜率：{formatWinRate(allocation.breakEvenWinRate)}</div>
                                        <div>单注历史回报：{allocation.expectedUnitReturn === null ? '-' : formatSignedNumber(allocation.expectedUnitReturn)}</div>
                                        <div>输盘率：{formatWinRate(allocation.lossRate)}</div>
                                        <div>回报波动：{allocation.payoutVolatility === null ? '-' : allocation.payoutVolatility.toFixed(2)}</div>
                                        <div>保守仓位系数：{allocation.conservativeKelly === null ? '-' : allocation.conservativeKelly.toFixed(3)}</div>
                                        <div>赢 / 输 / 走 / 待：{allocation.counter.WIN} / {allocation.counter.LOSE} / {allocation.counter.PUSH} / {allocation.counter.PENDING}</div>
                                        <div>低赔率占比：{Math.round(allocation.lowPayoutRate * 100)}%</div>
                                        <div>预计盘口手数：{allocation.projectedExpectedMarkets}</div>
                                        <div>已录盘口手数：{allocation.recordedMarkets}</div>
                                        <div>剩余盘口手数：{allocation.remainingMarkets}</div>
                                        <div>建议盘口数：{allocation.suggestedMarkets}</div>
                                        <div>子层预设：{allocation.presetSourceLabel} · {allocation.presetLabel}</div>
                                        {allocation.modelSummary ? <div>模型口径：{allocation.modelSummary}</div> : null}
                                    </div>
                                    <div className="mt-3 text-xs leading-5 text-slate-400">{allocation.riskText}</div>
                                    <div className="mt-2 rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3 text-xs leading-5 text-cyan-100/85">
                                        {allocation.presetDetail}
                                    </div>
                                    <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">当前权重快照</div>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                                            {allocation.weightSnapshot.map((item) => (
                                                <div key={`${allocation.key}-weight-${item.label}`} className={`rounded-lg border px-3 py-2 ${getWeightSnapshotTone(item.value)}`}>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-[11px] opacity-75">{item.label}</div>
                                                        <div className="text-[10px] font-black opacity-80">相对默认 {formatWeightDelta(item.value)}</div>
                                                    </div>
                                                    <div className="mt-1 font-black">{item.value.toFixed(2)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <ScoreBreakdown totalScore={allocation.totalScore} items={allocation.scoreBreakdown} />
                                    <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">算法依据</div>
                                        <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
                                            {allocation.basisSummary.map((item, index) => (
                                                <div key={`${allocation.key}-basis-${index}`}>{item}</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <SectionTitle label="按赛区 / 队伍 / 盘口查看当日表现" helper="每个盘口都能看到当日输赢、历史胜率与最近 3 个大场趋势。这里只展示你已选大场里的队伍。" />
                            <div className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-black text-slate-300">策略日：{dashboard.dateKey} · 切换 {dashboard.dayCutoffTime}</div>
                        </div>
                        <div className="mt-4 space-y-4">
                            {dashboard.regionBoards.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-slate-500">当前日期下还没有已选大场对应的赛区队伍数据。</div> : dashboard.regionBoards.map((regionBoard) => (
                                <div key={regionBoard.region} className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                                    <div className="text-lg font-black text-white">{regionBoard.region}</div>
                                    <div className="mt-4 space-y-4">
                                        {regionBoard.teams.map((team) => (
                                            <div key={team.teamId} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                                    <div>
                                                        <div className="text-xl font-black text-white">{team.teamName}</div>
                                                        <div className="mt-1 text-sm text-slate-400">已选大场 {team.todayMatchCount} · 当日盘口 {team.dailySummary.totalRecords} · 历史盘口 {team.historySummary.totalRecords}</div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                                        <SummaryCard label="当日输赢" value={formatSignedNumber(team.dailySummary.overallTotal)} helper="今日累计" tone={getMetricTone(team.dailySummary.overallTotal)} />
                                                        <SummaryCard label="历史总输赢" value={formatSignedNumber(team.historySummary.overallTotal)} helper="历史累计" tone={getMetricTone(team.historySummary.overallTotal)} />
                                                        <SummaryCard label="胜负盘胜率" value={formatWinRate(team.historySummary.metrics.winner.winRate)} helper="历史口径" />
                                                        <SummaryCard label="让分盘胜率" value={formatWinRate(team.historySummary.metrics.handicap.winRate)} helper="历史口径" />
                                                    </div>
                                                </div>
                                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
                                                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3">
                                                        <div className="text-[11px] text-slate-500">大场历史胜率</div>
                                                        <div className="mt-2 text-xl font-black text-cyan-100">{formatWinRate(team.performance.seriesWinRate)}</div>
                                                        <div className="mt-1 text-xs text-slate-400">样本 {team.performance.seriesCount} 场 · 胜 {team.performance.seriesWins} 场 · 加权 {formatWinRate(team.performance.weightedSeriesWinRate)}</div>
                                                    </div>
                                                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3">
                                                        <div className="text-[11px] text-slate-500">近 5 场大场状态</div>
                                                        <div className="mt-2 text-xl font-black text-cyan-100">{formatWinRate(team.performance.recentSeriesWinRate)}</div>
                                                        <div className="mt-1 text-xs text-slate-400">
                                                            {team.performance.recentStreakType ? `当前 ${team.performance.recentStreakType === 'WIN' ? '连胜' : '连败'} ${team.performance.recentStreakCount} 场` : '暂无连胜连败'} · 样本 {team.performance.recentSeriesCount} 场
                                                        </div>
                                                    </div>
                                                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3">
                                                        <div className="text-[11px] text-slate-500">分格式胜率</div>
                                                        <div className="mt-2 text-sm font-black text-cyan-100">BO1 {formatWinRate(team.performance.bo1SeriesWinRate)} · BO3 {formatWinRate(team.performance.bo3SeriesWinRate)} · BO5 {formatWinRate(team.performance.bo5SeriesWinRate)}</div>
                                                        <div className="mt-1 text-xs text-slate-400">
                                                            平均打满局数 {team.performance.avgSeriesGames === null ? '-' : team.performance.avgSeriesGames.toFixed(1)} · 同赛事加权 {formatWinRate(team.performance.sameEventWeightedWinRate)}
                                                        </div>
                                                    </div>
                                                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3">
                                                        <div className="text-[11px] text-slate-500">今日对手历史交手</div>
                                                        <div className="mt-2 text-xl font-black text-cyan-100">{formatWinRate(team.performance.headToHeadWinRate)}</div>
                                                        <div className="mt-1 text-xs text-slate-400">
                                                            {team.performance.opponentName ? `${team.performance.opponentName} · ` : ''}样本 {team.performance.headToHeadCount} 场 · 胜 {team.performance.headToHeadWins} 场
                                                        </div>
                                                    </div>
                                                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3">
                                                        <div className="text-[11px] text-slate-500">本场节奏预估</div>
                                                        <div className="mt-2 text-sm font-black text-cyan-100">
                                                            {team.performance.expectedMatchKills === null ? '-' : `${team.performance.expectedMatchKills} 击杀`} · {team.performance.expectedMatchDurationSec === null ? '-' : `${Math.round(team.performance.expectedMatchDurationSec / 60)} 分钟`}
                                                        </div>
                                                        <div className="mt-1 text-xs text-slate-400">
                                                            相似对手加权 {formatWinRate(team.performance.similarOpponentWeightedWinRate)} · 置信 {team.performance.confidenceScore === null ? '-' : `${team.performance.confidenceScore}%`} · 波动 {team.performance.volatilityScore === null ? '-' : team.performance.volatilityScore.toFixed(2)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
                                                    {METRIC_KEYS.map((metricKey) => {
                                                        const dailyMetric = team.dailySummary.metrics[metricKey];
                                                        const historyMetric = team.historySummary.metrics[metricKey];
                                                        return (
                                                            <div key={`${team.teamId}-${metricKey}`} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div>
                                                                        <div className="text-sm font-black text-white">{TEAM_METRIC_LABELS[metricKey]}</div>
                                                                        <div className={`mt-2 text-xl font-black ${getMetricTone(dailyMetric.total)}`}>{formatSignedNumber(dailyMetric.total)}</div>
                                                                        <div className="mt-1 text-xs text-slate-500">当日输赢</div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className="text-[11px] text-slate-500">历史胜率</div>
                                                                        <div className="mt-2 text-lg font-black text-white">{formatWinRate(historyMetric.winRate)}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs leading-6 text-slate-300">
                                                                    <div>赢 / 输 / 走 / 待：{historyMetric.counter.WIN} / {historyMetric.counter.LOSE} / {historyMetric.counter.PUSH} / {historyMetric.counter.PENDING}</div>
                                                                    <div>历史总输赢：{formatSignedNumber(historyMetric.total)}</div>
                                                                    <div>最近 3 大场：{historyMetric.recentMatches.length === 0 ? '暂无' : historyMetric.recentMatches.map((item) => `${item.opponentName} ${formatSignedNumber(item.total)}`).join('；')}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
            {activeTab === 'alerts' ? (
                <div className="mt-6 space-y-4">
                    <div className={`rounded-3xl border p-4 ${criticalOverlayTone}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-[12px] font-black uppercase tracking-[0.22em] opacity-80">严重弹窗状态</div>
                                <div className="mt-2 text-lg font-black">{criticalOverlayStatus}</div>
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm">
                                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                                    <div className="text-[11px] opacity-70">当前已结算记录</div>
                                    <div className="mt-1 text-base font-black">{dashboard.settledRecordCount} 条</div>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                                    <div className="text-[11px] opacity-70">严重级预警</div>
                                    <div className="mt-1 text-base font-black">{dashboard.criticalAlerts.length} 条</div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 text-sm leading-6 opacity-90">
                            {dashboard.settledRecordCount <= 0
                                ? '今天还没有已结算记录，所以即使参数阈值存在，也不会触发比赛页严重红色覆盖层。'
                                : dashboard.criticalAlerts.length > 0
                                  ? '当前已满足严重弹窗条件：当日已结算记录至少 1 条，且存在 danger 级预警。'
                                  : '当前已有已结算记录，但还没有达到 danger 级风险阈值，所以不会触发比赛页严重弹窗。'}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                        <SectionTitle label="风险预警" helper="当日资金止损、按盘口类型分仓回撤、单队单盘口回撤都会在这里集中提醒。达到严重线时会触发红色覆盖层；但只有当日已结算记录至少 1 条时，严重弹窗才会真正出现。" />
                        <div className="mt-4 grid grid-cols-1 gap-3">
                            {dashboard.alerts.map((alert) => (
                                <div key={alert.id} className={`rounded-2xl border p-4 ${getAlertTone(alert.severity)}`}>
                                    <div className="text-base font-black">{alert.title}</div>
                                    <div className="mt-2 text-sm leading-6 opacity-95">{alert.message}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {activeTab === 'recommendations' ? (
                <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                        <SectionTitle label="优先加注建议" helper="根据历史胜率和最近 3 个大场趋势，优先给出更值得加仓的队伍盘口。" />
                        <div className="mt-4 space-y-3">
                            {dashboard.recommendations.increase.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">{dashboard.sampleNotice.mode === 'empty' ? '当前没有历史投注样本，优先加注建议已暂停输出，先观察真实数据积累。' : '当前没有足够强的加注建议。'}</div> : dashboard.recommendations.increase.map((item) => (
                                <div key={item.id} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-black text-white">{item.teamName} · {item.metricLabel}</div>
                                        <div className="text-xs font-black text-rose-200">{item.region}</div>
                                    </div>
                                            <div className="mt-2 text-sm text-rose-100/90">{item.reason}</div>
                                            {(item.averageOdds !== null && item.averageOdds !== undefined) || (item.expectedUnitReturn !== null && item.expectedUnitReturn !== undefined) ? (
                                                <div className="mt-2 text-xs text-rose-100/70">
                                            平均赔率 {item.averageOdds?.toFixed(2) || '-'} · 盈亏平衡胜率 {formatWinRate(item.breakEvenWinRate ?? null)} · 单注历史回报 {item.expectedUnitReturn === null || item.expectedUnitReturn === undefined ? '-' : formatSignedNumber(item.expectedUnitReturn)} · 输盘率 {formatWinRate(item.lossRate ?? null)} · 回报波动 {item.payoutVolatility?.toFixed(2) || '-'}
                                                </div>
                                            ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                            <SectionTitle label="优先减仓建议" helper="根据历史低胜率与近期连输趋势，优先提醒你减少风险暴露。" />
                            <div className="mt-4 space-y-3">
                                {dashboard.recommendations.decrease.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">{dashboard.sampleNotice.mode === 'empty' ? '当前没有历史投注样本，优先减仓建议已暂停输出，避免在空样本上误判风险。' : '当前没有明显需要减仓的盘口。'}</div> : dashboard.recommendations.decrease.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-black text-white">{item.teamName} · {item.metricLabel}</div>
                                            <div className="text-xs font-black text-emerald-200">{item.region}</div>
                                        </div>
                                        <div className="mt-2 text-sm text-emerald-100/90">{item.reason}</div>
                                        {(item.averageOdds !== null && item.averageOdds !== undefined) || (item.expectedUnitReturn !== null && item.expectedUnitReturn !== undefined) ? (
                                            <div className="mt-2 text-xs text-emerald-100/70">
                                                平均赔率 {item.averageOdds?.toFixed(2) || '-'} · 盈亏平衡胜率 {formatWinRate(item.breakEvenWinRate ?? null)} · 单注历史回报 {item.expectedUnitReturn === null || item.expectedUnitReturn === undefined ? '-' : formatSignedNumber(item.expectedUnitReturn)} · 输盘率 {formatWinRate(item.lossRate ?? null)} · 回报波动 {item.payoutVolatility?.toFixed(2) || '-'}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                            <SectionTitle label="具体盘口加注建议" helper="把建议细化到具体盘口档位，例如小于30、小于31、-3.5、+7.5，不再只停留在盘口类型。" />
                            <div className="mt-4 space-y-3">
                                {dashboard.recommendations.exactIncrease.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">{dashboard.sampleNotice.mode === 'empty' ? '当前没有历史投注样本，具体盘口加注建议已关闭，等真实样本积累后再启用。' : '当前没有足够强的具体盘口加注建议。'}</div> : dashboard.recommendations.exactIncrease.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-black text-white">{item.teamName} · {item.marketLabel}</div>
                                            <div className="text-xs font-black text-rose-200">{item.region}</div>
                                        </div>
                                        <div className="mt-2 text-sm text-rose-100/90">{item.reason}</div>
                                        <div className="mt-2 text-xs text-rose-100/70">
                                            类型 {item.metricLabel} · 平均赔率 {item.averageOdds?.toFixed(2) || '-'} · 单注历史回报 {item.expectedUnitReturn === null || item.expectedUnitReturn === undefined ? '-' : formatSignedNumber(item.expectedUnitReturn)} · 胜率 {formatWinRate(item.winRate ?? null)} · 输盘率 {formatWinRate(item.lossRate ?? null)} · 样本 {item.sampleCount}
                                        </div>
                                        <ScoreBreakdown totalScore={item.totalScore} items={item.scoreBreakdown} />
                                        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">算法依据</div>
                                            <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
                                                {item.basisSummary.map((basis, index) => (
                                                    <div key={`${item.id}-basis-${index}`}>{basis}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                            <SectionTitle label="具体盘口减仓建议" helper="如果某个具体盘口线长期回报差、输盘率高，就直接对这个盘口档位减仓，而不是整类盘口一起砍。" />
                            <div className="mt-4 space-y-3">
                                {dashboard.recommendations.exactDecrease.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">{dashboard.sampleNotice.mode === 'empty' ? '当前没有历史投注样本，具体盘口减仓建议已关闭，避免在空样本上放大噪声。' : '当前没有明显需要减仓的具体盘口。'}</div> : dashboard.recommendations.exactDecrease.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-black text-white">{item.teamName} · {item.marketLabel}</div>
                                            <div className="text-xs font-black text-emerald-200">{item.region}</div>
                                        </div>
                                        <div className="mt-2 text-sm text-emerald-100/90">{item.reason}</div>
                                        <div className="mt-2 text-xs text-emerald-100/70">
                                            类型 {item.metricLabel} · 平均赔率 {item.averageOdds?.toFixed(2) || '-'} · 单注历史回报 {item.expectedUnitReturn === null || item.expectedUnitReturn === undefined ? '-' : formatSignedNumber(item.expectedUnitReturn)} · 胜率 {formatWinRate(item.winRate ?? null)} · 输盘率 {formatWinRate(item.lossRate ?? null)} · 样本 {item.sampleCount}
                                        </div>
                                        <ScoreBreakdown totalScore={item.totalScore} items={item.scoreBreakdown} />
                                        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">算法依据</div>
                                            <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
                                                {item.basisSummary.map((basis, index) => (
                                                    <div key={`${item.id}-basis-${index}`}>{basis}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                            <SectionTitle label="具体盘口预算分配" helper="把各盘口类型的预算池再细分到具体盘口档位，例如小于30、小于31、+7.5、-3.5。这里展示的是当前最值得拿预算的具体盘口。"/>
                            <div className="mt-4 space-y-3">
                                {dashboard.exactMarketAllocations.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">{dashboard.sampleNotice.mode === 'empty' ? '当前没有历史投注样本，具体盘口预算细分已关闭，只保留盘口类型分仓作为参考。' : '当前还没有足够的具体盘口样本来做预算细分。'}</div> : dashboard.exactMarketAllocations.map((item) => (
                                    <div key={item.id} className={`rounded-2xl border p-4 ${getExactAllocationTone(item.livePriority)}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-black text-white">{item.teamName} · {item.marketLabel}</div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-xs font-black text-cyan-200">{item.region}</div>
                                                {item.todayWinStreak >= 2 ? (
                                                    <div className={`rounded-full border px-2 py-1 text-[10px] font-black ${getExactWinBadgeTone(item.todayWinStreak)}`}>
                                                        连赢 {item.todayWinStreak}
                                                    </div>
                                                ) : null}
                                                {item.todayLossStreak >= 2 ? (
                                                    <div className={`rounded-full border px-2 py-1 text-[10px] font-black ${getExactLossBadgeTone(item.todayLossStreak)}`}>
                                                        连亏 {item.todayLossStreak}
                                                    </div>
                                                ) : null}
                                                <div className="rounded-full bg-slate-950/70 px-2 py-1 text-[10px] font-black text-white">{getExactAllocationBadge(item.livePriority)}</div>
                                            </div>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-cyan-100/80 md:grid-cols-4">
                                            <div>建议分仓 {Math.round(item.suggestedShare * 100)}%</div>
                                            <div>建议预算 {formatSignedNumber(item.suggestedBudget)}</div>
                                            <div>建议手数 {item.suggestedHands}</div>
                                            <div>单手预算 {formatSignedNumber(item.suggestedSingleStake)}</div>
                                        </div>
                                        <div className="mt-2 text-xs text-cyan-100/70">
                                            类型 {item.metricLabel} · 平均赔率 {item.averageOdds?.toFixed(2) || '-'} · 单注历史回报 {item.expectedUnitReturn === null || item.expectedUnitReturn === undefined ? '-' : formatSignedNumber(item.expectedUnitReturn)} · 胜率 {formatWinRate(item.winRate ?? null)} · 输盘率 {formatWinRate(item.lossRate ?? null)} · 样本 {item.sampleCount}
                                        </div>
                                        <div className="mt-1 text-xs text-cyan-100/70">
                                            今日已录 {item.todayRecordedHands} 手 · 今日输赢 {formatSignedNumber(item.todayRecordedTotal)} · 连续盈利 {item.todayWinStreak} 手 · 连续亏损 {item.todayLossStreak} 手
                                        </div>
                                        <div className="mt-2 text-sm text-cyan-100/90">{item.reason}</div>
                                        <ScoreBreakdown totalScore={item.totalScore} items={item.scoreBreakdown} />
                                        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">算法依据</div>
                                            <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
                                                {item.basisSummary.map((basis, index) => (
                                                    <div key={`${item.id}-basis-${index}`}>{basis}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                            <SectionTitle label="当前执行方案" helper="在建议页签里继续保留当前策略，方便你边看建议边调整。" />
                            {activeStrategy ? (
                                <div className="mt-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4">
                                    <div className="text-lg font-black text-white">{activeStrategy.label}</div>
                                    <div className="mt-3 text-sm leading-7 text-slate-200">{activeStrategy.planText}</div>
                                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm leading-7 text-slate-300">{activeStrategy.caution}</div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}



