'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getTeamShortDisplayName } from '@/lib/team-display';

type TeamSummary = {
    id?: string | null;
    name?: string | null;
    shortName?: string | null;
    logo?: string | null;
};

type MatchSummary = {
    id: string;
    teamAId?: string | null;
    teamBId?: string | null;
    winnerId?: string | null;
    status?: string | null;
    format?: string | null;
    tournament?: string | null;
    startTime?: string | number | null;
    teamA?: TeamSummary | null;
    teamB?: TeamSummary | null;
    games?: Array<{ winnerId?: string | null }> | null;
};

type TournamentOption = {
    label: string;
    aliases: string[];
};

interface TeamMatchHistoryClientProps {
    teamId: string;
    tournaments: TournamentOption[];
    initialTournament: string;
    matches: MatchSummary[];
}

function formatMatchDate(value: string | number | null | undefined) {
    if (!value) return '待定';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '待定';

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getSafeImg(src: string | null | undefined) {
    if (!src) return undefined;
    if (src.startsWith('/')) return src;
    return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

export default function TeamMatchHistoryClient({
    teamId,
    tournaments,
    initialTournament,
    matches,
}: TeamMatchHistoryClientProps) {
    const [selectedTournament, setSelectedTournament] = useState(initialTournament);

    const displayedMatches = useMemo(() => {
        if (selectedTournament === 'All') {
            return matches;
        }

        const aliases = tournaments.find((item) => item.label === selectedTournament)?.aliases || [selectedTournament];
        const aliasSet = new Set(aliases.map((item) => String(item || '').trim()));
        return matches.filter((match) => aliasSet.has(String(match.tournament || '').trim()));
    }, [matches, selectedTournament, tournaments]);

    const updateTournament = (nextTournament: string) => {
        setSelectedTournament(nextTournament);

        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (nextTournament === 'All') {
            url.searchParams.delete('tournament');
        } else {
            url.searchParams.set('tournament', nextTournament);
        }
        window.history.replaceState(null, '', url.toString());
    };

    return (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-blue-600"></div>
                    <h3 className="text-base font-bold text-gray-900">比赛记录</h3>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                    {tournaments.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            onClick={() => updateTournament(item.label)}
                            className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                                selectedTournament === item.label
                                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-500 hover:border-blue-300 hover:text-blue-600'
                            }`}
                        >
                            {item.label === 'All' ? '全部赛事' : item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="divide-y divide-gray-50">
                {displayedMatches.map((match) => {
                    const isWin = match.winnerId === teamId;
                    const badgeColor = isWin ? 'bg-[#3B82F6]' : 'bg-[#EF4444]';
                    const badgeText = isWin ? '胜' : '负';
                    const teamAScore = (match.games || []).filter((game) => game.winnerId === match.teamAId).length;
                    const teamBScore = (match.games || []).filter((game) => game.winnerId === match.teamBId).length;
                    const teamADisplayName = getTeamShortDisplayName(match.teamA);
                    const teamBDisplayName = getTeamShortDisplayName(match.teamB);

                    return (
                        <Link key={match.id} href={`/match/${match.id}`} className="group block transition-colors hover:bg-gray-50">
                            <div className="flex h-[72px] items-center px-6 py-4">
                                <div className="flex w-[280px] items-center gap-4">
                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${match.status === 'FINISHED' ? badgeColor : 'bg-gray-300'}`}>
                                        {match.status === 'FINISHED' ? badgeText : '-'}
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-xs text-gray-400">
                                            <span className="max-w-[100px] truncate font-bold text-gray-500" title={match.tournament || ''}>
                                                {match.tournament}
                                            </span>
                                            <span className="font-medium text-gray-400">|</span>
                                            <span className="font-medium text-gray-600">{formatMatchDate(match.startTime)}</span>
                                            <span className="rounded bg-gray-100 px-1 font-bold uppercase text-gray-700">{match.format}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-1 items-center justify-center gap-6">
                                    <div className="flex w-[140px] items-center justify-end gap-3">
                                        <span className={`text-sm font-bold ${match.winnerId === match.teamA?.id ? 'text-gray-900' : 'text-gray-500'}`}>
                                            {teamADisplayName}
                                        </span>
                                        {match.teamA?.logo ? (
                                            <div className="relative h-4 w-4 shrink-0">
                                                <Image src={getSafeImg(match.teamA.logo) || ''} alt="" fill className="object-contain" unoptimized />
                                            </div>
                                        ) : (
                                            <div className="h-4 w-4 rounded-full bg-gray-100"></div>
                                        )}
                                    </div>

                                    <div className="min-w-[60px] text-center">
                                        {match.status === 'FINISHED' ? (
                                            <div className="flex flex-col items-center">
                                                <span className="font-din text-2xl font-black tracking-widest text-gray-900">
                                                    {teamAScore}
                                                    <span className="mx-1 text-gray-300">:</span>
                                                    {teamBScore}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-lg font-bold text-gray-300">VS</span>
                                        )}
                                    </div>

                                    <div className="flex w-[140px] items-center justify-start gap-3">
                                        {match.teamB?.logo ? (
                                            <div className="relative h-4 w-4 shrink-0">
                                                <Image src={getSafeImg(match.teamB.logo) || ''} alt="" fill className="object-contain" unoptimized />
                                            </div>
                                        ) : (
                                            <div className="h-4 w-4 rounded-full bg-gray-100"></div>
                                        )}
                                        <span className={`text-sm font-bold ${match.winnerId === match.teamB?.id ? 'text-gray-900' : 'text-gray-500'}`}>
                                            {teamBDisplayName}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex w-[150px] items-center justify-end gap-6 opacity-0 transition-opacity group-hover:opacity-100">
                                    <div className="flex cursor-pointer items-center gap-1 text-blue-500 transition-colors hover:text-blue-600">
                                        <span className="text-xs font-bold">查看详情 →</span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    );
                })}

                {displayedMatches.length === 0 && (
                    <div className="p-12 text-center text-sm text-gray-400">暂无该赛事比赛记录</div>
                )}
            </div>
        </div>
    );
}
