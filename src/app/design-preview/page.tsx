'use client';

import { useState } from 'react';
import { format } from 'date-fns';

// --- MOCK DATA ---
const MOCK_COMMENTS = [
    { id: '1', author: 'FakerFan2026', content: 'T1 fighting! Zeus looking sharp today.', type: 'POST_MATCH', createdAt: new Date(Date.now() - 100000), isMe: false },
    { id: '2', author: 'ChovyChurch', content: 'GenG macro is just too good.', type: 'POST_MATCH', createdAt: new Date(Date.now() - 80000), isMe: false },
    { id: '3', author: 'Me (Analyst)', content: 'Game 3 draft was the deciding factor. T1 needs to ban Rumble.', type: 'POST_MATCH', createdAt: new Date(Date.now() - 50000), isMe: true },
    { id: '4', author: 'LPL_Enjoyer', content: 'LPL is better anyway :p', type: 'POST_MATCH', createdAt: new Date(Date.now() - 20000), isMe: false },
];

export default function DesignPreviewPage() {
    const [activeTab, setActiveTab] = useState('Game 3');

    return (
        <div className="min-h-screen bg-[#0a0e14] text-slate-200 pb-20">
            {/* --- NAVIGATION --- */}
            <div className="h-16 border-b border-slate-800 bg-[#0f141e] flex items-center px-8">
                <span className="font-bold text-xl text-blue-500">LolData</span>
                <span className="ml-4 text-xs bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded border border-pink-500/30">DESIGN PREVIEW v8.0 (Optimized Proportions)</span>
            </div>

            <div className="w-full px-2 py-8 space-y-6 sm:px-3 lg:px-4">

                {/* --- HEADER --- */}
                <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-0 overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-red-900/20"></div>
                    <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>

                    <div className="relative z-10 flex items-center justify-between py-8 px-12">
                        {/* Team A */}
                        <div className="flex items-center gap-8 flex-1 justify-end text-right">
                            <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-lg backdrop-blur-sm max-w-[200px] text-right shadow-lg hidden xl:block">
                                <h4 className="text-blue-400 text-xs font-bold uppercase mb-1">Team Analysis</h4>
                                <p className="text-sm text-slate-300 leading-tight">BP flexible, Gumayusi reliable late game carry.</p>
                            </div>
                            <div>
                                <h1 className="text-5xl font-black text-white tracking-tight">T1</h1>
                                <span className="text-blue-400 font-bold tracking-wider text-sm">LCK 鈥?#2 SEED</span>
                            </div>
                            <div className="w-24 h-24 bg-slate-800 rounded-full border-4 border-slate-700 shadow-xl flex items-center justify-center relative"><span className="text-3xl">馃</span></div>
                        </div>

                        {/* Score */}
                        <div className="px-12 flex flex-col items-center shrink-0">
                            <div className="flex items-center gap-6 text-7xl font-black  text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                <span className="text-blue-500">2</span>
                                <span className="text-slate-600 text-5xl">:</span>
                                <span className="text-red-500">1</span>
                            </div>
                            <div className="mt-4 flex flex-col items-center gap-1">
                                <span className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-bold rounded uppercase tracking-widest">Finished</span>
                            </div>
                        </div>

                        {/* Team B */}
                        <div className="flex items-center gap-8 flex-1 justify-start text-left">
                            <div className="w-24 h-24 bg-slate-800 rounded-full border-4 border-slate-700 shadow-xl flex items-center justify-center relative"><span className="text-3xl">馃惎</span></div>
                            <div>
                                <h1 className="text-5xl font-black text-white tracking-tight">GEN</h1>
                                <span className="text-red-400 font-bold tracking-wider text-sm">LCK 鈥?#1 SEED</span>
                            </div>
                            <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-lg backdrop-blur-sm max-w-[200px] text-left shadow-lg hidden xl:block">
                                <h4 className="text-red-400 text-xs font-bold uppercase mb-1">Team Analysis</h4>
                                <p className="text-sm text-slate-300 leading-tight">Chovy dominates lane, strong mid-jungle synergy.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- 2. GRID LAYOUT --- */}
                <div className="grid grid-cols-12 gap-6">

                    {/* LEFT: MAIN CONTENT (75%) */}
                    <div className="col-span-12 lg:col-span-9 flex flex-col gap-6">

                        {/* MAIN GAME TABS CONTAINER */}
                        <div className="flex flex-col gap-0 bg-slate-900 border border-slate-800 rounded-xl min-h-[800px] overflow-hidden shadow-lg">
                            {/* Tabs Header */}
                            <div className="flex border-b border-slate-800 bg-slate-950/50">
                                {['Match Overview', 'Game 1', 'Game 2', 'Game 3'].map((tab, i) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-8 py-4 font-bold text-sm transition-all border-r border-slate-800 ${activeTab === tab ? 'bg-slate-900 text-blue-400 border-t-2 border-t-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>

                            {/* Main Content Area */}
                            <div className="flex-1 flex flex-col gap-6 p-6">

                                {/* --- 1. DETAILED ODDS SECTION --- */}
                                <div className="grid grid-cols-4 gap-4">
                                    {/* 1. Winner */}
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-blue-500/50 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase">鑳滆礋 (Winner)</span>
                                            <span className="text-[10px] text-green-500 bg-green-500/10 px-1 rounded">LIVE</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <div className="flex-1 bg-blue-900/10 border border-blue-500/20 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500 font-bold">T1</div>
                                                <div className="text-lg font-black text-blue-400">1.82</div>
                                            </div>
                                            <div className="flex-1 bg-red-900/10 border border-red-500/20 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500 font-bold">GEN</div>
                                                <div className="text-lg font-black text-red-400">1.95</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Handicap */}
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-purple-500/50 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase">璁╁垎 (Spread)</span>
                                            <span className="text-[10px] text-slate-600 font-mono">-1.5 / +1.5</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500">T1 (-1.5)</div>
                                                <div className="text-lg font-bold text-white">2.50</div>
                                            </div>
                                            <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500">GEN (+1.5)</div>
                                                <div className="text-lg font-bold text-white">1.50</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Total Kills */}
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-pink-500/50 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase">鎬讳汉澶?(Kills)</span>
                                            <span className="text-[10px] text-slate-600 font-mono">26.5</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500">Over</div>
                                                <div className="text-lg font-bold text-white">1.90</div>
                                            </div>
                                            <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500">Under</div>
                                                <div className="text-lg font-bold text-white">1.80</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 4. Duration */}
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-orange-500/50 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase">鏃堕棿 (Duration)</span>
                                            <span className="text-[10px] text-slate-600 font-mono">32:00</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500">Over</div>
                                                <div className="text-lg font-bold text-white">1.85</div>
                                            </div>
                                            <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-center">
                                                <div className="text-[10px] text-slate-500">Under</div>
                                                <div className="text-lg font-bold text-white">1.85</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* --- 2. GAME SUMMARY PANEL (EXPANDED & COMPACT HEADER) --- */}
                                <div className="flex-1 bg-[#0f141e] border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-2xl min-h-[550px]">
                                    {/* COMPACT SUMMARY HEADER */}
                                    <div className="p-5 pb-2 relative overflow-hidden">
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-full bg-blue-900/10 blur-3xl rounded-full pointer-events-none"></div>

                                        <div className="flex items-center justify-between relative z-10 px-2">
                                            {/* Left Team (Blue) */}
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-3xl font-black text-white tracking-tight">T1</span>
                                                <span className="px-2 py-0.5 mt-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-full border border-blue-500/30 uppercase tracking-wider">鈼?WINNER</span>
                                            </div>

                                            {/* Center Stats (Score) - More Compact */}
                                            <div className="flex flex-col items-center px-4 z-20">
                                                <div className="text-4xl font-black text-slate-200 tracking-widest flex items-center gap-3">
                                                    <span className="text-blue-500">22</span>
                                                    <span className="text-xl text-slate-600 font-bold">:</span>
                                                    <span className="text-red-500">9</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">DURATION: 31:42</span>
                                            </div>

                                            {/* Right Team (Red) */}
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-3xl font-black text-slate-400 tracking-tight">GEN</span>
                                                <span className="px-2 py-0.5 mt-1 bg-slate-800 text-slate-500 text-[10px] font-bold rounded-full border border-slate-700 uppercase tracking-wider">DEFEAT</span>
                                            </div>
                                        </div>

                                        {/* Kills Comparison Row (Compact) */}
                                        <div className="mt-4 flex justify-center gap-4 relative z-10 mb-2">
                                            {/* 10M Kills */}
                                            <div className="flex flex-col items-center bg-slate-900/50 p-2 rounded border border-slate-800 w-36 backdrop-blur-sm">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase mb-1">10M Kills</span>
                                                <div className="flex items-center justify-between w-full px-2">
                                                    <span className="text-sm font-bold text-blue-400">4</span>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-lg font-black text-white leading-none">6</span>
                                                        <span className="text-[8px] text-slate-600 uppercase">Total</span>
                                                    </div>
                                                    <span className="text-sm font-bold text-red-400">2</span>
                                                </div>
                                            </div>

                                            {/* Total Kills */}
                                            <div className="flex flex-col items-center bg-slate-900/50 p-2 rounded border border-slate-800 w-36 backdrop-blur-sm">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase mb-1">Total Kills</span>
                                                <div className="flex items-center justify-between w-full px-2">
                                                    <span className="text-sm font-bold text-blue-400">22</span>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-lg font-black text-white leading-none">31</span>
                                                        <span className="text-[8px] text-slate-600 uppercase">Total</span>
                                                    </div>
                                                    <span className="text-sm font-bold text-red-400">9</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* BANS HEADER */}
                                    <div className="px-6 py-1.5 bg-slate-900/50 border-y border-slate-800 flex justify-between items-center text-[10px]">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500 font-bold">BANS:</span>
                                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-5 h-5 rounded bg-slate-800 border border-slate-700/50 grayscale opacity-60"></div>)}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-5 h-5 rounded bg-slate-800 border border-slate-700/50 grayscale opacity-60"></div>)}
                                            <span className="text-slate-500 font-bold">BANS</span>
                                        </div>
                                    </div>

                                    {/* SPLIT / MIRRORED SCOREBOARD (Spacious) */}
                                    <div className="flex flex-1 min-h-[400px]">
                                        {/* LEFT SIDE: BLUE TEAM */}
                                        <div className="flex-1 border-r border-slate-800/50 bg-blue-950/5 p-4">
                                            {/* Header */}
                                            <div className="flex text-[9px] font-bold text-slate-500 uppercase mb-3 px-2">
                                                <span className="w-8">Hero</span>
                                                <span className="flex-1 pl-2">Player</span>
                                                <span className="w-14 text-center">KDA</span>
                                                <span className="w-14 text-right">Dmg</span>
                                            </div>
                                            {/* List */}
                                            <div className="space-y-2">
                                                {[
                                                    { champ: 'Aatrox', player: 'Zeus', kda: '5/1/4', dmg: '22.4k' },
                                                    { champ: 'Sejuani', player: 'Oner', kda: '2/1/8', dmg: '8.1k' },
                                                    { champ: 'Azir', player: 'Faker', kda: '4/2/6', dmg: '28.9k' },
                                                    { champ: 'Varus', player: 'Gumayusi', kda: '6/0/3', dmg: '31.2k' },
                                                    { champ: 'Rell', player: 'Keria', kda: '0/2/12', dmg: '4.5k' },
                                                ].map((p, i) => (
                                                    <div key={i} className="flex items-center px-2 py-3 rounded hover:bg-blue-500/10 transition-colors border-b border-dashed border-slate-800/50 last:border-0">
                                                        <div className="w-8 h-8 bg-slate-800 rounded border border-slate-700 relative shrink-0"></div>
                                                        <span className="flex-1 pl-3 font-bold text-slate-200 text-sm">{p.player}</span>
                                                        <span className="w-14 text-center font-mono text-blue-400 font-bold text-xs">{p.kda}</span>
                                                        <span className="w-14 text-right font-mono text-slate-400 text-xs">{p.dmg}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* RIGHT SIDE: RED TEAM (MIRRORED) */}
                                        <div className="flex-1 bg-red-950/5 p-4">
                                            {/* Header (Reversed) */}
                                            <div className="flex text-[9px] font-bold text-slate-500 uppercase mb-3 px-2">
                                                <span className="w-14 text-left">Dmg</span>
                                                <span className="w-14 text-center">KDA</span>
                                                <span className="flex-1 text-right pr-2">Player</span>
                                                <span className="w-8 text-right">Hero</span>
                                            </div>
                                            {/* List */}
                                            <div className="space-y-2">
                                                {[
                                                    { champ: 'Jax', player: 'Kiin', kda: '1/4/2', dmg: '18.4k' },
                                                    { champ: 'Viego', player: 'Canyon', kda: '3/3/4', dmg: '12.1k' },
                                                    { champ: 'Taliyah', player: 'Chovy', kda: '2/3/3', dmg: '26.7k' },
                                                    { champ: 'Kalista', player: 'Peyz', kda: '3/4/2', dmg: '21.2k' },
                                                    { champ: 'Nautilus', player: 'Lehends', kda: '0/8/5', dmg: '3.2k' },
                                                ].map((p, i) => (
                                                    <div key={i} className="flex items-center px-2 py-3 rounded hover:bg-red-500/10 transition-colors border-b border-dashed border-slate-800/50 last:border-0">
                                                        <span className="w-14 text-left font-mono text-slate-400 text-xs">{p.dmg}</span>
                                                        <span className="w-14 text-center font-mono text-red-400 font-bold text-xs">{p.kda}</span>
                                                        <span className="flex-1 text-right pr-3 font-bold text-slate-200 text-sm">{p.player}</span>
                                                        <div className="w-8 h-8 bg-slate-800 rounded border border-slate-700 relative shrink-0"></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* --- 3. POST-MATCH IMAGES SECTION (SIZE REDUCED) --- */}
                                <div className="bg-[#0f141e] border border-slate-800 rounded-xl p-4 shadow-lg">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                            <span className="text-sm">📊</span> 赛后数据 (POST-MATCH DATA)
                                        </h3>
                                        <button className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded border border-slate-700 transition-colors flex items-center gap-2">
                                            <span>鉁忥笍</span> Edit
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Post-Match Image Placeholder (Fixed Height) */}
                                        <div className="h-40 bg-slate-900 border border-slate-800 rounded-lg flex flex-col items-center justify-center relative group overflow-hidden cursor-pointer hover:border-blue-500/50 transition-colors">
                                            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 opacity-70 group-hover:opacity-90 transition-opacity"></div>
                                            <div className="relative z-10 flex flex-col items-center gap-1">
                                                <span className="text-2xl text-slate-600 group-hover:text-blue-400 transition-colors">馃搳</span>
                                            </div>
                                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded uppercase">
                                                璧涘悗鏁版嵁
                                            </div>
                                        </div>

                                        {/* Supplementary Image Placeholder (Fixed Height) */}
                                        <div className="h-40 bg-slate-900 border border-slate-800 rounded-lg flex flex-col items-center justify-center relative group overflow-hidden cursor-pointer hover:border-purple-500/50 transition-colors">
                                            <div className="relative z-10 flex flex-col items-center gap-1">
                                                <span className="text-2xl text-slate-600 group-hover:text-purple-400 transition-colors">馃搱</span>
                                            </div>
                                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded uppercase">
                                                琛ュ厖闈㈡澘
                                            </div>
                                            {/* Tools Overlay */}
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-1 bg-blue-600 text-white rounded hover:bg-blue-500"><span className="text-[10px]">猬嗭笍</span></button>
                                                <button className="p-1 bg-red-600 text-white rounded hover:bg-red-500"><span className="text-[10px]">🗑</span></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>

                    {/* RIGHT: SIDEBAR (25%) */}
                    <div className="col-span-12 lg:col-span-3 flex flex-col h-full min-h-[calc(100vh-300px)]">

                        {/* COMMENTS FEED */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl flex-1 flex flex-col overflow-hidden shadow-lg h-full sticky top-6">
                            <div className="p-4 border-b border-slate-800 bg-slate-950/30 flex justify-between items-center">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <span>馃挰</span> Match Chat
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                    <span className="text-xs text-slate-400">{activeTab} Live</span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[600px] lg:max-h-none">
                                {MOCK_COMMENTS.map(comment => (
                                    <div key={comment.id} className={`flex flex-col gap-1 ${comment.isMe ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-baseline gap-2">
                                            <span className={`text-xs font-bold ${comment.isMe ? 'text-blue-400 order-2' : 'text-slate-400'}`}>
                                                {comment.author} {comment.isMe && '(Me)'}
                                            </span>
                                            <span className="text-[10px] text-slate-600">{format(comment.createdAt, 'HH:mm')}</span>
                                        </div>
                                        <div className={`px-3 py-2 rounded-2xl text-sm max-w-[90%] leading-relaxed shadow-sm ${comment.isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'}`}>
                                            {comment.content}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-3 border-t border-slate-800 bg-slate-950 space-y-2">
                                <textarea placeholder="Write a comment..." className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-20"></textarea>
                                <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-xs tracking-wider transition-colors">POST COMMENT</button>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}


