'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { confirmAction } from '@/lib/confirm-dialog';
import {
    applyManualSchedulePlan,
    extractScheduleScreenshotText,
    previewManualSchedulePlan,
} from '@/app/admin/schedule/actions';
import type { MatchStageOption } from '@/lib/config-shared';

type ManualSchedulePlannerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    systemRegions?: string[];
    stageOptions?: MatchStageOption[];
    existingTournaments: string[];
    defaultRegion?: string;
    onImportSuccess: () => Promise<void> | void;
};

type PreviewItem = {
    index: number;
    weekLabel?: string | null;
    date: string;
    time: string;
    format?: string | null;
    matchup: string;
};

type UnresolvedItem = {
    rawLine: string;
    reason: string;
};

type PreviewResponse = {
    success?: boolean;
    error?: string;
    sourceCount?: number;
    creatableCount?: number;
    skippedCount?: number;
    unresolvedCount?: number;
    preview?: PreviewItem[];
    unresolvedPreview?: UnresolvedItem[];
    skippedPreview?: UnresolvedItem[];
};

const DEFAULT_TEMPLATE = [
    'Week 1 | 2026-04-01 | 16:00 | HLE | BRO',
    'Week 1 | 2026-04-01 | 18:00 | T1 | KT',
].join('\n');

const STATUS_OPTIONS = [
    { value: 'SCHEDULED', label: '未开赛' },
    { value: 'LIVE', label: '进行中' },
    { value: 'FINISHED', label: '已结束' },
];

const FORMAT_OPTIONS = ['BO1', 'BO3', 'BO5'];

