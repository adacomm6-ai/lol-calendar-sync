'use client';

import React, { useState } from 'react';
import RecentFormPreview from '@/components/team/RecentFormPreview';
import TeamRecentStats from '@/components/team/TeamRecentStats';

// Mock Data for AL
const MOCK_MATCH_DATA = [
    {
        id: 'match-1',
        startTime: '2026-03-01T15:00:00Z',
        teamA: { name: 'Anyone\'s Legend', shortName: 'AL', logo: '/api/image-proxy?url=https%3A%2F%2Fam-a.akamaihd.net%2Fimage%3Ff%3Dhttps%253A%252F%252Flpl.qq.com%252Fes%252Fstats%252Fteam%252F2024%252F1710313837865.png' },
        teamB: { name: 'Invictus Gaming', shortName: 'IG', logo: '/api/image-proxy?url=https%3A%2F%2Fam-a.akamaihd.net%2Fimage%3Ff%3Dhttps%253A%252F%252Flpl.qq.com%252Fes%252Fstats%252Fteam%252F2024%252F1710313837865.png' },
        tournament: '2026 LPL Spring',
        winnerId: 'AL-ID',
        games: [
            { gameNumber: 1, duration: 1845, totalKills: 28, winnerId: 'AL-ID' },
            { gameNumber: 2, duration: 2100, totalKills: 35, winnerId: 'AL-ID' }
        ]
    },
    {
        id: 'match-2',
        startTime: '2026-02-25T17:00:00Z',
        teamA: { name: 'Anyone\'s Legend', shortName: 'AL', logo: '/api/image-proxy?url=https%3A%2F%2Fam-a.akamaihd.net%2Fimage%3Ff%3Dhttps%253A%252F%252Flpl.qq.com%252Fes%252Fstats%252Fteam%252F2024%252F1710313837865.png' },
        teamB: { name: 'Bilibili Gaming', shortName: 'BLG', logo: '/api/image-proxy?url=https%3A%2F%2Fam-a.akamaihd.net%2Fimage%3Ff%3Dhttps%253A%252F%252Flpl.qq.com%252Fes%252Fstats%252Fteam%252F2024%252F1710313837865.png' },
        tournament: '2026 LPL Spring',
        winnerId: 'BLG-ID',
        games: [
            { gameNumber: 1, duration: 1620, totalKills: 22, winnerId: 'BLG-ID' },
            { gameNumber: 2, duration: 1980, totalKills: 31, winnerId: 'AL-ID' },
            { gameNumber: 3, duration: 1750, totalKills: 25, winnerId: 'BLG-ID' }
        ]
    },
    {
        id: 'match-3',
        startTime: '2026-02-20T19:00:00Z',
        teamA: { name: 'Anyone\'s Legend', shortName: 'AL', logo: '/api/image-proxy?url=https%3A%2F%2Fam-a.akamaihd.net%2Fimage%3Ff%3Dhttps%253A%252F%252Flpl.qq.com%252Fes%252Fstats%252Fteam%252F2024%252F1710313837865.png' },
        teamB: { name: 'Top Esports', shortName: 'TES', logo: '/api/image-proxy?url=https%3A%2F%2Fam-a.akamaihd.net%2Fimage%3Ff%3Dhttps%253A%252F%252Flpl.qq.com%252Fes%252Fstats%252Fteam%252F2024%252F1710313837865.png' },
        tournament: '2026 LPL Spring',
        winnerId: 'AL-ID',
        games: [
            { gameNumber: 1, duration: 2340, totalKills: 18, winnerId: 'AL-ID' },
            { gameNumber: 2, duration: 1560, totalKills: 42, winnerId: 'AL-ID' }
        ]
    }
];

