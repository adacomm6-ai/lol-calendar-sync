'use client';

import React, { useState } from 'react';
import { Clock, Swords } from 'lucide-react';
import RecentFormPreview from './RecentFormPreview';

interface TeamRecentStatsProps {
    averageDuration: string | number;
    averageKills: number | string;
    averageTenMinKills?: number | string;
    matchCount?: number;
    teamId?: string;
    recentMatches?: any[];
}

export default function TeamRecentStats({
    averageDuration,
    averageKills,
    averageTenMinKills = '暂无',
    matchCount = 3,
    teamId,
    recentMatches = [],
}: TeamRecentStatsProps) {
    const [showPopover, setShowPopover] = useState(false);

    return (
        <div className="relative w-full">
            <div
                className="relative w-full cursor-help overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-[#0f172a] to-[#1e293b] text-white shadow-xl transition-all active:scale-[0.99]"
                onMouseEnter={() => setShowPopover(true)}
                onMouseLeave={() => setShowPopover(false)}
            >
                <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-3xl" />
                <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 -translate-x-1/2 translate-y-1/2 rounded-full bg-red-600/10 blur-3xl" />

                <div className="relative z-10 flex items-center justify-between border-b border-gray-700/50 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-400 to-blue-600" />
                        <div>
                            <h3 className="text-base font-bold tracking-wide text-gray-100">
                                近期表现分析
                                <span className="ml-1 text-xs font-normal text-gray-500">
                                    （最近 {matchCount} 个 BO3/BO5 大场）
                                </span>
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 grid grid-cols-1 gap-px bg-gray-700/50 md:grid-cols-3">
                    <div className="group relative flex items-center gap-5 overflow-hidden bg-[#0f172a]/95 p-6 transition-colors hover:bg-[#131f36]">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/20 to-cyan-500/5 shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-colors group-hover:border-blue-500/40">
                            <Clock className="relative z-10 h-8 w-8 text-blue-400" strokeWidth={1.5} />
                        </div>
                        <div className="flex flex-col">
                            <span className="mb-0.5 text-xs font-bold uppercase tracking-wider text-blue-400/80">
                                平均比赛时长
                            </span>
                            <div className="flex items-baseline gap-1 text-4xl font-black tracking-tight text-white">
                                {averageDuration}
                                <span className="text-sm font-medium text-gray-500">分钟</span>
                            </div>
                        </div>
                    </div>

                    <div className="group relative flex items-center gap-5 overflow-hidden bg-[#0f172a]/95 p-6 transition-colors hover:bg-[#131f36]">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/20 to-orange-500/5 shadow-[0_0_15px_rgba(239,68,68,0.15)] transition-colors group-hover:border-red-500/40">
                            <Swords className="relative z-10 h-8 w-8 text-red-400" strokeWidth={1.5} />
                        </div>
                        <div className="flex flex-col">
                            <span className="mb-0.5 text-xs font-bold uppercase tracking-wider text-red-400/80">
                                场均总击杀
                            </span>
                            <div className="flex items-baseline gap-1 text-4xl font-black tracking-tight text-white">
                                {averageKills}
                            </div>
                        </div>
                    </div>

                    <div className="group relative flex items-center gap-5 overflow-hidden bg-[#0f172a]/95 p-6 transition-colors hover:bg-[#131f36]">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/20 to-yellow-500/5 shadow-[0_0_15px_rgba(245,158,11,0.15)] transition-colors group-hover:border-amber-500/40">
                            <Clock className="relative z-10 h-8 w-8 text-amber-400" strokeWidth={1.5} />
                        </div>
                        <div className="flex flex-col">
                            <span className="mb-0.5 text-xs font-bold uppercase tracking-wider text-amber-400/80">
                                10分钟总人头
                            </span>
                            <div className="flex items-baseline gap-1 text-4xl font-black tracking-tight text-white">
                                {averageTenMinKills}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showPopover && teamId && recentMatches.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-2 absolute left-0 top-[calc(100%+8px)] z-[100] duration-200">
                    <RecentFormPreview
                        teamId={teamId}
                        matches={recentMatches}
                        averageDuration={averageDuration.toString()}
                        averageKills={averageKills.toString()}
                        averageTenMinKills={averageTenMinKills.toString()}
                    />
                </div>
            )}
        </div>
    );
}
