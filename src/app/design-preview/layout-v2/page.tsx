'use client';

import React, { useState } from 'react';

// Mock Odds Component (Left)
const MockOdds = () => (
    <div className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-500 font-bold uppercase">Game {i} Winner</span>
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button className="bg-slate-900 border border-green-500/30 p-2 rounded text-center">
                        <div className="text-xs text-slate-400">Team A</div>
                        <div className="text-lg font-bold text-green-400">1.65</div>
                    </button>
                    <button className="bg-slate-900 border border-slate-700 p-2 rounded text-center">
                        <div className="text-xs text-slate-400">Team B</div>
                        <div className="text-lg font-bold text-slate-300">2.20</div>
                    </button>
                </div>
            </div>
        ))}
    </div>
);

// Mock Game Stats (Center)
const MockStats = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[600px] flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/50">
            <button className="px-6 py-3 border-r border-slate-800 text-blue-400 bg-slate-900 border-t-2 border-t-blue-500 font-bold text-sm">Game 1</button>
            <button className="px-6 py-3 border-r border-slate-800 text-slate-400 hover:bg-slate-800 text-sm">Game 2</button>
            <button className="px-6 py-3 border-r border-slate-800 text-slate-400 hover:bg-slate-800 text-sm">Game 3</button>
        </div>

        {/* Content */}
        <div className="p-8 flex-1 flex flex-col items-center justify-center space-y-8">
            <div className="text-center">
                <div className="text-5xl font-black text-white mb-2">23 - 16</div>
                <div className="text-sm text-slate-500 uppercase tracking-widest">Game Time: 29:30</div>
            </div>

            <div className="w-full h-64 bg-slate-800/20 rounded border border-slate-800 flex items-center justify-center text-slate-500">
                [ Placeholder: Graphs / Damage Charts]
            </div>

            <div className="grid grid-cols-2 gap-8 w-full">
                <div className="aspect-video bg-slate-800/50 rounded flex items-center justify-center text-xs text-slate-600 border border-slate-800">
                    Post Match Image 1
                </div>
                <div className="aspect-video bg-slate-800/50 rounded flex items-center justify-center text-xs text-slate-600 border border-slate-800">
                    Post Match Image 2
                </div>
            </div>
        </div>
    </div>
);

// Mock Comments (Right)
const MockComments = () => (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col h-[600px]">
        <div className="p-4 border-b border-slate-800 bg-slate-950/30 font-bold text-white">
            馃挰 Analysis Feed
        </div>
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex flex-col gap-1 items-start">
                    <div className="text-xs text-slate-400 font-bold">Analyst {i} <span className="text-[10px] font-normal opacity-50">20:3{i}</span></div>
                    <div className="bg-slate-800 p-2 rounded-lg rounded-tl-none border border-slate-700 text-sm text-slate-300">
                        This is a sample comment demonstrating the layout width.
                    </div>
                </div>
            ))}
        </div>
        <div className="p-3 border-t border-slate-800 bg-slate-950">
            <input className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm" placeholder="Write comment..." />
        </div>
    </div>
);

export default function LayoutPreview() {
    return (
        <div className="min-h-screen bg-[#0a0e14] text-slate-200 p-8">
            <div className="w-full">
                <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-4">
                    <span className="bg-blue-600 text-xs px-2 py-1 rounded">PREVIEW</span>
                    Layout V2: 3-Column
                </h1>

                {/* 3-COLUMN GRID Custom Ratio 25-35-40 */}
                <div className="grid grid-cols-1 lg:grid-cols-[25fr_35fr_40fr] gap-6">

                    {/* LEFT: ODDS (25%) */}
                    <div className="flex flex-col">
                        <div className="text-xs font-mono text-slate-500 mb-2 uppercase">Left (25%): Odds</div>
                        <MockOdds />
                    </div>

                    {/* CENTER: STATS (35%) */}
                    <div className="flex flex-col">
                        <div className="text-xs font-mono text-slate-500 mb-2 uppercase">Center (35%): Stats</div>
                        <MockStats />
                    </div>

                    {/* RIGHT: COMMENTS (40%) */}
                    <div className="flex flex-col h-[800px] gap-4">
                        <div className="text-xs font-mono text-slate-500 mb-2 uppercase">Right (40%): Analysis Split</div>

                        {/* TOP: Player Analysis (50% or 60%) */}
                        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col min-h-0">
                            <div className="p-3 border-b border-slate-800 bg-slate-950/30 flex justify-between items-center">
                                <span className="font-bold text-white text-sm">馃挰 閫夋墜瀵逛綅鍒嗘瀽 (Player Analysis)</span>
                                <span className="text-[10px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">Part 1</span>
                            </div>
                            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex flex-col gap-1 items-start">
                                        <div className="text-xs text-slate-400 font-bold">Analyst {i}</div>
                                        <div className="bg-slate-800 p-2 rounded-lg border border-slate-700 text-xs text-slate-300">
                                            Focusing on Top Lane matchup. This is the analysis feed area.
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* BOTTOM: Game Summary (Remaining Height) */}
                        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col min-h-0">
                            <div className="p-3 border-b border-slate-800 bg-slate-950/30 flex justify-between items-center">
                                <span className="font-bold text-white text-sm">馃摑 璧涘悗鎬荤粨 (Game Summary)</span>
                                <span className="text-[10px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">Part 2</span>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto">
                                <div className="text-sm text-slate-400 ">
                                    [Placeholder for Game Summary / MVP Notes / Final Remarks]
                                    <br /><br />
                                    This section is dedicated to overall game conclusions, separate from the real-time player analysis above.
                                </div>
                            </div>
                            <div className="p-3 border-t border-slate-800 bg-slate-950">
                                <input className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs" placeholder="Add summary note..." />
                            </div>
                        </div>

                    </div>

                </div>
            </div>
        </div>
    );
}

