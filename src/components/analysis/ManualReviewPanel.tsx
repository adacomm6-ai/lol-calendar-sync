'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { deleteManualReview, saveManualReviewComment } from '@/app/entry/upload/actions';
import { type ManualReviewEntryView } from '@/components/analysis/ManualReviewDrawer';
import {
    MANUAL_REVIEW_TYPE_OPTIONS,
    deriveManualReviewSummary,
    getManualReviewTypeLabel,
    type ManualReviewType,
} from '@/lib/manual-review-comment';

interface CommentRecord {
    id: string;
    content: string;
    type: string;
    createdAt: Date | string;
    gameNumber: number;
}

interface TeamOption {
    id: string | null;
    name: string;
    shortName?: string | null;
    players?: Array<{ id: string; name: string }>;
}

interface ManualReviewRecord extends ManualReviewEntryView {
    createdAt?: Date | string | number;
}

interface ManualReviewPanelProps {
    matchId: string;
    activeGameNumber: number;
    comments: CommentRecord[];
    manualReviews: ManualReviewRecord[];
    teamA: TeamOption | null;
    teamB: TeamOption | null;
    matchDate: string;
    activeGame?: {
        teamAStats?: string | null;
        teamBStats?: string | null;
    } | null;
}

type FormState = {
    editingId: string | null;
    reviewType: ManualReviewType;
    teamId: string;
    playerId: string;
    hero: string;
    detail: string;
};

const EMPTY_FORM: FormState = {
    editingId: null,
    reviewType: 'HIGHLIGHT',
    teamId: '',
    playerId: '',
    hero: '',
    detail: '',
};

function getTypeTone(type: ManualReviewType) {
    if (type === 'HIGHLIGHT') return 'border-cyan-400/40 bg-cyan-500/12 text-cyan-100';
    if (type === 'ANOMALY') return 'border-rose-400/40 bg-rose-500/12 text-rose-100';
    if (type === 'SPOTLIGHT') return 'border-amber-400/40 bg-amber-500/12 text-amber-100';
    return 'border-fuchsia-400/40 bg-fuchsia-500/12 text-fuchsia-100';
}

