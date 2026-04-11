'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { updateSettings } from './actions';
import {
    DEFAULT_STRATEGY_SCORE_WEIGHTS,
    getStrategyScorePresetById,
    normalizeStrategyScorePresetId,
    normalizeStrategyScorePresetOverrides,
    normalizeStrategyScoreWeights,
    STRATEGY_SCORE_PRESETS,
    type MatchStageOption,
    type RegionConfig,
    type SplitConfig,
    type StrategyMarketTypeKey,
    type StrategyScorePresetId,
    type StrategyScorePresetOverrides,
    type StrategyScoreWeightsConfig,
    type SystemConfigData,
} from '@/lib/config-shared';

const MARKET_PRESET_LABELS: Record<StrategyMarketTypeKey, string> = {
    winner: '胜负盘',
    handicap: '让分盘',
    kills: '大小盘',
    time: '时间盘',
};

function getWeightDeltaTone(value: number, fallback = 1) {
    if (value >= fallback + 0.05) return 'border-rose-200 bg-rose-50 text-rose-700';
    if (value <= fallback - 0.05) return 'border-sky-200 bg-sky-50 text-sky-700';
    return 'border-gray-200 bg-gray-50 text-gray-600';
}

function formatWeightDelta(value: number, fallback = 1) {
    const delta = value - fallback;
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
}

function normalizeEditableConfig(source: SystemConfigData): SystemConfigData {
    return {
        ...source,
        strategyScoreWeights: normalizeStrategyScoreWeights(source.strategyScoreWeights),
        strategyScorePresetId: normalizeStrategyScorePresetId(source.strategyScorePresetId),
        strategyScorePresetOverrides: normalizeStrategyScorePresetOverrides(source.strategyScorePresetOverrides),
    };
}