export default function RecentStatsPlayground() {
    const [showPopover, setShowPopover] = useState(false);

    return (
        <div className="min-h-screen bg-[#020617] p-10 font-sans">
            <div className="w-full space-y-20">
                {/* Section Header */}
                <div className="border-l-4 border-blue-600 pl-6">
                    <h1 className="text-4xl font-black text-white tracking-tighter uppercase">Recent Data Preview Optimization</h1>
                    <p className="text-gray-400 mt-2 font-medium">预览优化后的近期场均数据展示效果，包含数据穿透和详情预览。</p>
                </div>

                {/* Scenario 1: Team Profile Page */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 text-blue-400">
                        <span className="text-xs font-black uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded">Scenario A</span>
                        <h2 className="text-xl font-bold">鎴橀槦璧勬枡椤?(Team Profile)</h2>
                    </div>

                    <div className="relative group max-w-2xl">
                        {/* The original component, wrapped to handle hover */}
                        <div
                            onMouseEnter={() => setShowPopover(true)}
                            onMouseLeave={() => setShowPopover(false)}
                            className="cursor-help transition-transform active:scale-[0.98]"
                        >
                            <TeamRecentStats
                                averageDuration="31:12"
                                averageKills="28.4"
                                matchCount={3}
                            />
                        </div>

                        {/* Popover Preview */}
                        {showPopover && (
                            <div className="absolute top-full left-0 mt-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <RecentFormPreview
                                    teamId="AL-ID"
                                    matches={MOCK_MATCH_DATA as any}
                                    averageDuration="31:12"
                                    averageKills="28.4"
                                />
                            </div>
                        )}

                        <div className="mt-4 flex items-center gap-2 text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                            <span className="animate-pulse">●</span> Hover over the cards to see data source
                        </div>
                    </div>
                </div>

                {/* Scenario 2: Match Detail Header */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 text-red-500">
                        <span className="text-xs font-black uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded">Scenario B</span>
                        <h2 className="text-xl font-bold">璧涘悗璇︽儏椤?(Match Detail)</h2>
                    </div>

                    <div className="flex items-center gap-10">
                        {/* Mock Team A Header Form */}
                        <div className="relative group">
                            <div className="flex flex-col items-end gap-1 p-3 bg-slate-900/40 border border-white/5 rounded-2xl shadow-inner cursor-help hover:bg-slate-800 transition-all">
                                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 mb-1">RECENT FORM <span className="text-slate-600 normal-case">(Last 2 BO)</span></div>
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-end">
                                        <span className="text-2xl font-black text-white leading-none tracking-tighter">29:49</span>
                                        <span className="text-[8px] font-black text-slate-500 uppercase mt-1">DURATION</span>
                                    </div>
                                    <div className="w-px h-8 bg-white/10"></div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-2xl font-black text-white leading-none tracking-tighter">24.3</span>
                                        <span className="text-[8px] font-black text-slate-500 uppercase mt-1">AVG KILLS</span>
                                    </div>
                                </div>
                            </div>

                            {/* Hover Details for Match Detail Header */}
                            <div className="absolute top-full right-0 mt-4 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all transform translate-y-2 group-hover:translate-y-0 z-50">
                                <RecentFormPreview
                                    teamId="AL-ID"
                                    matches={MOCK_MATCH_DATA.slice(0, 2) as any}
                                    averageDuration="29:49"
                                    averageKills="24.3"
                                />
                            </div>
                        </div>

                        <div className="text-4xl font-black text-slate-800 italic">VS</div>

                        {/* Mock Team B Header Form */}
                        <div className="relative group">
                            <div className="flex flex-col items-start gap-1 p-3 bg-slate-900/40 border border-white/5 rounded-2xl shadow-inner cursor-help hover:bg-slate-800 transition-all">
                                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500 mb-1">RECENT FORM <span className="text-slate-600 normal-case">(Last 2 BO)</span></div>
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-start">
                                        <span className="text-2xl font-black text-white leading-none tracking-tighter">27:05</span>
                                        <span className="text-[8px] font-black text-slate-500 uppercase mt-1">DURATION</span>
                                    </div>
                                    <div className="w-px h-8 bg-white/10"></div>
                                    <div className="flex flex-col items-start">
                                        <span className="text-2xl font-black text-white leading-none tracking-tighter">31.5</span>
                                        <span className="text-[8px] font-black text-slate-500 uppercase mt-1">AVG KILLS</span>
                                    </div>
                                </div>
                            </div>
                            {/* Hover Details */}
                            <div className="absolute top-full left-0 mt-4 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all transform translate-y-2 group-hover:translate-y-0 z-50">
                                <RecentFormPreview
                                    teamId="WE-ID"
                                    matches={MOCK_MATCH_DATA.slice(1, 3) as any}
                                    averageDuration="27:05"
                                    averageKills="31.5"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Design Philosophy */}
                <div className="bg-blue-600/5 border border-blue-500/20 rounded-3xl p-8">
                    <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
                        馃挕 浼樺寲鎬濊矾 (Optimization Insight)
                    </h3>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <li className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400 font-black">1</div>
                            <div>
                                <h4 className="font-bold text-gray-200">数据穿透 (Data Drill-down)</h4>
                                <p className="text-gray-500 leading-relaxed mt-1">不再只显示单个平均值，用户可以清楚看到这个场均数据是由哪些比赛组成的，提升数据可信度。</p>
                            </div>
                        </li>
                        <li className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400 font-black">2</div>
                            <div>
                                <h4 className="font-bold text-gray-200">颗粒度控制 (Granularity)</h4>
                                <p className="text-gray-500 leading-relaxed mt-1">预览中展示每一局的胜负、时长和击杀，甚至带上对手 Logo 与比赛日期，在高密度下依旧保持清晰。</p>
                            </div>
                        </li>
                        <li className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400 font-black">3</div>
                            <div>
                                <h4 className="font-bold text-gray-200">无感交互 (Zero-click Interaction)</h4>
                                <p className="text-gray-500 leading-relaxed mt-1">通过 Hover 即可展开预览，用户无需点击也能看到细节，保持页面操作流畅。</p>
                            </div>
                        </li>
                        <li className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400 font-black">4</div>
                            <div>
                                <h4 className="font-bold text-gray-200">一致体验 (Omni-presence)</h4>
                                <p className="text-gray-500 leading-relaxed mt-1">无论是在战队页还是赛后详情页，这套组件都会以统一方式出现，建立稳定的数据浏览体验。</p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

