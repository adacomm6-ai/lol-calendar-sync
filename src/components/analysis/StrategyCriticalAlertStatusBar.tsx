'use client';

import { useEffect, useMemo, useState } from 'react';

import { fetchStrategyRuntimeState } from '@/app/strategy/state-actions';
import { getStrategyDateKeyFromIso, type StrategyAlertSnapshot } from '@/lib/odds-strategy';

interface StrategyCriticalAlertStatusBarProps {
    matchId: string;
    matchStartTime?: string | Date | null;
}

function getStatusTone(status: 'inactive' | 'idle' | 'ready' | 'out_of_scope') {
    if (status === 'ready') return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
    if (status === 'idle') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
    if (status === 'out_of_scope') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
    return 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100';
}

function getStatusLabel(status: 'inactive' | 'idle' | 'ready' | 'out_of_scope') {
    if (status === 'ready') return '已触发严重预警';
    if (status === 'idle') return '当前安全';
    if (status === 'out_of_scope') return '不在当前策略范围';
    return '待策略数据激活';
}

export default function StrategyCriticalAlertStatusBar({ matchId, matchStartTime }: StrategyCriticalAlertStatusBarProps) {
    const [snapshot, setSnapshot] = useState<StrategyAlertSnapshot | null>(null);

    useEffect(() => {
        let cancelled = false;

        const reload = async () => {
            const runtime = await fetchStrategyRuntimeState();
            if (cancelled) return;
            setSnapshot(runtime.alertSnapshot);
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

    const inSelectedMatches = !snapshot || snapshot.selectedMatchIds.length === 0 || snapshot.selectedMatchIds.includes(matchId);
    const sameStrategyDay = !!snapshot && snapshot.dateKey === matchDateKey;

    if (!snapshot || (!sameStrategyDay && !inSelectedMatches)) return null;

    const status: 'inactive' | 'idle' | 'ready' | 'out_of_scope' =
        !sameStrategyDay || !inSelectedMatches
            ? 'out_of_scope'
            : snapshot.settledRecordCount <= 0
              ? 'inactive'
              : snapshot.criticalAlerts.length > 0
                ? 'ready'
                : 'idle';

    const message =
        status === 'inactive'
            ? '当前策略日还没有足够的已结算样本，预警模块暂不启动。'
            : status === 'ready'
              ? '当前比赛所在策略日已经触发严重预警，建议暂停加注，先处理回撤与风险敞口。'
              : status === 'out_of_scope'
                ? '这场比赛不在当前策略日或已选比赛范围内，状态条仅作提示，不参与当前策略预警。'
                : '当前策略日已经有足够已结算样本，但还没有触发严重预警，可以继续按计划执行。';

    return (
        <div className={`mb-4 rounded-2xl border px-4 py-3 ${getStatusTone(status)}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-80">策略预警状态</div>
                    <div className="mt-1 text-sm font-black">{getStatusLabel(status)}</div>
                    <div className="mt-1 text-xs leading-6 opacity-90">{message}</div>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs lg:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                        <div className="opacity-70">已结算样本</div>
                        <div className="mt-1 font-black">{snapshot.settledRecordCount} 条</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                        <div className="opacity-70">严重预警</div>
                        <div className="mt-1 font-black">{snapshot.criticalAlerts.length} 条</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                        <div className="opacity-70">策略日窗口</div>
                        <div className="mt-1 font-black">{snapshot.dateKey} / 截止 {snapshot.dayCutoffTime}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
