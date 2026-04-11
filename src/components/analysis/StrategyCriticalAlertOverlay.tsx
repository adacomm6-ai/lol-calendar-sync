'use client';

import { useEffect, useMemo, useState } from 'react';

import { dismissStrategyCriticalAlerts, fetchStrategyRuntimeState } from '@/app/strategy/state-actions';
import { getStrategyDateKeyFromIso, type StrategyAlertSnapshot } from '@/lib/odds-strategy';

interface StrategyCriticalAlertOverlayProps {
    matchId: string;
    matchStartTime?: string | Date | null;
}

export default function StrategyCriticalAlertOverlay({ matchId, matchStartTime }: StrategyCriticalAlertOverlayProps) {
    const [snapshot, setSnapshot] = useState<StrategyAlertSnapshot | null>(null);
    const [dismissedKey, setDismissedKey] = useState<string>('');

    useEffect(() => {
        let cancelled = false;

        const reload = async () => {
            const runtime = await fetchStrategyRuntimeState();
            if (cancelled) return;
            setSnapshot(runtime.alertSnapshot);
            setDismissedKey(runtime.dismissedCriticalKey || '');
        };

        void reload();
        const onRefresh = () => {
            void reload();
        };
        window.addEventListener('strategy-alerts-updated', onRefresh as EventListener);
        return () => {
            cancelled = true;
            window.removeEventListener('strategy-alerts-updated', onRefresh as EventListener);
        };
    }, []);

    const matchDateKey = useMemo(
        () => getStrategyDateKeyFromIso(typeof matchStartTime === 'string' ? matchStartTime : matchStartTime?.toISOString(), snapshot?.dayCutoffTime || '06:00'),
        [matchStartTime, snapshot?.dayCutoffTime],
    );
    const criticalKey = useMemo(
        () => (snapshot ? `${snapshot.dateKey}:${snapshot.criticalAlerts.map((item) => item.id).join('|')}:${snapshot.selectedMatchIds.join('|')}` : ''),
        [snapshot],
    );
    const inSelectedMatches = !snapshot || snapshot.selectedMatchIds.length === 0 || snapshot.selectedMatchIds.includes(matchId);
    const show = Boolean(
        snapshot &&
            snapshot.settledRecordCount > 0 &&
            snapshot.criticalAlerts.length > 0 &&
            snapshot.dateKey === matchDateKey &&
            inSelectedMatches &&
            dismissedKey !== criticalKey,
    );

    if (!show || !snapshot) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-rose-950/78 p-6 backdrop-blur-sm">
            <div className="w-full max-w-3xl rounded-[28px] border border-rose-300/30 bg-[#26080d]/95 p-6 shadow-[0_20px_80px_rgba(127,29,29,0.45)]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[12px] font-black uppercase tracking-[0.28em] text-rose-200">比赛页严重预警</div>
                        <h3 className="mt-2 text-3xl font-black text-white">当前比赛日已触发红色风险警戒</h3>
                        <p className="mt-3 text-sm leading-7 text-rose-100/90">你当前停留在比赛详情页，但这场比赛所在策略日已经触发严重预警。建议暂停继续加码，先处理当日回撤与风险敞口。</p>
                    </div>
                    <button
                        type="button"
                        onClick={async () => {
                            await dismissStrategyCriticalAlerts(criticalKey);
                            setDismissedKey(criticalKey);
                            window.dispatchEvent(new Event('strategy-alerts-updated'));
                        }}
                        className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white hover:bg-white/15"
                    >
                        暂时关闭
                    </button>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3">
                    {snapshot.criticalAlerts.map((alert) => (
                        <div key={alert.id} className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-rose-50">
                            <div className="text-base font-black">{alert.title}</div>
                            <div className="mt-2 text-sm leading-6 opacity-95">{alert.message}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
