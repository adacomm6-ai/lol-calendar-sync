'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useMemo, useState } from 'react';

import { fetchManualOddsRecords, mergeLegacyManualOddsRecords } from '@/app/manual-odds/actions';
import { MAJOR3_REGION_ID, type RegionConfig, type SplitConfig, type StrategyScorePresetId, type StrategyScorePresetOverrides, type StrategyScoreWeightsConfig } from '@/lib/config-shared';
import { LEGACY_MANUAL_ODDS_MIGRATION_KEY, loadAllLegacyStoredOdds, type OddsMatchMeta, type StoredOddsResult } from '@/lib/odds-history';
import type { StrategyCenterTab } from '@/components/analysis/DailyStrategyDashboard';
import { clearStrategyStorageState } from '@/lib/odds-strategy';

interface TeamOption {
    id: string;
    name: string;
    shortName?: string | null;
    region?: string | null;
    logo?: string | null;
}

interface StrategyCenterClientProps {
    teams: TeamOption[];
    matches: OddsMatchMeta[];
    regions: RegionConfig[];
    years: string[];
    splits: SplitConfig[];
    allSplits: SplitConfig[];
    strategyScoreWeights: StrategyScoreWeightsConfig;
    strategyScorePresetId: StrategyScorePresetId | undefined;
    strategyScorePresetOverrides: StrategyScorePresetOverrides | undefined;
    selectedRegion: string;
    selectedYear: string;
    selectedSplit: string;
}

const ALL_SPLITS_ID = '__ALL_SPLITS__';
function normalizeStrategyRegionSelection(region?: string | null) {
    const upper = String(region || '').trim().toUpperCase();
    return upper === 'LEC' ? 'OTHER' : String(region || '');
}
const STRATEGY_MAJOR_SCOPE = ['LPL', 'LCK', 'LEC', 'WORLDS'];

function splitLooksLikeWorlds(split: SplitConfig) {
    const text = `${split.id || ''} ${split.name || ''} ${split.mapping || ''}`.toUpperCase();
    return text.includes('WORLDS') || text.includes('WORLD') || text.includes('MSI') || text.includes('FIRST STAND') || text.includes('全球先锋赛') || text.includes('全球总决赛');
}

function splitLooksLikeLec(split: SplitConfig) {
    const text = `${split.id || ''} ${split.name || ''} ${split.mapping || ''}`.toUpperCase();
    return text.includes('LEC');
}

function splitBelongsToStrategyRegion(split: SplitConfig, selectedRegion: string) {
    if (selectedRegion === 'ALL') return true;
    const regions = (split.regions || []).map((item) => String(item || '').trim().toUpperCase());

    if (selectedRegion === MAJOR3_REGION_ID) {
        return splitLooksLikeWorlds(split) || regions.some((region) => STRATEGY_MAJOR_SCOPE.includes(region)) || splitLooksLikeLec(split);
    }

    if (selectedRegion === 'WORLDS') {
        return splitLooksLikeWorlds(split) || regions.includes('WORLDS');
    }

    if (selectedRegion === 'OTHER') {
        if (splitLooksLikeWorlds(split) || regions.includes('WORLDS')) return false;
        if (!regions.length) return !splitLooksLikeWorlds(split);
        return regions.includes('OTHER') || regions.includes('LEC') || splitLooksLikeLec(split);
    }

    if (!regions.length) return true;
    return regions.includes(selectedRegion);
}

const DailyStrategyDashboard = dynamic(() => import('@/components/analysis/DailyStrategyDashboard'), {
    ssr: false,
    loading: () => (
        <div className="glass rounded-[32px] border border-white/10 p-8">
            <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/45 text-sm font-bold text-slate-400">
                加载策略数据...
            </div>
        </div>
    ),
});

const TAB_OPTIONS: Array<{ id: StrategyCenterTab; label: string; helper: string; icon: string }> = [
    { id: 'overview', label: '\u6bcf\u65e5\u603b\u89c8', helper: '\u67e5\u770b\u5f53\u5929\u8f93\u8d62\u3001\u7b56\u7565\u6a21\u5f0f\u548c\u5168\u91cf\u76d8\u53e3\u8868\u73b0\u3002', icon: '\u603b' },
    { id: 'alerts', label: '\u98ce\u9669\u9884\u8b66', helper: '\u96c6\u4e2d\u770b\u6b62\u635f\u9884\u8b66\u3001\u8fde\u7eed\u8f93\u76d8\u548c\u98ce\u9669\u76d8\u53e3\u3002', icon: '\u8b66' },
    { id: 'recommendations', label: '\u52a0\u51cf\u6ce8\u5efa\u8bae', helper: '\u96c6\u4e2d\u770b\u4f18\u5148\u52a0\u6ce8\u4e0e\u4f18\u5148\u51cf\u4ed3\u7684\u961f\u4f0d\u76d8\u53e3\u3002', icon: '\u7b56' },
];

class StrategyDashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: unknown) {
        console.error('Strategy dashboard render failed:', error);
    }

    private handleReset = () => {
        if (typeof window === 'undefined') return;
        clearStrategyStorageState(window.localStorage);
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <div className="glass rounded-[32px] border border-rose-400/25 bg-rose-950/20 p-8">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-300">策略中心异常</div>
                <h2 className="mt-3 text-2xl font-black text-white">策略中心缓存异常，已进入安全恢复模式</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                    这通常是旧版本地缓存和新版策略中心结构不兼容导致的。点击下面的按钮会清理旧缓存并重新加载策略中心，不会影响你已经保存的比赛与盘口数据。
                </p>
                <div className="mt-5">
                    <button type="button" onClick={this.handleReset} className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400">
                        清理旧缓存并重载策略中心
                    </button>
                </div>
            </div>
        );
    }
}

export default function StrategyCenterClient({
    teams,
    matches,
    regions,
    years,
    splits,
    allSplits,
    strategyScoreWeights,
    strategyScorePresetId,
    strategyScorePresetOverrides,
    selectedRegion,
    selectedYear,
    selectedSplit,
}: StrategyCenterClientProps) {
    const [records, setRecords] = useState<StoredOddsResult[]>([]);
    const [activeTab, setActiveTab] = useState<StrategyCenterTab>('overview');
    const [formRegion, setFormRegion] = useState(selectedRegion);
    const [formYear, setFormYear] = useState(selectedYear);
    const [formSplit, setFormSplit] = useState(selectedSplit);

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
                console.error('reload strategy center odds failed', error);
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
        setFormRegion(selectedRegion);
        setFormYear(selectedYear);
        setFormSplit(selectedSplit);
    }, [selectedRegion, selectedYear, selectedSplit]);

    const visibleSplits = useMemo(() => {
        return allSplits.filter((split) => splitBelongsToStrategyRegion(split, normalizeStrategyRegionSelection(formRegion)));
    }, [allSplits, formRegion]);

    useEffect(() => {
        if (formSplit === ALL_SPLITS_ID) return;
        if (visibleSplits.some((split) => split.id === formSplit)) return;
        setFormSplit(ALL_SPLITS_ID);
    }, [formSplit, visibleSplits]);

    return (
        <div className="space-y-6">
            <div className="glass rounded-3xl border border-white/10 p-6">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">策略中心</div>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">按每天、赛区、队伍和盘口管理你的输赢策略</h1>
                        <p className="mt-2 max-w-3xl text-sm text-slate-400">
                            这里专门用于看每日输赢、设定盈利目标、选择策略模式、查看止损预警和加减注建议，不再和盘口统计混在一起。
                        </p>
                    </div>

                    <form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:min-w-[760px]">
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-400">赛区</label>
                            <select name="region" value={formRegion} onChange={(event) => setFormRegion(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white focus:outline-none">
                                {regions.map((region) => (
                                    <option key={region.id} value={region.id}>
                                        {region.name || region.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-400">赛季</label>
                            <select name="year" value={formYear} onChange={(event) => setFormYear(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white focus:outline-none">
                                {years.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-400">赛事</label>
                            <select name="split" value={formSplit} onChange={(event) => setFormSplit(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white focus:outline-none">
                                <option value={ALL_SPLITS_ID}>全部赛事</option>
                                {visibleSplits.map((split) => (
                                        <option key={split.id} value={split.id}>
                                            {split.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button type="submit" className="h-[42px] w-full rounded-xl bg-cyan-500 text-sm font-black text-slate-950 transition-all hover:bg-cyan-400">
                                刷新策略中心
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="glass rounded-3xl border border-white/10 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">{'\u4e2d\u5fc3\u9875\u7b7e'}</div>
                        <div className="mt-1 text-sm text-slate-400">{'\u628a\u7b56\u7565\u4e2d\u5fc3\u62c6\u6210 3 \u4e2a\u9875\u7b7e\uff0c\u5206\u522b\u5904\u7406\u603b\u89c8\u3001\u98ce\u9669\u9884\u8b66\u548c\u52a0\u51cf\u6ce8\u5efa\u8bae\u3002'}</div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:min-w-[860px]">
                        {TAB_OPTIONS.map((tab) => {
                            const active = tab.id === activeTab;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`rounded-[22px] border px-4 py-4 text-left transition-all ${active ? 'border-cyan-300/60 bg-gradient-to-br from-cyan-400/18 to-blue-500/12 text-cyan-50 shadow-[0_12px_40px_rgba(34,211,238,0.18)]' : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20 hover:text-white'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-black ${active ? 'border-cyan-200/60 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-white/5 text-slate-300'}`}>{tab.icon}</div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-black">{tab.label}</div>
                                            <div className="mt-1 text-xs leading-5 text-slate-400">{tab.helper}</div>
                                        </div>
                                    </div>
                                    <div className={`mt-4 h-1.5 rounded-full ${active ? 'bg-cyan-300/80' : 'bg-white/5'}`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <StrategyDashboardErrorBoundary>
                <DailyStrategyDashboard teams={teams} matches={matches} records={records} selectedRegion={selectedRegion} activeTab={activeTab} scopeKey={`${selectedRegion}:${selectedYear}:${selectedSplit}`} strategyScoreWeights={strategyScoreWeights} strategyScorePresetId={strategyScorePresetId} strategyScorePresetOverrides={strategyScorePresetOverrides} />
            </StrategyDashboardErrorBoundary>
        </div>
    );
}