export default function ConfigEditorClient({ initialConfig }: { initialConfig: SystemConfigData }) {
    const router = useRouter();
    const [config, setConfig] = useState<SystemConfigData>(() => normalizeEditableConfig(initialConfig));
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        setConfig(normalizeEditableConfig(initialConfig));
    }, [initialConfig]);

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await updateSettings(config);
            if (res.success) {
                if (res.config) {
                    setConfig(normalizeEditableConfig(res.config));
                }
                window.location.href = `/admin/settings?tab=general&savedAt=${Date.now()}`;
                return;
                window.alert('配置已保存成功。');
                setMessage('配置已保存成功。');
            } else {
                setMessage(`保存失败: ${res.error}`);
            }
        } catch (e: any) {
            setMessage(`保存异常: ${e.message}`);
        }
        setSaving(false);
        setTimeout(() => setMessage(''), 3000);
    };

    const addRegion = () => {
        setConfig((prev) => ({
            ...prev,
            regions: [...prev.regions, { id: 'NEW_REGION', name: '新赛区' }],
        }));
    };

    const updateRegion = (index: number, key: keyof RegionConfig, value: string) => {
        const next = [...config.regions];
        next[index] = { ...next[index], [key]: value };
        setConfig({ ...config, regions: next });
    };

    const removeRegion = (index: number) => {
        setConfig((prev) => ({ ...prev, regions: prev.regions.filter((_, i) => i !== index) }));
    };

    const addYear = () => {
        setConfig((prev) => ({ ...prev, years: [...prev.years, new Date().getFullYear().toString()] }));
    };

    const updateYear = (index: number, value: string) => {
        const next = [...config.years];
        next[index] = value;
        setConfig({ ...config, years: next });
    };

    const removeYear = (index: number) => {
        setConfig((prev) => ({ ...prev, years: prev.years.filter((_, i) => i !== index) }));
    };

    const addSplit = () => {
        setConfig((prev) => ({
            ...prev,
            splits: [...prev.splits, { id: 'New Split', name: '新赛段', mapping: '新赛段', type: 'league' }],
        }));
    };

    const updateSplit = (index: number, key: keyof SplitConfig, value: string) => {
        const next = [...config.splits];
        next[index] = { ...next[index], [key]: value };
        setConfig({ ...config, splits: next });
    };

    const removeSplit = (index: number) => {
        setConfig((prev) => ({ ...prev, splits: prev.splits.filter((_, i) => i !== index) }));
    };

    const toggleSplitRegion = (splitIndex: number, regionId: string) => {
        const next = [...config.splits];
        const split = next[splitIndex];
        const currentRegions = split.regions || [];

        if (currentRegions.includes(regionId)) {
            split.regions = currentRegions.filter((r) => r !== regionId);
        } else {
            split.regions = [...currentRegions, regionId];
        }

        if ((split.regions || []).length === 0) {
            delete split.regions;
        }

        setConfig({ ...config, splits: next });
    };

    const addMatchStageOption = () => {
        setConfig((prev) => ({
            ...prev,
            matchStageOptions: [
                ...(prev.matchStageOptions || []),
                { id: 'New Stage', label: '新阶段', category: 'other', enabled: true },
            ],
        }));
    };

    const updateMatchStageOption = (index: number, key: keyof MatchStageOption, value: any) => {
        const next = [...(config.matchStageOptions || [])];
        const current = next[index];
        if (!current) return;
        next[index] = { ...current, [key]: value };
        setConfig({ ...config, matchStageOptions: next });
    };

    const removeMatchStageOption = (index: number) => {
        setConfig((prev) => ({
            ...prev,
            matchStageOptions: (prev.matchStageOptions || []).filter((_, i) => i !== index),
        }));
    };

    const updateStrategyWeight = <G extends keyof StrategyScoreWeightsConfig>(
        group: G,
        key: keyof StrategyScoreWeightsConfig[G],
        value: string,
    ) => {
        const numeric = Number(value);
        setConfig((prev) => ({
            ...prev,
            strategyScoreWeights: normalizeStrategyScoreWeights({
                ...(prev.strategyScoreWeights || normalizeStrategyScoreWeights()),
                [group]: {
                    ...(prev.strategyScoreWeights?.[group] || {}),
                    [key]: Number.isFinite(numeric) ? numeric : 0,
                },
            }),
            strategyScorePresetId: 'custom',
        }));
    };

    const applyStrategyPreset = (presetId: Exclude<StrategyScorePresetId, 'custom'>) => {
        const preset = getStrategyScorePresetById(presetId);
        if (!preset) return;
        setConfig((prev) => ({
            ...prev,
            strategyScoreWeights: normalizeStrategyScoreWeights(preset.weights),
            strategyScorePresetId: preset.id,
        }));
    };

    const updateStrategyPresetOverride = (marketType: StrategyMarketTypeKey, value: string) => {
        setConfig((prev) => ({
            ...prev,
            strategyScorePresetOverrides: normalizeStrategyScorePresetOverrides({
                ...(prev.strategyScorePresetOverrides || normalizeStrategyScorePresetOverrides()),
                [marketType]: value,
            }),
        }));
    };

    const resetStrategyWeightGroup = <G extends keyof StrategyScoreWeightsConfig>(group: G) => {
        setConfig((prev) => ({
            ...prev,
            strategyScoreWeights: normalizeStrategyScoreWeights({
                ...(prev.strategyScoreWeights || normalizeStrategyScoreWeights()),
                [group]: DEFAULT_STRATEGY_SCORE_WEIGHTS[group],
            }),
            strategyScorePresetId: 'custom',
        }));
    };

    const resetAllStrategyWeights = () => {
        setConfig((prev) => ({
            ...prev,
            strategyScoreWeights: normalizeStrategyScoreWeights(DEFAULT_STRATEGY_SCORE_WEIGHTS),
            strategyScorePresetId: 'balanced',
        }));
    };

    const recommendationWeightFields: Array<{ key: keyof StrategyScoreWeightsConfig['exactRecommendation']; label: string; helper: string }> = [
        { key: 'historicalWinRate', label: '历史胜率', helper: '具体盘口历史胜率对排序的影响。' },
        { key: 'historicalReturn', label: '历史回报', helper: '单注历史回报对加减注优先级的影响。' },
        { key: 'recentTrend', label: '最近走势', helper: '最近 3 个大场的同盘口方向走势。' },
        { key: 'teamModel', label: '队伍模型', helper: '加权胜率、同赛事、相似对手、交手等队伍模型信号。' },
        { key: 'tempoEnvironment', label: '节奏环境', helper: '击杀节奏或时长预估对盘口方向的支持。' },
        { key: 'riskAdjustment', label: '风险修正', helper: '输盘率和样本质量对排序的压制或放大。' },
    ];

    const allocationWeightFields: Array<{ key: keyof StrategyScoreWeightsConfig['exactAllocation']; label: string; helper: string }> = [
        { key: 'base', label: '基础分', helper: '具体盘口进入预算分配池的基础分。' },
        { key: 'winRate', label: '胜率分', helper: '具体盘口历史胜率。' },
        { key: 'historicalReturn', label: '回报分', helper: '具体盘口历史单注回报。' },
        { key: 'historicalPnl', label: '历史盈亏', helper: '具体盘口累计输赢。' },
        { key: 'sampleAndRisk', label: '样本与风险', helper: '样本条数与输盘率的综合影响。' },
        { key: 'dailyForm', label: '当日手感', helper: '当天已录手数、当日输赢、连赢连亏。' },
        { key: 'teamModel', label: '队伍模型', helper: '队伍历史、同赛事、相似对手、交手等模型信号。' },
        { key: 'tempoEnvironment', label: '节奏环境', helper: '击杀节奏或时长环境。' },
        { key: 'parentAllocation', label: '父级分仓', helper: '继承盘口类型预算和父级风险等级。' },
        { key: 'volatilityAdjustment', label: '波动修正', helper: '高波动时压低具体盘口预算。' },
    ];

    const marketTypeAllocationWeightFields: Array<{ key: keyof StrategyScoreWeightsConfig['marketTypeAllocation']; label: string; helper: string }> = [
        { key: 'base', label: '基础分', helper: '每类盘口进入父级分仓池时的基础权重。' },
        { key: 'historicalWinRate', label: '历史胜率', helper: '父级盘口历史胜率对分仓比例的影响。' },
        { key: 'historicalPnl', label: '历史盈亏', helper: '父级盘口历史累计输赢对分仓比例的影响。' },
        { key: 'dailyForm', label: '当日手感', helper: '父级盘口当日输赢对预算分配的影响。' },
        { key: 'pricingReturn', label: '赔率回报', helper: '历史赔率样本、回报和 Kelly 口径对父级分仓的影响。' },
        { key: 'riskCost', label: '风险成本', helper: '低赔率占比、输盘率和波动带来的扣分强度。' },
        { key: 'matchEnvironment', label: '比赛环境', helper: '强弱差、同赛事覆盖、击杀节奏、时长环境等信号的影响。' },
        { key: 'riskAdjustment', label: '风险档位修正', helper: '高风险降权、低风险放大的整体修正强度。' },
    ];

    const currentPresetId = normalizeStrategyScorePresetId(config.strategyScorePresetId);
    const strategyPresetOverrides = normalizeStrategyScorePresetOverrides(config.strategyScorePresetOverrides);
    const marketPresetOverrideFields: Array<{ key: StrategyMarketTypeKey; label: string; helper: string }> = [
        { key: 'winner', label: MARKET_PRESET_LABELS.winner, helper: '适合单独强化强弱模型和历史样本。' },
        { key: 'handicap', label: MARKET_PRESET_LABELS.handicap, helper: '适合单独强化分差走势和风险修正。' },
        { key: 'kills', label: MARKET_PRESET_LABELS.kills, helper: '适合单独强化击杀节奏与环境波动。' },
        { key: 'time', label: MARKET_PRESET_LABELS.time, helper: '适合单独强化时长节奏与拖盘风格。' },
    ];

    return (
        <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/20 sticky top-4 z-40">
                <div className="space-y-1">
                    <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                        系统全局配置 <span className="text-[10px] text-gray-400 font-medium uppercase tracking-[0.2em] ml-2">System Config Center</span>
                    </h1>
                    <p className="text-xs text-gray-400 font-medium">统一管理赛区、年份、赛段映射与默认选项。</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                        {saving ? '保存中...' : '保存全局配置'}
                    </button>
                    {message && (
                        <span className={`text-sm font-black animate-in fade-in slide-in-from-left-2 ${message.includes('成功') ? 'text-green-600' : 'text-red-500'}`}>
                            {message}
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-black text-gray-900">赛区管理</h2>
                        <button onClick={addRegion} className="text-[10px] px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-500 font-black border border-gray-100 uppercase tracking-widest">
                            + Add Region
                        </button>
                    </div>
                    <div className="space-y-4">
                        {config.regions.map((region, i) => (
                            <div key={i} className="flex gap-3 items-center bg-gray-50/30 p-3 rounded-2xl border border-transparent hover:bg-white hover:border-blue-100">
                                <input
                                    type="text"
                                    value={region.id}
                                    onChange={(e) => updateRegion(i, 'id', e.target.value)}
                                    className="w-24 text-center text-xs bg-white text-gray-900 border border-gray-100 rounded-xl px-3 py-2.5 font-black"
                                    placeholder="ID"
                                />
                                <input
                                    type="text"
                                    value={region.name}
                                    onChange={(e) => updateRegion(i, 'name', e.target.value)}
                                    className="flex-1 text-sm bg-white text-gray-900 border border-gray-100 rounded-lg px-3 py-2"
                                    placeholder="显示名称"
                                />
                                <button onClick={() => removeRegion(i)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                    删除
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-black text-gray-900">年份管理 <span className="text-xs text-gray-400 font-medium">YEARS</span></h2>
                        <button onClick={addYear} className="text-[10px] px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-500 font-black border border-gray-200 uppercase tracking-widest">
                            + 新增年份
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {config.years.map((year, i) => (
                            <div key={i} className="flex items-center bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                <input
                                    type="text"
                                    value={year}
                                    onChange={(e) => updateYear(i, e.target.value)}
                                    className="w-20 text-sm bg-transparent border-none text-gray-900 focus:outline-none px-2 pl-3 py-2 text-center font-mono font-black"
                                />
                                <button onClick={() => removeYear(i)} className="px-2 py-2 text-gray-300 hover:text-red-500 hover:bg-red-50 border-l border-gray-100">
                                    x
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-8">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-gray-900">赛段映射体系</h2>
                    <button onClick={addSplit} className="text-[10px] px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest">
                        + Create New Split
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="text-gray-400 border-b border-gray-50">
                                <th className="pb-5 pt-2 font-black text-[10px] uppercase tracking-[0.2em]">内部标识 / ID</th>
                                <th className="pb-5 pt-2 font-black text-[10px] uppercase tracking-[0.2em]">显示名称 / Name</th>
                                <th className="pb-5 pt-2 font-black text-[10px] uppercase tracking-[0.2em]">数据映射 / Mapping</th>
                                <th className="pb-5 pt-2 font-black text-[10px] uppercase tracking-[0.2em]">赛段类型 / Type</th>
                                <th className="pb-5 pt-2 font-black text-[10px] uppercase tracking-[0.2em]">授权赛区 / Region Filter</th>
                                <th className="pb-5 w-10 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {config.splits.map((split, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 pr-4">
                                        <input
                                            type="text"
                                            value={split.id}
                                            onChange={(e) => updateSplit(i, 'id', e.target.value)}
                                            className="w-full bg-white border border-gray-100 text-gray-900 rounded-lg px-3 py-2 font-mono text-xs font-black"
                                        />
                                    </td>
                                    <td className="py-4 pr-4">
                                        <input
                                            type="text"
                                            value={split.name}
                                            onChange={(e) => updateSplit(i, 'name', e.target.value)}
                                            className="w-full bg-white border border-gray-100 text-gray-900 rounded-lg px-3 py-2 text-xs font-bold"
                                        />
                                    </td>
                                    <td className="py-4 pr-4">
                                        <input
                                            type="text"
                                            value={split.mapping}
                                            onChange={(e) => updateSplit(i, 'mapping', e.target.value)}
                                            className="w-full bg-white border border-gray-100 text-gray-900 rounded-lg px-3 py-2 text-xs font-bold"
                                        />
                                    </td>
                                    <td className="py-4 pr-4">
                                        <select
                                            value={split.type || 'league'}
                                            onChange={(e) => updateSplit(i, 'type', e.target.value as any)}
                                            className="w-full bg-white border border-gray-100 text-gray-900 rounded-lg px-3 py-2 text-xs font-bold"
                                        >
                                            <option value="league">League（常规联赛）</option>
                                            <option value="playoff">Playoff（淘汰赛树图）</option>
                                            <option value="cup">Cup（杯赛）</option>
                                        </select>
                                    </td>
                                    <td className="py-4 pr-4">
                                        <div className="flex flex-wrap gap-1.5">
                                            {config.regions.map((r) => {
                                                const isActive = (split.regions || []).includes(r.id);
                                                return (
                                                    <button
                                                        key={r.id}
                                                        onClick={() => toggleSplitRegion(i, r.id)}
                                                        className={`px-3 py-1 text-[10px] rounded-lg font-black border uppercase tracking-tighter ${
                                                            isActive
                                                                ? 'bg-blue-600 text-white border-blue-600'
                                                                : 'bg-white text-gray-400 border-gray-100 hover:text-gray-900 hover:border-gray-200'
                                                        }`}
                                                    >
                                                        {r.id}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="py-4 text-right">
                                        <button onClick={() => removeSplit(i)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                            删除
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                <h2 className="text-lg font-black text-gray-900 mb-8">默认启动项 <span className="text-xs text-gray-400 font-medium">DEFAULTS</span></h2>
                <div className="flex gap-10">
                    <div className="flex-1">
                        <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">默认赛区</label>
                        <select
                            value={config.defaultRegion}
                            onChange={(e) => setConfig({ ...config, defaultRegion: e.target.value })}
                            className="w-full border border-gray-100 rounded-xl p-3 text-sm text-gray-900 bg-gray-50 font-bold"
                        >
                            {config.regions.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">默认年份</label>
                        <select
                            value={config.defaultYear}
                            onChange={(e) => setConfig({ ...config, defaultYear: e.target.value })}
                            className="w-full border border-gray-100 rounded-xl p-3 text-sm text-gray-900 bg-gray-50 font-mono font-black"
                        >
                            {config.years.map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">默认赛段</label>
                        <select
                            value={config.defaultSplit}
                            onChange={(e) => setConfig({ ...config, defaultSplit: e.target.value })}
                            className="w-full border border-gray-100 rounded-xl p-3 text-sm text-gray-900 bg-gray-50 font-bold"
                        >
                            {config.splits.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-gray-900">比赛阶段标签（前台/后台共用）</h2>
                    <button
                        onClick={addMatchStageOption}
                        className="text-[10px] px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-500 font-black border border-gray-200 uppercase tracking-widest"
                    >
                        + Add Stage
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="text-gray-400 border-b border-gray-50">
                                <th className="pb-3 pt-1 font-black text-[10px] uppercase tracking-[0.2em]">值 (DB)</th>
                                <th className="pb-3 pt-1 font-black text-[10px] uppercase tracking-[0.2em]">显示文案</th>
                                <th className="pb-3 pt-1 font-black text-[10px] uppercase tracking-[0.2em]">分类</th>
                                <th className="pb-3 pt-1 font-black text-[10px] uppercase tracking-[0.2em]">启用</th>
                                <th className="pb-3 pt-1 w-10 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {(config.matchStageOptions || []).map((item, i) => (
                                <tr key={`${item.id}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-3 pr-3">
                                        <input
                                            type="text"
                                            value={item.id}
                                            onChange={(e) => updateMatchStageOption(i, 'id', e.target.value)}
                                            className="w-full bg-white border border-gray-100 text-gray-900 rounded-lg px-3 py-2 text-xs font-black"
                                        />
                                    </td>
                                    <td className="py-3 pr-3">
                                        <input
                                            type="text"
                                            value={item.label}
                                            onChange={(e) => updateMatchStageOption(i, 'label', e.target.value)}
                                            className="w-full bg-white border border-gray-100 text-gray-900 rounded-lg px-3 py-2 text-xs font-bold"
                                        />
                                    </td>
                                    <td className="py-3 pr-3">
                                        <select
                                            value={item.category}
                                            onChange={(e) => updateMatchStageOption(i, 'category', e.target.value)}
                                            className="w-full bg-white border border-gray-100 text-gray-900 rounded-lg px-3 py-2 text-xs font-bold"
                                        >
                                            <option value="regular">常规赛</option>
                                            <option value="playin">Play-In</option>
                                            <option value="playoff">季后赛</option>
                                            <option value="other">其他</option>
                                        </select>
                                    </td>
                                    <td className="py-3 pr-3">
                                        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                                            <input
                                                type="checkbox"
                                                checked={item.enabled !== false}
                                                onChange={(e) => updateMatchStageOption(i, 'enabled', e.target.checked)}
                                            />
                                            启用
                                        </label>
                                    </td>
                                    <td className="py-3 text-right">
                                        <button
                                            onClick={() => removeMatchStageOption(i)}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        >
                                            删除
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-8">
                <div>
                    <h2 className="text-lg font-black text-gray-900">策略评分权重</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-500">这里调整的是策略中心“具体盘口加减注/预算分配”的分项权重。`1` 表示默认权重，`0` 表示关闭该项影响，`&gt;1` 表示放大该项信号。</p>
                </div>

                <div className="flex items-center justify-end">
                    <button
                        type="button"
                        onClick={resetAllStrategyWeights}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                    >
                        恢复全部默认权重
                    </button>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-slate-50/70 p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-sm font-black text-gray-900">权重方案预设</div>
                            <div className="mt-1 text-xs leading-5 text-gray-500">先选预设再微调更高效。你手动改任意权重后，当前方案会自动切成“自定义”。</div>
                        </div>
                        <div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-black text-gray-700">
                            当前方案：{currentPresetId === 'custom' ? '自定义' : STRATEGY_SCORE_PRESETS.find((item) => item.id === currentPresetId)?.label || '平衡版'}
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
                        {STRATEGY_SCORE_PRESETS.map((preset) => {
                            const active = currentPresetId === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyStrategyPreset(preset.id)}
                                    className={`rounded-2xl border p-4 text-left transition-all ${active ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm' : 'border-white bg-white text-gray-800 hover:border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-black">{preset.label}</div>
                                        {active ? <div className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black text-white">已启用</div> : null}
                                    </div>
                                    <div className="mt-2 text-xs leading-5 text-gray-500">{preset.description}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-slate-50/70 p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-sm font-black text-gray-900">按盘口类型覆盖预设</div>
                            <div className="mt-1 text-xs leading-5 text-gray-500">默认跟随全局方案；如果某类盘口要单独强化，就在这里覆盖。覆盖后只影响该盘口类型的具体盘口加减注和预算分配。</div>
                        </div>
                        <div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-black text-gray-700">
                            未选择覆盖时沿用全局方案
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        {marketPresetOverrideFields.map((field) => {
                            const overrideValue = strategyPresetOverrides[field.key];
                            return (
                                <div key={field.key} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-gray-900">{field.label}</div>
                                            <div className="mt-1 text-xs leading-5 text-gray-500">{field.helper}</div>
                                        </div>
                                        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-black text-gray-700">
                                            当前：{overrideValue === 'inherit' ? '跟随全局' : STRATEGY_SCORE_PRESETS.find((item) => item.id === overrideValue)?.label || '跟随全局'}
                                        </div>
                                    </div>
                                    <select
                                        value={overrideValue}
                                        onChange={(e) => updateStrategyPresetOverride(field.key, e.target.value)}
                                        className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-900"
                                    >
                                        <option value="inherit">跟随全局方案</option>
                                        {STRATEGY_SCORE_PRESETS.map((preset) => (
                                            <option key={`${field.key}-${preset.id}`} value={preset.id}>
                                                {preset.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-gray-900">具体盘口加减注权重</div>
                            <button
                                type="button"
                                onClick={() => resetStrategyWeightGroup('exactRecommendation')}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-black text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                            >
                                恢复本组默认
                            </button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4">
                            {recommendationWeightFields.map((field) => (
                                <div key={field.key} className="rounded-xl border border-white bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-gray-900">{field.label}</div>
                                            <div className="mt-1 text-xs leading-5 text-gray-500">{field.helper}</div>
                                            <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-black ${getWeightDeltaTone(config.strategyScoreWeights?.exactRecommendation?.[field.key] ?? 1)}`}>
                                                相对默认 {formatWeightDelta(config.strategyScoreWeights?.exactRecommendation?.[field.key] ?? 1)}
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={config.strategyScoreWeights?.exactRecommendation?.[field.key] ?? 1}
                                            onChange={(e) => updateStrategyWeight('exactRecommendation', field.key, e.target.value)}
                                            className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-right text-sm font-black text-gray-900"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-gray-900">具体盘口预算分配权重</div>
                            <button
                                type="button"
                                onClick={() => resetStrategyWeightGroup('exactAllocation')}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-black text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                            >
                                恢复本组默认
                            </button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4">
                            {allocationWeightFields.map((field) => (
                                <div key={field.key} className="rounded-xl border border-white bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-gray-900">{field.label}</div>
                                            <div className="mt-1 text-xs leading-5 text-gray-500">{field.helper}</div>
                                            <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-black ${getWeightDeltaTone(config.strategyScoreWeights?.exactAllocation?.[field.key] ?? 1)}`}>
                                                相对默认 {formatWeightDelta(config.strategyScoreWeights?.exactAllocation?.[field.key] ?? 1)}
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={config.strategyScoreWeights?.exactAllocation?.[field.key] ?? 1}
                                            onChange={(e) => updateStrategyWeight('exactAllocation', field.key, e.target.value)}
                                            className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-right text-sm font-black text-gray-900"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-gray-900">父级盘口分仓权重</div>
                            <button
                                type="button"
                                onClick={() => resetStrategyWeightGroup('marketTypeAllocation')}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-black text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                            >
                                恢复本组默认
                            </button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4">
                            {marketTypeAllocationWeightFields.map((field) => (
                                <div key={field.key} className="rounded-xl border border-white bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-gray-900">{field.label}</div>
                                            <div className="mt-1 text-xs leading-5 text-gray-500">{field.helper}</div>
                                            <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-black ${getWeightDeltaTone(config.strategyScoreWeights?.marketTypeAllocation?.[field.key] ?? 1)}`}>
                                                相对默认 {formatWeightDelta(config.strategyScoreWeights?.marketTypeAllocation?.[field.key] ?? 1)}
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={config.strategyScoreWeights?.marketTypeAllocation?.[field.key] ?? 1}
                                            onChange={(e) => updateStrategyWeight('marketTypeAllocation', field.key, e.target.value)}
                                            className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-right text-sm font-black text-gray-900"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8">
                <button
                    onClick={() => {
                        const el = document.getElementById('debug-json');
                        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
                    }}
                    className="text-xs text-gray-500 opacity-60 hover:opacity-100 transition-opacity font-mono cursor-pointer mb-2"
                >
                    查看原始 JSON 配置
                </button>
                <div id="debug-json" style={{ display: 'none' }} className="bg-gray-900 border border-gray-700 text-green-400 p-4 rounded-lg overflow-x-auto whitespace-pre font-mono text-xs">
                    {JSON.stringify(config, null, 2)}
                </div>
            </div>
        </div>
    );
}