export default function ManualSchedulePlannerModal({
    isOpen,
    onClose,
    systemRegions,
    stageOptions,
    existingTournaments,
    defaultRegion = 'LPL',
    onImportSuccess,
}: ManualSchedulePlannerModalProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const enabledStageOptions = useMemo(
        () => (stageOptions || []).filter((option) => option.enabled !== false),
        [stageOptions],
    );

    const regionOptions = useMemo(() => {
        const base = [...new Set((systemRegions || ['LPL', 'LCK', 'OTHER', 'WORLDS']).filter(Boolean))];
        return base.length > 0 ? base : ['LPL', 'LCK', 'OTHER', 'WORLDS'];
    }, [systemRegions]);

    const [region, setRegion] = useState(defaultRegion);
    const [leagueLabel, setLeagueLabel] = useState('');
    const [localTournament, setLocalTournament] = useState('');
    const [localStage, setLocalStage] = useState(enabledStageOptions[0]?.id || 'Regular Season');
    const [defaultFormat, setDefaultFormat] = useState('BO3');
    const [defaultStatus, setDefaultStatus] = useState('SCHEDULED');
    const [gameVersion, setGameVersion] = useState('');
    const [linesText, setLinesText] = useState(DEFAULT_TEMPLATE);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [screenshotDataUrl, setScreenshotDataUrl] = useState('');
    const [screenshotName, setScreenshotName] = useState('');
    const [ocrMessage, setOcrMessage] = useState('');

    useEffect(() => {
        if (!enabledStageOptions.some((option) => option.id === localStage)) {
            setLocalStage(enabledStageOptions[0]?.id || 'Regular Season');
        }
    }, [enabledStageOptions, localStage]);

    useEffect(() => {
        if (!isOpen) return;
        if (!regionOptions.includes(region)) {
            setRegion(defaultRegion);
        }
    }, [defaultRegion, isOpen, region, regionOptions]);

    const getEffectiveTournamentName = () => {
        const manualName = localTournament.trim();
        if (manualName) return manualName;
        const label = leagueLabel.trim();
        return label ? `2026 ${label}` : '';
    };

    const getResolvedTournamentName = () => {
        const effectiveName = getEffectiveTournamentName();
        if (effectiveName) return effectiveName;
        const stageLabel = enabledStageOptions.find((option) => option.id === localStage)?.label || localStage;
        return `2026 ${region} ${stageLabel}`;
    };

    const groupedPreview = useMemo(() => {
        const items = Array.isArray(preview?.preview) ? preview.preview : [];
        return items.reduce<Record<string, PreviewItem[]>>((map, item) => {
            const key = item.weekLabel || '未分组';
            if (!map[key]) map[key] = [];
            map[key].push(item);
            return map;
        }, {});
    }, [preview]);

    if (!isOpen) return null;

    const fillTournamentFromLabel = () => {
        const generated = getEffectiveTournamentName();
        if (!generated) {
            alert('请先填写联赛标签，再生成赛事名称。');
            return;
        }
        setLocalTournament(generated);
    };

    const buildRequest = (overrides?: {
        linesText?: string;
        localTournament?: string;
    }) => ({
        region,
        leagueLabel: leagueLabel.trim(),
        localTournament: overrides?.localTournament ?? getResolvedTournamentName(),
        localStage,
        defaultFormat,
        defaultStatus,
        gameVersion: gameVersion.trim(),
        linesText: overrides?.linesText ?? linesText,
    });

    const ensureTournamentName = () => {
        const tournamentName = getResolvedTournamentName();
        if (!tournamentName) {
            alert('请填写赛事名称。');
            return '';
        }
        return tournamentName;
    };

    const handlePreview = async (overrides?: { linesText?: string; localTournament?: string }) => {
        const tournamentName = overrides?.localTournament ?? ensureTournamentName();
        if (!tournamentName) return { success: false, error: '请填写赛事名称。' };

        setLoading(true);
        const res = await previewManualSchedulePlan(
            buildRequest({
                ...overrides,
                localTournament: tournamentName,
            }),
        );
        setPreview(res as PreviewResponse);
        if (!res.success) {
            alert(`预览失败：${res.error}`);
        }
        setLoading(false);
        return res;
    };

    const handleApply = async () => {
        const tournamentName = ensureTournamentName();
        if (!tournamentName) return;

        const confirmed = await confirmAction('确认将当前预览整理后的比赛批量写入正式赛程吗？');
        if (!confirmed) return;

        setLoading(true);
        const res = await applyManualSchedulePlan(
            buildRequest({
                localTournament: tournamentName,
            }),
        );
        if (res.success) {
            alert(res.message || '整理完成');
            await onImportSuccess();
            setPreview(null);
            onClose();
        } else {
            alert(`整理失败：${res.error}`);
        }
        setLoading(false);
    };

    const handlePickFile = async (file?: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setScreenshotDataUrl(String(reader.result || ''));
            setScreenshotName(file.name);
            setOcrMessage('');
        };
        reader.readAsDataURL(file);
    };

    const handleScreenshotOcr = async () => {
        if (!screenshotDataUrl) {
            alert('请先选择或粘贴一张赛程截图。');
            return;
        }

        setLoading(true);
        const res = await extractScheduleScreenshotText({
            imageDataUrl: screenshotDataUrl,
            region,
            formatHint: defaultFormat,
        });

        if (!res.success) {
            setOcrMessage('');
            setPreview(null);
            alert(`截图识别失败：${res.error}`);
            setLoading(false);
            return;
        }

        const nextLinesText = res.linesText || '';
        const tournamentName = getResolvedTournamentName();
        setLinesText(nextLinesText);
        if (!localTournament.trim() && tournamentName) {
            setLocalTournament(tournamentName);
        }
        setOcrMessage(`已识别 ${res.count || 0} 场赛程，你可以直接预览或继续微调文本。`);
        setLoading(false);

        await handlePreview({
            linesText: nextLinesText,
            localTournament: tournamentName,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
            <div
                className="my-4 h-[calc(100vh-2rem)] w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
                onPaste={(event) => {
                    const file = Array.from(event.clipboardData.files || [])[0];
                    if (file) {
                        void handlePickFile(file);
                    }
                }}
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
                    <div>
                        <h2 className="text-3xl font-bold text-white">手工整理赛程</h2>
                        <p className="mt-2 text-sm text-slate-400">
                            不再走外部同步，直接按联赛、阶段、赛制和对阵清单批量整理成本地赛程。
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setPreview(null);
                            onClose();
                        }}
                        className="px-2 py-1 text-slate-400 hover:text-white"
                    >
                        关闭
                    </button>
                </div>

                <div className="grid h-[calc(100%-96px)] grid-cols-1 overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">
                    <div className="min-h-0 space-y-5 overflow-y-auto border-r border-slate-800 p-5">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">归属赛区</label>
                                <select
                                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-white"
                                    value={region}
                                    onChange={(event) => setRegion(event.target.value)}
                                >
                                    {regionOptions.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">联赛标签</label>
                                <input
                                    type="text"
                                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-white"
                                    placeholder="例如 lec春季赛 / lck常规赛"
                                    value={leagueLabel}
                                    onChange={(event) => setLeagueLabel(event.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <label className="block text-xs font-bold text-slate-400">赛事名称</label>
                                <button
                                    type="button"
                                    onClick={fillTournamentFromLabel}
                                    className="text-xs text-cyan-300 hover:text-cyan-200"
                                >
                                    按联赛标签生成
                                </button>
                            </div>
                            <input
                                type="text"
                                className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-white"
                                placeholder="例如 2026 lec春季赛"
                                value={localTournament}
                                onChange={(event) => setLocalTournament(event.target.value)}
                                list="manual-schedule-tournament-list"
                            />
                            <datalist id="manual-schedule-tournament-list">
                                {existingTournaments.map((item) => (
                                    <option key={item} value={item} />
                                ))}
                            </datalist>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">阶段</label>
                                <select
                                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-white"
                                    value={localStage}
                                    onChange={(event) => setLocalStage(event.target.value)}
                                >
                                    {enabledStageOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">赛制</label>
                                <select
                                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-white"
                                    value={defaultFormat}
                                    onChange={(event) => setDefaultFormat(event.target.value)}
                                >
                                    {FORMAT_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">默认状态</label>
                                <select
                                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-white"
                                    value={defaultStatus}
                                    onChange={(event) => setDefaultStatus(event.target.value)}
                                >
                                    {STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">版本覆盖</label>
                                <input
                                    type="text"
                                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-white"
                                    placeholder="例如 26.07"
                                    value={gameVersion}
                                    onChange={(event) => setGameVersion(event.target.value)}
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                            <h3 className="text-xl font-bold text-white">批量录入格式</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-400">
                                支持两种主格式，周次可写可不写。系统会先做本地预览，再保存。
                            </p>
                            <div className="mt-4 whitespace-pre-line rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-slate-300">
                                {DEFAULT_TEMPLATE}
                                {'\n'}
                                {'2026-04-02 18:00 DK vs NS'}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-cyan-900/70 bg-cyan-950/20 p-4">
                            <h3 className="text-xl font-bold text-cyan-300">赛程截图识别</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-400">
                                可以直接 Ctrl + V 粘贴图片，或选择一张赛程截图，系统会自动识别成下方赛程清单。
                            </p>

                            <div className="mt-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
                                {screenshotDataUrl ? (
                                    <img src={screenshotDataUrl} alt="赛程截图预览" className="max-h-80 w-full object-contain" />
                                ) : (
                                    <div className="flex h-52 items-center justify-center text-sm text-slate-500">
                                        等待粘贴或选择赛程截图
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                        void handlePickFile(event.target.files?.[0] || null);
                                        event.currentTarget.value = '';
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="rounded-xl bg-slate-700 px-4 py-2 font-bold text-white hover:bg-slate-600"
                                >
                                    选择截图
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleScreenshotOcr()}
                                    disabled={loading || !screenshotDataUrl}
                                    className="rounded-xl bg-cyan-500 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-700"
                                >
                                    识别赛程截图
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setScreenshotDataUrl('');
                                        setScreenshotName('');
                                        setOcrMessage('');
                                    }}
                                    disabled={!screenshotDataUrl}
                                    className="rounded-xl bg-slate-700 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    移除截图
                                </button>
                            </div>

                            {screenshotName ? (
                                <p className="mt-3 text-xs text-slate-400">当前截图：{screenshotName}</p>
                            ) : null}
                            {ocrMessage ? (
                                <p className="mt-2 text-sm text-cyan-300">{ocrMessage}</p>
                            ) : null}
                        </div>

                        <div>
                            <label className="mb-2 block text-base font-bold text-white">赛程清单</label>
                            <textarea
                                value={linesText}
                                onChange={(event) => setLinesText(event.target.value)}
                                className="min-h-[260px] w-full rounded-2xl border border-slate-700 bg-slate-950/70 p-4 font-mono text-sm leading-6 text-slate-200"
                                placeholder="可以手动整理对阵，也可以先识别截图再微调。"
                            />
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-col overflow-hidden">
                        <div className="border-b border-slate-800 px-5 py-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-1 text-sm font-bold text-cyan-300">
                                    可保存 {preview?.creatableCount || 0} 场
                                </span>
                                <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-1 text-sm font-bold text-rose-300">
                                    待修正 {preview?.unresolvedCount || 0} 场
                                </span>
                                <span className="rounded-full border border-slate-600 bg-slate-800 px-4 py-1 text-sm font-bold text-slate-300">
                                    已跳过 {preview?.skippedCount || 0} 场
                                </span>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                            {preview?.success &&
                            ((preview.preview && preview.preview.length > 0) ||
                                (preview.unresolvedPreview && preview.unresolvedPreview.length > 0) ||
                                (preview.skippedPreview && preview.skippedPreview.length > 0)) ? (
                                <div className="space-y-6">
                                    {Object.entries(groupedPreview).map(([weekLabel, items]) => (
                                        <section key={weekLabel} className="rounded-2xl border border-slate-700 bg-slate-900/70">
                                            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                                                <div>
                                                    <h3 className="text-2xl font-bold text-white">{weekLabel}</h3>
                                                    <p className="mt-1 text-sm text-slate-400">
                                                        {getResolvedTournamentName() || '请先填写赛事名称'} / {localStage} / {defaultFormat}
                                                    </p>
                                                </div>
                                                <span className="text-sm text-slate-400">{items.length} 场</span>
                                            </div>
                                            <div className="space-y-3 p-4">
                                                {items.map((item) => (
                                                    <div key={`${weekLabel}-${item.index}`} className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div className="text-lg font-bold text-cyan-300">
                                                                {item.date} {item.time}
                                                            </div>
                                                            <div className="text-sm text-slate-400">第 {item.index} 行</div>
                                                        </div>
                                                        <div className="mt-2 text-lg font-semibold text-white">{item.matchup}</div>
                                                        {item.format ? <div className="mt-2 text-sm text-slate-400">{item.format}</div> : null}
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ))}

                                    {preview.unresolvedPreview && preview.unresolvedPreview.length > 0 ? (
                                        <section className="rounded-2xl border border-rose-500/30 bg-rose-950/10 p-4">
                                            <h3 className="text-lg font-bold text-rose-300">待修正项</h3>
                                            <div className="mt-3 space-y-3">
                                                {preview.unresolvedPreview.map((item, index) => (
                                                    <div key={`unresolved-${index}`} className="rounded-xl border border-rose-500/20 bg-slate-950/60 p-3">
                                                        <div className="text-sm font-bold text-rose-300">{item.reason}</div>
                                                        <div className="mt-1 font-mono text-sm text-slate-300">{item.rawLine}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null}

                                    {preview.skippedPreview && preview.skippedPreview.length > 0 ? (
                                        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                                            <h3 className="text-lg font-bold text-slate-200">已跳过项</h3>
                                            <div className="mt-3 space-y-3">
                                                {preview.skippedPreview.map((item, index) => (
                                                    <div key={`skipped-${index}`} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                                                        <div className="text-sm font-bold text-slate-300">{item.reason}</div>
                                                        <div className="mt-1 font-mono text-sm text-slate-400">{item.rawLine}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-10 text-center text-slate-400">
                                    先点“预览整理到赛程”，右侧会显示按周次整理后的比赛清单。
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4">
                            <button
                                onClick={() => {
                                    setPreview(null);
                                    onClose();
                                }}
                                className="rounded-xl px-5 py-2 font-bold text-slate-300 hover:bg-slate-800"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => void handlePreview()}
                                disabled={loading}
                                className="rounded-xl bg-slate-700 px-5 py-2 font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? '处理中...' : '预览整理到赛程'}
                            </button>
                            <button
                                onClick={() => void handleApply()}
                                disabled={loading || !preview?.success || !preview.creatableCount}
                                className="rounded-xl bg-cyan-500 px-5 py-2 font-bold text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                            >
                                {loading ? '处理中...' : '确认整理到赛程'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

