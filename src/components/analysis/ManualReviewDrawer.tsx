'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { CalendarDays, Eye, FileText, Shield, Sparkles, Sword, UserRound, X } from 'lucide-react';

import { getManualReviewTypeLabel, type ManualReviewType } from '@/lib/manual-review-comment';

export interface ManualReviewEntryView {
    id: string;
    reviewType: ManualReviewType;
    teamId: string;
    teamName: string;
    playerId: string;
    hero: string;
    summary: string;
    detail: string;
    matchDate: string;
    opponentTeamName: string;
    gameNumber: number;
}

function getTypeTone(type: ManualReviewType) {
    if (type === 'HIGHLIGHT') return 'border-cyan-400/40 bg-cyan-500/12 text-cyan-100';
    if (type === 'ANOMALY') return 'border-rose-400/40 bg-rose-500/12 text-rose-100';
    if (type === 'SPOTLIGHT') return 'border-amber-400/40 bg-amber-500/12 text-amber-100';
    return 'border-fuchsia-400/40 bg-fuchsia-500/12 text-fuchsia-100';
}

function formatReviewLocator(entry: ManualReviewEntryView) {
    return `${entry.matchDate} vs ${entry.opponentTeamName} · 第${String(entry.gameNumber)}局`;
}

function getReviewHeadline(type: ManualReviewType) {
    if (type === 'HIGHLIGHT') return '精彩记录';
    if (type === 'ANOMALY') return '异常复盘';
    if (type === 'SPOTLIGHT') return '赛场高光';
    return '风险观察';
}

export default function ManualReviewDrawer({
    entry,
    onClose,
}: {
    entry: ManualReviewEntryView | null;
    onClose: () => void;
}) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!entry) return undefined;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [entry, onClose]);

    if (!mounted || !entry) return null;

    return createPortal(
        <div className="fixed inset-0 z-[110] flex justify-end bg-slate-950/72 backdrop-blur-sm" onClick={onClose}>
            <div
                className="flex h-full w-full max-w-[520px] flex-col border-l border-white/10 bg-[linear-gradient(180deg,#08111d_0%,#0b1320_100%)] shadow-[0_0_40px_rgba(2,6,23,0.6)]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="border-b border-white/8 bg-slate-950/40 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">完整点评</div>
                            <div className="mt-1 text-lg font-black text-white">手动点评回看</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${getTypeTone(entry.reviewType)}`}>
                                    {getManualReviewTypeLabel(entry.reviewType)}
                                </span>
                                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black text-white">
                                    {entry.teamName}
                                </span>
                                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black text-slate-200">
                                    {entry.playerId}
                                </span>
                                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black text-slate-200">
                                    {entry.hero}
                                </span>
                            </div>
                            <div className="mt-3 text-xs font-semibold text-slate-400">{formatReviewLocator(entry)}</div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-slate-300 transition-all hover:border-white/20 hover:text-white"
                            aria-label="关闭点评抽屉"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="mt-4 rounded-3xl border border-cyan-400/12 bg-[linear-gradient(135deg,rgba(6,78,59,0.12),rgba(15,23,42,0.1))] px-4 py-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10 text-cyan-100">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300/80">{getReviewHeadline(entry.reviewType)}</div>
                                <div className="mt-2 text-base font-black leading-7 text-white">{entry.summary}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-3xl border border-white/8 bg-slate-950/40 px-4 py-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300">
                                        <CalendarDays className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">比赛定位</div>
                                        <div className="mt-2 text-sm font-bold leading-6 text-slate-100">{formatReviewLocator(entry)}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-white/8 bg-slate-950/40 px-4 py-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            <Shield className="h-3.5 w-3.5" />
                                            队伍
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">{entry.teamName}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            <UserRound className="h-3.5 w-3.5" />
                                            选手
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">{entry.playerId}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            <Sword className="h-3.5 w-3.5" />
                                            英雄
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">{entry.hero}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            <Sparkles className="h-3.5 w-3.5" />
                                            类型
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">{getManualReviewTypeLabel(entry.reviewType)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-white/8 bg-slate-950/40 px-4 py-4">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                <Eye className="h-3.5 w-3.5" />
                                摘要
                            </div>
                            <div className="mt-3 text-sm font-bold leading-7 text-white">{entry.summary}</div>
                        </div>

                        <div className="rounded-3xl border border-white/8 bg-slate-950/40 px-4 py-4">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                <FileText className="h-3.5 w-3.5" />
                                完整内容
                            </div>
                            <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-4 text-sm leading-7 text-slate-200">
                                {entry.detail || entry.summary}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-dashed border-white/8 bg-slate-950/20 px-4 py-3 text-xs leading-6 text-slate-500">
                            当前抽屉只负责完整回看，不会直接改动点评内容。按 <span className="font-black text-slate-300">Esc</span> 也可以关闭。
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
