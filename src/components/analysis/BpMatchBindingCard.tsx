'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type BpMatchBindingCardProps = {
    matchId: string;
    currentSourceMatchId?: string | null;
};

const TEXT = {
    emptyInput: '\u8bf7\u8f93\u5165 BP \u9875\u9762\u91cc\u7684\u5f53\u524d\u5927\u573aID\u3002',
    bindFailed: '\u7ed1\u5b9a\u5931\u8d25',
    bindSuccess: '\u7ed1\u5b9a\u6210\u529f\uff0c\u540e\u7eed\u540c\u4e00\u4e2a BP \u5927\u573aID \u4f1a\u4f18\u5148\u540c\u6b65\u5230\u8fd9\u573a\u6bd4\u8d5b\u3002',
    unbindFailed: '\u89e3\u9664\u7ed1\u5b9a\u5931\u8d25',
    unbindSuccess: '\u89e3\u9664\u6210\u529f\uff0c\u73b0\u5728\u53ef\u4ee5\u91cd\u65b0\u628a\u8fd9\u4e2a BP \u5927\u573aID \u7ed1\u5b9a\u5230\u5f53\u524d\u6bd4\u8d5b\u3002',
    title: 'BP Match \u663e\u5f0f\u7ed1\u5b9a',
    description: '\u628a BP \u9875\u9762\u9876\u90e8\u663e\u793a\u7684\u201c\u5f53\u524d\u5927\u573aID\u201d\u7ed1\u5b9a\u5230\u5f53\u524d\u6bd4\u8d5b\u3002\u7ed1\u5b9a\u540e\uff0c\u540c\u961f\u4f0d\u540c\u65e5\u591a\u573a\u65f6\u4e5f\u4f1a\u4f18\u5148\u540c\u6b65\u5230\u8fd9\u91cc\uff0c\u4e0d\u4f1a\u518d\u9760\u65e5\u671f\u6a21\u7cca\u5339\u914d\u3002',
    currentBinding: '\u5f53\u524d\u7ed1\u5b9a\uff1a',
    unbound: '\u672a\u7ed1\u5b9a',
    placeholder: '\u4f8b\u5982\uff1amanual:1773078935309:107717',
    binding: '\u7ed1\u5b9a\u4e2d...',
    bindNow: '\u7ed1\u5b9a\u5f53\u524d\u6bd4\u8d5b',
    unbinding: '\u89e3\u9664\u4e2d...',
    unbindNow: '\u89e3\u9664\u8be5BP\u7ed1\u5b9a',
} as const;

export default function BpMatchBindingCard({ matchId, currentSourceMatchId }: BpMatchBindingCardProps) {
    const router = useRouter();
    const [sourceMatchId, setSourceMatchId] = useState(currentSourceMatchId || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        setSourceMatchId(currentSourceMatchId || '');
    }, [currentSourceMatchId]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmed = sourceMatchId.trim();
        if (!trimmed) {
            setError(TEXT.emptyInput);
            setSuccess(null);
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch('/api/bp-sync/bind', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    matchId,
                    sourceMatchId: trimmed,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
                throw new Error(String(payload?.message || TEXT.bindFailed));
            }

            setSourceMatchId(String(payload.sourceMatchId || trimmed));
            setSuccess(TEXT.bindSuccess);
            router.refresh();
        } catch (requestError: any) {
            setError(String(requestError?.message || TEXT.bindFailed));
        } finally {
            setSaving(false);
        }
    }

    async function handleUnbind() {
        const trimmed = sourceMatchId.trim() || String(currentSourceMatchId || '').trim();
        if (!trimmed) {
            setError(TEXT.emptyInput);
            setSuccess(null);
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch('/api/bp-sync/unbind', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    matchId,
                    sourceMatchId: trimmed,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
                throw new Error(String(payload?.message || TEXT.unbindFailed));
            }

            setSuccess(TEXT.unbindSuccess);
            router.refresh();
        } catch (requestError: any) {
            setError(String(requestError?.message || TEXT.unbindFailed));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="glass rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex flex-col gap-3">
                <div>
                    <div className="text-sm font-black tracking-wide text-cyan-200">{TEXT.title}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-300">{TEXT.description}</p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                    {TEXT.currentBinding}
                    <span className="ml-2 font-mono text-cyan-200">{currentSourceMatchId || TEXT.unbound}</span>
                </div>

                <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={sourceMatchId}
                        onChange={(event) => setSourceMatchId(event.target.value)}
                        placeholder={TEXT.placeholder}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? TEXT.binding : TEXT.bindNow}
                        </button>
                        <button
                            type="button"
                            onClick={handleUnbind}
                            disabled={saving}
                            className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? TEXT.unbinding : TEXT.unbindNow}
                        </button>
                    </div>
                </form>

                {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>}
                {success && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{success}</div>}
            </div>
        </div>
    );
}