function stripLegacyHtml(input: string) {
    return String(input || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getLegacyCommentLabel(type: string) {
    if (type === 'PLAYER_HIGHLIGHT') return '历史精彩';
    if (type === 'MATCH_FIXING_SUSPECT') return '历史异常';
    if (['POST_MATCH_A', 'POST_MATCH_B', 'POST_MATCH_C', 'POST_MATCH_D'].includes(type)) return '历史高光';
    return '历史点评';
}

function parseHeroOptions(raw?: string | null) {
    if (!raw) return [] as string[];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return Array.from(
            new Set(
                parsed
                    .map((item: any) => String(item?.championName || item?.hero || '').trim())
                    .filter(Boolean),
            ),
        );
    } catch {
        return [];
    }
}

function formatReviewLocator(matchDate: string, opponentTeamName: string | null | undefined, gameNumber: number) {
    return `${matchDate} vs ${opponentTeamName || '--'} · 第${String(gameNumber)}局`;
}

export default function ManualReviewPanel({
    matchId,
    activeGameNumber,
    comments,
    manualReviews,
    teamA,
    teamB,
    matchDate,
    activeGame,
}: ManualReviewPanelProps) {
    const [form, setForm] = useState<FormState>(() => ({
        ...EMPTY_FORM,
        teamId: teamA?.id || teamB?.id || '',
    }));
    const [pending, startTransition] = useTransition();

    const playerInputRef = useRef<HTMLInputElement | null>(null);
    const heroInputRef = useRef<HTMLInputElement | null>(null);
    const detailInputRef = useRef<HTMLTextAreaElement | null>(null);

    const teamOptions = useMemo(
        () =>
            [teamA, teamB]
                .filter(Boolean)
                .map((team) => ({
                    id: team?.id || '',
                    name: team?.shortName || team?.name || '未知队伍',
                    players: team?.players || [],
                })),
        [teamA, teamB],
    );

    const selectedTeam = teamOptions.find((team) => team.id === form.teamId) || teamOptions[0] || null;
    const opponentTeam = teamOptions.find((team) => team.id !== selectedTeam?.id) || null;
    const teamAHeroes = useMemo(() => parseHeroOptions(activeGame?.teamAStats || null), [activeGame?.teamAStats]);
    const teamBHeroes = useMemo(() => parseHeroOptions(activeGame?.teamBStats || null), [activeGame?.teamBStats]);

    const selectedTeamHeroOptions = useMemo(() => {
        if (!selectedTeam?.id) return [] as string[];
        if (selectedTeam.id === teamA?.id) return teamAHeroes;
        if (selectedTeam.id === teamB?.id) return teamBHeroes;
        return [];
    }, [selectedTeam, teamA?.id, teamB?.id, teamAHeroes, teamBHeroes]);

    const oppositeTeamHeroOptions = useMemo(() => {
        if (!selectedTeam?.id) return [] as string[];
        if (selectedTeam.id === teamA?.id) return teamBHeroes;
        if (selectedTeam.id === teamB?.id) return teamAHeroes;
        return [];
    }, [selectedTeam, teamA?.id, teamB?.id, teamAHeroes, teamBHeroes]);

    const heroOptions = useMemo(
        () => Array.from(new Set([...selectedTeamHeroOptions, ...oppositeTeamHeroOptions])),
        [selectedTeamHeroOptions, oppositeTeamHeroOptions],
    );

    const manualEntries = useMemo(
        () =>
            manualReviews
                .filter((entry) => entry.gameNumber === activeGameNumber)
                .sort((left, right) => {
                    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
                    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
                    return rightTime - leftTime;
                }),
        [manualReviews, activeGameNumber],
    );

    const legacyEntries = useMemo(
        () =>
            comments
                .filter(
                    (comment) =>
                        comment.gameNumber === activeGameNumber &&
                        ['PLAYER_HIGHLIGHT', 'MATCH_FIXING_SUSPECT', 'POST_MATCH_A', 'POST_MATCH_B', 'POST_MATCH_C', 'POST_MATCH_D'].includes(comment.type),
                )
                .map((comment) => ({
                    id: comment.id,
                    label: getLegacyCommentLabel(comment.type),
                    summary: deriveManualReviewSummary(stripLegacyHtml(comment.content)),
                })),
        [comments, activeGameNumber],
    );

    useEffect(() => {
        if (form.teamId) return;
        if (teamOptions[0]?.id) {
            setForm((current) => ({ ...current, teamId: teamOptions[0].id }));
        }
    }, [form.teamId, teamOptions]);

    useEffect(() => {
        if (!selectedTeam) return;
        const stillValid = selectedTeam.players.some((player) => player.name === form.playerId);
        if (form.playerId && !stillValid) {
            setForm((current) => ({ ...current, playerId: '' }));
        }
    }, [selectedTeam, form.playerId]);

    const resetForm = () => {
        setForm({
            ...EMPTY_FORM,
            teamId: selectedTeam?.id || teamOptions[0]?.id || '',
            reviewType: 'HIGHLIGHT',
        });
    };

    const clearAfterSave = () => {
        setForm((current) => ({
            editingId: null,
            reviewType: current.reviewType,
            teamId: current.teamId || selectedTeam?.id || teamOptions[0]?.id || '',
            playerId: '',
            hero: '',
            detail: '',
        }));

        setTimeout(() => {
            playerInputRef.current?.focus();
        }, 0);
    };

    const handleSave = () => {
        if (!selectedTeam?.id || !form.playerId.trim() || !form.hero.trim() || !form.detail.trim()) {
            alert('请先完整填写：队伍、选手ID、英雄、点评内容。');
            return;
        }

        const nextOpponentName = opponentTeam?.name || '';
        const nextSummary = deriveManualReviewSummary(form.detail);

        startTransition(async () => {
            const formData = new FormData();
            if (form.editingId) formData.append('reviewId', form.editingId);
            formData.append('matchId', matchId);
            formData.append('gameNumber', String(activeGameNumber));
            formData.append('reviewType', form.reviewType);
            formData.append('teamId', selectedTeam.id);
            formData.append('teamName', selectedTeam.name);
            formData.append('playerId', form.playerId.trim());
            formData.append('hero', form.hero.trim());
            formData.append('detail', form.detail.trim());
            formData.append('summary', nextSummary);
            formData.append('matchDate', matchDate);
            formData.append('opponentTeamName', nextOpponentName);

            const result = await saveManualReviewComment(formData);
            if ((result as any)?.error) {
                alert(String((result as any).error));
                return;
            }

            clearAfterSave();
        });
    };

    const handleEdit = (entry: ManualReviewEntryView) => {
        setForm({
            editingId: entry.id,
            reviewType: entry.reviewType,
            teamId: entry.teamId,
            playerId: entry.playerId,
            hero: entry.hero,
            detail: entry.detail,
        });

        setTimeout(() => {
            detailInputRef.current?.focus();
        }, 0);
    };

    const handleDelete = (entry: ManualReviewEntryView) => {
        if (!window.confirm(`确认删除这条${getManualReviewTypeLabel(entry.reviewType)}点评吗？`)) return;

        startTransition(async () => {
            const result = await deleteManualReview(entry.id, matchId);
            if ((result as any)?.error) {
                alert(String((result as any).error));
                return;
            }
            if (form.editingId === entry.id) {
                resetForm();
            }
        });
    };

    const handleTeamSwitch = (teamId: string) => {
        setForm((current) => ({
            ...current,
            teamId,
            playerId: '',
        }));

        setTimeout(() => {
            playerInputRef.current?.focus();
        }, 0);
    };

    const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (!pending) handleSave();
            return;
        }

        if (event.key === 'Escape' && form.editingId) {
            event.preventDefault();
            resetForm();
            setTimeout(() => {
                playerInputRef.current?.focus();
            }, 0);
        }
    };

    return (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-cyan-500/15 bg-[#08111d]">
            <div className="flex items-center justify-between border-b border-white/8 bg-slate-950/35 px-4 py-3">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/70">手动点评源面板</div>
                    <h3 className="mt-1 text-sm font-black tracking-[0.08em] text-white">手动点评</h3>
                </div>
                <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex h-9 items-center rounded-full border border-blue-400/30 bg-blue-500/15 px-4 text-[11px] font-black text-blue-100 transition-all hover:border-blue-300/40 hover:bg-blue-500/20"
                >
                    + 新增
                </button>
            </div>

            <div className="border-b border-white/8 bg-slate-950/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">快捷录入</div>
                    <div className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-emerald-100">
                        自动带入比赛定位
                    </div>
                </div>

                <div className="mt-4 space-y-4">
                    <div>
                        <div className="mb-2 text-[11px] font-black text-slate-300">点评类型</div>
                        <div className="flex flex-wrap gap-2">
                            {MANUAL_REVIEW_TYPE_OPTIONS.map((option) => {
                                const active = option.value === form.reviewType;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setForm((current) => ({ ...current, reviewType: option.value }))}
                                        className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition-all ${
                                            active ? getTypeTone(option.value) : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 text-[11px] font-black text-slate-300">队伍归属</div>
                        <div className="flex gap-2">
                            {teamOptions.map((team) => {
                                const active = team.id === form.teamId;
                                return (
                                    <button
                                        key={team.id}
                                        type="button"
                                        onClick={() => handleTeamSwitch(team.id)}
                                        className={`rounded-full border px-4 py-1.5 text-[11px] font-black transition-all ${
                                            active ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
                                        }`}
                                    >
                                        {team.name}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2 text-[11px] text-slate-500">切换队伍后，选手联想会自动切到当前队伍。</div>
                    </div>

                    <div className="grid gap-3">
                        <div>
                            <div className="mb-2 text-[11px] font-black text-slate-300">选手 ID</div>
                            <input
                                ref={playerInputRef}
                                list={`manual-review-players-${selectedTeam?.id || 'default'}`}
                                value={form.playerId}
                                onChange={(event) => setForm((current) => ({ ...current, playerId: event.target.value }))}
                                onKeyDown={handleFormKeyDown}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-400/40"
                                placeholder="例如 oner / clozer"
                            />
                            <datalist id={`manual-review-players-${selectedTeam?.id || 'default'}`}>
                                {(selectedTeam?.players || []).map((player) => (
                                    <option key={player.id} value={player.name} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="text-[11px] font-black text-slate-300">英雄</div>
                                <div className="text-[10px] font-semibold text-slate-500">当前队伍英雄会优先出现在联想前面</div>
                            </div>
                            <input
                                ref={heroInputRef}
                                list="manual-review-heroes"
                                value={form.hero}
                                onChange={(event) => setForm((current) => ({ ...current, hero: event.target.value }))}
                                onKeyDown={handleFormKeyDown}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-400/40"
                                placeholder="例如 盲僧 / 沙皇"
                            />
                            <datalist id="manual-review-heroes">
                                {heroOptions.map((hero) => (
                                    <option key={hero} value={hero} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <div className="mb-2 text-[11px] font-black text-slate-300">点评内容</div>
                            <textarea
                                ref={detailInputRef}
                                value={form.detail}
                                onChange={(event) => setForm((current) => ({ ...current, detail: event.target.value }))}
                                onKeyDown={handleFormKeyDown}
                                className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm leading-6 text-white outline-none transition-all focus:border-cyan-400/40"
                                placeholder="写完整点评内容，顶部和列表会自动取第一行作为摘要。"
                            />
                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                                {form.editingId ? (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black text-slate-300 transition-all hover:border-white/20 hover:text-white"
                                    >
                                        取消编辑
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black text-slate-300 transition-all hover:border-white/20 hover:text-white"
                                    >
                                        清空
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={pending}
                                    className="rounded-full border border-blue-300/30 bg-blue-500 px-4 py-2 text-[11px] font-black text-white transition-all hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {pending ? '保存中...' : form.editingId ? '保存修改' : '保存点评'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <div className="max-h-[360px] overflow-y-auto border-t border-white/8 px-4 py-4">
                <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">最近手动点评</div>

                <div className="mb-3 flex items-center justify-end">
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black text-slate-300">
                        当前第{activeGameNumber}局 · {manualEntries.length} 条
                    </div>
                </div>

                <div className="space-y-2.5">
                    {manualEntries.length === 0 && (
                        <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-8 text-center">
                            <div className="text-sm font-black text-slate-200">当前局暂无手动点评</div>
                            <div className="mt-2 text-xs leading-6 text-slate-500">这里只展示你手动保存的结构化点评，不补自动内容。</div>
                        </div>
                    )}

                    {manualEntries.map((entry) => (
                        <div
                            key={entry.id}
                            className="group rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(2,6,23,0.78),rgba(2,6,23,0.58))] px-4 py-3.5 shadow-[0_10px_30px_rgba(2,6,23,0.18)] transition-all hover:border-white/12 hover:bg-[linear-gradient(180deg,rgba(2,6,23,0.88),rgba(2,6,23,0.7))]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
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

                                    <div className="mt-2.5 text-[13px] font-bold leading-5 text-white">{entry.summary}</div>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-400">
                                        <span>{formatReviewLocator(entry.matchDate, entry.opponentTeamName, entry.gameNumber)}</span>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => handleEdit(entry)}
                                        title="编辑点评"
                                        aria-label="编辑点评"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition-all hover:border-white/20 hover:text-white"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(entry)}
                                        title="删除点评"
                                        aria-label="删除点评"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/15 bg-rose-500/10 text-rose-100 transition-all hover:border-rose-400/30 hover:bg-rose-500/15"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {legacyEntries.length > 0 && (
                        <details className="rounded-3xl border border-white/8 bg-slate-950/35 px-4 py-4">
                            <summary className="cursor-pointer list-none text-sm font-black text-slate-200">历史旧版点评（只读）</summary>
                            <div className="mt-4 space-y-2">
                                {legacyEntries.map((entry) => (
                                    <div key={entry.id} className="rounded-2xl border border-white/6 bg-slate-950/45 px-4 py-3">
                                        <div className="text-[11px] font-black text-slate-400">{entry.label}</div>
                                        <div className="mt-1 text-sm font-semibold leading-6 text-slate-200">{entry.summary}</div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            </div>
        </div>
    );
}
