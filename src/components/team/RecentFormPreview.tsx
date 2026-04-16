'use client';

import Image from 'next/image';
import { Calendar, Clock, ExternalLink, Swords, Timer } from 'lucide-react';

import { getCompletedSeriesGames } from '@/lib/recent-series-stats';
import { getTeamShortDisplayName } from '@/lib/team-display';

interface GameData {
    gameNumber: number;
    duration: number | null;
    totalKills: number | null;
    blueTenMinKills?: number | null;
    redTenMinKills?: number | null;
    winnerId: string | null;
}

interface MatchData {
    id: string;
    startTime: string | null;
    teamAId: string;
    teamBId: string;
    teamA: { name: string; shortName: string | null; logo: string | null };
    teamB: { name: string; shortName: string | null; logo: string | null };
    tournament: string;
    format?: string | null;
    games: GameData[];
    winnerId: string | null;
}

interface RecentFormPreviewProps {
    teamId: string;
    matches: MatchData[];
    averageDuration: string;
    averageKills: string;
    averageTenMinKills?: string;
}

function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getGameTenMinKills(game: GameData) {
    const hasBlue = game.blueTenMinKills !== null && game.blueTenMinKills !== undefined;
    const hasRed = game.redTenMinKills !== null && game.redTenMinKills !== undefined;
    if (!hasBlue || !hasRed) return null;
    return Number(game.blueTenMinKills) + Number(game.redTenMinKills);
}

function getSeriesSummary(games: GameData[]) {
    let durationSum = 0;
    let durationCount = 0;
    let totalKillsSum = 0;
    let totalKillsCount = 0;
    let tenMinKillsSum = 0;
    let tenMinKillsCount = 0;

    for (const game of games) {
        if (game.duration !== null && game.duration !== undefined) {
            durationSum += game.duration;
            durationCount += 1;
        }
        if (game.totalKills !== null && game.totalKills !== undefined) {
            totalKillsSum += game.totalKills;
            totalKillsCount += 1;
        }
        const tenMinKills = getGameTenMinKills(game);
        if (tenMinKills !== null) {
            tenMinKillsSum += tenMinKills;
            tenMinKillsCount += 1;
        }
    }

    return {
        averageDuration: durationCount > 0 ? formatDuration(Math.floor(durationSum / durationCount)) : '--',
        averageKills: totalKillsCount > 0 ? (totalKillsSum / totalKillsCount).toFixed(1) : '--',
        averageTenMinKills: tenMinKillsCount > 0 ? (tenMinKillsSum / tenMinKillsCount).toFixed(1) : '--',
    };
}

function formatMatchDate(value: string | null) {
    if (!value) return '未知日期';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未知日期';
    return date.toLocaleDateString('zh-CN');
}

