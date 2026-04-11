'use client';

import { useEffect, useMemo, useState } from 'react';

import { fetchManualOddsRecords, mergeLegacyManualOddsRecords } from '@/app/manual-odds/actions';

import {
    formatCounter,
    formatSignedNumber,
    formatWinRate,
    LEGACY_MANUAL_ODDS_MIGRATION_KEY,
    loadAllLegacyStoredOdds,
    summarizeGlobalOverUnder,
    type StoredOddsResult,
} from '@/lib/odds-history';

export default function VirtualBetGlobalSummary() {
    const [records, setRecords] = useState<StoredOddsResult[]>([]);

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
                console.error('reload virtual bet global summary failed', error);
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

    const summary = useMemo(() => summarizeGlobalOverUnder(records), [records]);

    const rows = [
        { label: '大人头', metric: summary.killsOver },
        { label: '小人头', metric: summary.killsUnder },
        { label: '大时间', metric: summary.timeOver },
        { label: '小时间', metric: summary.timeUnder },
    ];

    return (
        <div className="glass rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">历史盘口结果总览</div>
                    <div className="mt-1 text-xs text-slate-400">全场次统计（手动录入结果数值）</div>
                </div>
                <div className="text-xs text-slate-500">累计记录: {records.length}</div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                        <div className="text-sm font-black text-white">{row.label}</div>
                        <div className="mt-1 text-lg font-black text-cyan-300">{formatSignedNumber(row.metric.total)}</div>
                        <div className="mt-1 text-xs text-white">胜率 {formatWinRate(row.metric.winRate)}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatCounter(row.metric.counter)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
