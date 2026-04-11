'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import TeamLogo from '@/components/TeamLogo';

type SortKey =
    | 'winRate'
    | 'gameWinRate'
    | 'kda'
    | 'matchCount'
    | 'bo1WinRate'
    | 'bo3WinRate'
    | 'bo5WinRate'
    | 'avgDuration'
    | 'avgTotalKills'
    | 'avgKills'
    | 'avgDeaths';

type TeamRow = {
    id: string;
    name: string;
    shortName: string;
    logo: string | null;
    winRate: number;
    gameWinRate: number;
    matchCount: number;
    matchWins: number;
    bo1WinRate: number | null;
    bo1MatchCount: number;
    bo1MatchWins: number;
    bo3WinRate: number | null;
    bo3MatchCount: number;
    bo3MatchWins: number;
    bo5WinRate: number | null;
    bo5MatchCount: number;
    bo5MatchWins: number;
    gameCount: number;
    gameWins: number;
    kda: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgDurationSec: number | null;
    avgTotalKills: number | null;
};

function formatDuration(sec: number | null): string {
    if (!sec || sec <= 0) return '-';
    const s = Math.floor(sec);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function formatOne(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '-';
    return value.toFixed(1);
}

function getSortValue(row: TeamRow, key: SortKey): number {
    switch (key) {
        case 'winRate':
            return row.winRate;
        case 'gameWinRate':
            return row.gameWinRate;
        case 'kda':
            return row.kda;
        case 'matchCount':
            return row.matchCount;
        case 'bo1WinRate':
            return row.bo1WinRate ?? -1;
        case 'bo3WinRate':
            return row.bo3WinRate ?? -1;
        case 'bo5WinRate':
            return row.bo5WinRate ?? -1;
        case 'avgDuration':
            return row.avgDurationSec ?? -1;
        case 'avgTotalKills':
            return row.avgTotalKills ?? -1;
        case 'avgKills':
            return row.avgKills;
        case 'avgDeaths':
            return row.avgDeaths;
        default:
            return row.winRate;
    }
}

function getSortIndicator(currentKey: SortKey, key: SortKey, order: 'asc' | 'desc') {
    if (currentKey !== key) return '↕';
    return order === 'desc' ? '▼' : '▲';
}

function renderRateWithRecord(rate: number | null, wins: number, total: number) {
    if (rate === null || total <= 0) {
        return <span className='text-slate-500'>-</span>;
    }

    return (
        <>
            <div className='flex items-center gap-2'>
                <span className='w-12 text-right font-black text-blue-700'>{rate.toFixed(1)}%</span>
                <div className='h-3 flex-1 bg-blue-100 rounded-full overflow-hidden'>
                    <div className='h-full bg-blue-500' style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
                </div>
            </div>
            <div className='text-xs text-slate-500 text-right mt-1'>
                {wins}胜 / {total - wins}负
            </div>
        </>
    );
}

export default function TeamsStatsTableClient({
    rows,
    hasDuration,
    selectedRegion,
    initialSortKey,
    initialOrder,
}: {
    rows: TeamRow[];
    hasDuration: boolean;
    selectedRegion: string;
    initialSortKey: SortKey;
    initialOrder: 'asc' | 'desc';
}) {
    const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialOrder);

    const sortedRows = useMemo(() => {
        return [...rows].sort((a, b) => {
            const av = getSortValue(a, sortKey);
            const bv = getSortValue(b, sortKey);

            if (av !== bv) return sortOrder === 'asc' ? av - bv : bv - av;
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            if (b.gameWinRate !== a.gameWinRate) return b.gameWinRate - a.gameWinRate;
            if (b.kda !== a.kda) return b.kda - a.kda;
            return a.shortName.localeCompare(b.shortName);
        });
    }, [rows, sortKey, sortOrder]);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
            return;
        }
        setSortKey(key);
        setSortOrder('desc');
    };

    const SortHeader = ({ label, keyName }: { label: string; keyName: SortKey }) => (
        <th className='px-4 py-3 text-center font-bold text-slate-700 whitespace-nowrap'>
            <button
                type='button'
                onClick={() => toggleSort(keyName)}
                className='inline-flex items-center gap-1 hover:text-blue-600 transition-colors'
            >
                <span>{label}</span>
                <span className='text-[11px] text-slate-400'>{getSortIndicator(sortKey, keyName, sortOrder)}</span>
            </button>
        </th>
    );

    const emptyColSpan = 12 + (hasDuration ? 1 : 0);

    return (
        <div className='bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden'>
            <div className='overflow-x-auto'>
                <table className='min-w-[1480px] w-full text-[14px] text-slate-800'>
                    <thead className='bg-slate-100 border-b border-slate-200'>
                        <tr>
                            <th className='px-4 py-3 text-center font-bold text-slate-700 whitespace-nowrap'>排名</th>
                            <th className='px-4 py-3 text-left font-bold text-slate-700 whitespace-nowrap'>战队</th>
                            <SortHeader label='胜率' keyName='winRate' />
                            <SortHeader label='小场胜率' keyName='gameWinRate' />
                            <SortHeader label='BO1胜率' keyName='bo1WinRate' />
                            <SortHeader label='BO3胜率' keyName='bo3WinRate' />
                            <SortHeader label='BO5胜率' keyName='bo5WinRate' />
                            <SortHeader label='KDA' keyName='kda' />
                            <SortHeader label='比赛场数' keyName='matchCount' />
                            {hasDuration && <SortHeader label='场均时长' keyName='avgDuration' />}
                            <SortHeader label='场均总击杀' keyName='avgTotalKills' />
                            <SortHeader label='场均击杀' keyName='avgKills' />
                            <SortHeader label='场均死亡' keyName='avgDeaths' />
                        </tr>
                    </thead>

                    <tbody>
                        {sortedRows.length === 0 ? (
                            <tr>
                                <td colSpan={emptyColSpan} className='py-14 text-center text-slate-500 font-medium'>
                                    当前筛选下没有可展示的战队数据
                                </td>
                            </tr>
                        ) : (
                            sortedRows.map((row, idx) => (
                                <tr key={row.id} className='border-t border-slate-200 hover:bg-slate-50'>
                                    <td className='px-4 py-3 text-center font-bold text-slate-900'>{idx + 1}</td>

                                    <td className='px-4 py-3'>
                                        <Link href={`/teams/${row.id}`} className='flex items-center gap-3 group'>
                                            <div className='w-8 h-8 shrink-0'>
                                                <TeamLogo src={row.logo} name={row.name} className='w-8 h-8 object-contain' size={32} region={selectedRegion} />
                                            </div>
                                            <div>
                                                <div className='font-bold text-slate-900 group-hover:text-blue-600 transition-colors'>{row.shortName}</div>
                                                <div className='text-xs text-slate-500'>{row.name}</div>
                                            </div>
                                        </Link>
                                    </td>

                                    <td className='px-4 py-3'>{renderRateWithRecord(row.winRate, row.matchWins, row.matchCount)}</td>
                                    <td className='px-4 py-3'>{renderRateWithRecord(row.gameWinRate, row.gameWins, row.gameCount)}</td>
                                    <td className='px-4 py-3'>{renderRateWithRecord(row.bo1WinRate, row.bo1MatchWins, row.bo1MatchCount)}</td>
                                    <td className='px-4 py-3'>{renderRateWithRecord(row.bo3WinRate, row.bo3MatchWins, row.bo3MatchCount)}</td>
                                    <td className='px-4 py-3'>{renderRateWithRecord(row.bo5WinRate, row.bo5MatchWins, row.bo5MatchCount)}</td>

                                    <td className='px-4 py-3 text-center'>
                                        <div className='text-blue-700 font-black'>{row.kda.toFixed(1)} KDA</div>
                                        <div className='text-xs text-slate-600'>
                                            {row.avgKills.toFixed(1)} / {row.avgDeaths.toFixed(1)} / {row.avgAssists.toFixed(1)}
                                        </div>
                                    </td>

                                    <td className='px-4 py-3 text-center font-semibold text-slate-800'>{row.matchCount}</td>
                                    {hasDuration && <td className='px-4 py-3 text-center font-semibold text-slate-800'>{formatDuration(row.avgDurationSec)}</td>}
                                    <td className='px-4 py-3 text-center font-semibold text-slate-800'>{formatOne(row.avgTotalKills)}</td>
                                    <td className='px-4 py-3 text-center font-semibold text-slate-800'>{row.avgKills.toFixed(1)}</td>
                                    <td className='px-4 py-3 text-center font-semibold text-slate-800'>{row.avgDeaths.toFixed(1)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


