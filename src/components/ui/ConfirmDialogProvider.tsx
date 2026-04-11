'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { registerConfirmHandler, type ConfirmOptions } from '@/lib/confirm-dialog';

interface ConfirmDialogContextValue {
    openConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

interface PendingConfirm extends ConfirmOptions {
    id: number;
    resolve: (accepted: boolean) => void;
}

export default function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
    const [pending, setPending] = useState<PendingConfirm | null>(null);

    const close = useCallback((accepted: boolean) => {
        setPending((prev) => {
            if (prev) prev.resolve(accepted);
            return null;
        });
    }, []);

    const openConfirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setPending({
                id: Date.now(),
                resolve,
                title: options.title,
                message: options.message,
                confirmText: options.confirmText,
                cancelText: options.cancelText,
                tone: options.tone,
            });
        });
    }, []);

    useEffect(() => {
        registerConfirmHandler(openConfirm);
        return () => registerConfirmHandler(null);
    }, [openConfirm]);

    useEffect(() => {
        if (!pending) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [pending, close]);

    const ctx = useMemo(() => ({ openConfirm }), [openConfirm]);

    return (
        <ConfirmDialogContext.Provider value={ctx}>
            {children}

            {pending && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                        aria-label="关闭确认弹窗"
                        onClick={() => close(false)}
                    />
                    <div className="relative z-[2001] w-full max-w-md rounded-2xl border border-white/15 bg-slate-950/95 p-5 shadow-2xl shadow-black/60">
                        <div className="text-lg font-black text-white">{pending.title || '确认操作'}</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{pending.message}</div>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => close(false)}
                                className="h-10 rounded-xl border border-white/15 bg-slate-800 px-4 text-sm font-bold text-slate-300 transition-all hover:bg-slate-700 hover:text-white"
                            >
                                {pending.cancelText || '取消'}
                            </button>
                            <button
                                type="button"
                                onClick={() => close(true)}
                                className={`h-10 rounded-xl px-4 text-sm font-black text-white transition-all ${
                                    pending.tone === 'danger'
                                        ? 'border border-rose-400/35 bg-rose-500/80 hover:bg-rose-500'
                                        : 'border border-cyan-400/35 bg-cyan-500/80 hover:bg-cyan-500'
                                }`}
                            >
                                {pending.confirmText || '确定'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmDialogContext.Provider>
    );
}

export function useConfirmDialog() {
    const ctx = useContext(ConfirmDialogContext);
    if (!ctx) {
        throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
    }
    return ctx;
}