export default function RecentFormPreview({
    teamId,
    matches,
    averageDuration,
    averageKills,
    averageTenMinKills = '--',
}: RecentFormPreviewProps) {
    return (
        <div className="w-[min(460px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-gray-800 bg-[#0f172a] text-white shadow-2xl">
            <div className="border-b border-gray-800 bg-gradient-to-r from-blue-900/20 to-transparent p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-blue-400">
                        <div className="h-3 w-1 rounded-full bg-blue-500" />
                        {`近期表现详情（最近 ${matches.length} 个大场）`}
                    </h4>
                    <div className="shrink-0 text-[10px] font-black tracking-widest text-gray-500">均值概览</div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/5 bg-slate-900/50 p-3">
                        <div className="mb-1 flex items-center gap-2 text-gray-400">
                            <Clock className="h-3 w-3" />
                            <span className="text-[10px] font-bold">平均时长</span>
                        </div>
                        <div className="text-xl font-black">
                            {averageDuration} <span className="text-xs font-normal text-gray-500">分钟</span>
                        </div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-slate-900/50 p-3">
                        <div className="mb-1 flex items-center gap-2 text-gray-400">
                            <Swords className="h-3 w-3" />
                            <span className="text-[10px] font-bold">场均总击杀</span>
                        </div>
                        <div className="text-xl font-black">{averageKills}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-slate-900/50 p-3">
                        <div className="mb-1 flex items-center gap-2 text-gray-400">
                            <Timer className="h-3 w-3" />
                            <span className="text-[10px] font-bold">10分钟总人头</span>
                        </div>
                        <div className="text-xl font-black">{averageTenMinKills}</div>
                    </div>
                </div>
            </div>

            <div className="max-h-[min(68vh,620px)] space-y-2 overflow-y-auto overscroll-contain p-2">
                {matches.map((match) => {
                    const isWin = match.winnerId === teamId;
                    const opponent = match.teamAId === teamId ? match.teamB : match.teamA;
                    const opponentDisplayName = getTeamShortDisplayName(opponent);
                    const completedGames = getCompletedSeriesGames(match.format ?? null, match.games).filter(
                        (game) =>
                            game.duration != null ||
                            game.totalKills != null ||
                            game.winnerId != null ||
                            game.blueTenMinKills != null ||
                            game.redTenMinKills != null,
                    );
                    const seriesSummary = getSeriesSummary(completedGames);

                    return (
                        <div
                            key={match.id}
                            className="overflow-hidden rounded-xl border border-white/5 bg-slate-900/40 transition-colors hover:border-white/10"
                        >
                            <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-3 py-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${isWin ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    <span className="truncate text-[10px] font-bold text-gray-400">{match.tournament}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 text-gray-500">
                                    <Calendar className="h-3 w-3" />
                                    <span className="text-[10px] font-medium">{formatMatchDate(match.startTime)}</span>
                                </div>
                            </div>

                            <div className="p-3">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-slate-800">
                                            {opponent.logo && (
                                                <Image
                                                    src={opponent.logo}
                                                    alt=""
                                                    width={16}
                                                    height={16}
                                                    unoptimized
                                                    className="h-4 w-4 object-contain"
                                                />
                                            )}
                                        </div>
                                        <span className="truncate text-xs font-black tracking-tight text-gray-200">
                                            {`VS ${opponentDisplayName}`}
                                        </span>
                                    </div>
                                    <div
                                        className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-black tracking-tighter ${
                                            isWin ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                        }`}
                                    >
                                        {isWin ? '胜' : '负'}
                                    </div>
                                </div>

                                <div className="mb-3 grid grid-cols-3 gap-2">
                                    <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-center">
                                        <div className="text-[9px] font-bold text-gray-500">本场均时长</div>
                                        <div className="mt-1 text-[11px] font-black text-white">{seriesSummary.averageDuration}</div>
                                    </div>
                                    <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-center">
                                        <div className="text-[9px] font-bold text-gray-500">本场均总击杀</div>
                                        <div className="mt-1 text-[11px] font-black text-white">{seriesSummary.averageKills}</div>
                                    </div>
                                    <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-center">
                                        <div className="text-[9px] font-bold text-gray-500">本场均10分钟人头</div>
                                        <div className="mt-1 text-[11px] font-black text-white">{seriesSummary.averageTenMinKills}</div>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    {completedGames.map((game) => {
                                        const gameWinner = game.winnerId === teamId;
                                        const tenMinKills = getGameTenMinKills(game);

                                        return (
                                            <div
                                                key={`${match.id}-${game.gameNumber}`}
                                                className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-2 py-1.5 text-[10px]"
                                            >
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="shrink-0 font-bold text-gray-500">{`第${game.gameNumber}局`}</span>
                                                    <span className={`shrink-0 font-black ${gameWinner ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {gameWinner ? 'W' : 'L'}
                                                    </span>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-3 text-gray-400">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="h-2.5 w-2.5" />
                                                        <span>{game.duration ? formatDuration(game.duration) : '--'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Swords className="h-2.5 w-2.5" />
                                                        <span>{game.totalKills ?? '--'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Timer className="h-2.5 w-2.5" />
                                                        <span>{tenMinKills ?? '--'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-center border-t border-gray-800 bg-white/[0.02] p-3">
                <div className="flex cursor-pointer items-center gap-1 text-[10px] font-bold text-gray-500 transition-colors hover:text-blue-400">
                    点击跳转数据板块 <ExternalLink className="h-2.5 w-2.5" />
                </div>
            </div>
        </div>
    );
}
