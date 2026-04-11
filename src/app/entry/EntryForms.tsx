'use client';

import { createMatch, createTeam, updateMatchResult, addOdds } from "@/app/actions";
import { useState } from "react";
import { format } from "date-fns";

type Team = { id: string; name: string; region: string; };
type Match = { id: string; teamA: Team | null; teamB: Team | null; startTime: Date | null };

export default function EntryForms({ teams, matches, systemRegions = ["LPL", "LCK"] }: { teams: Team[], matches: Match[], systemRegions?: string[] }) {
    const [activeTab, setActiveTab] = useState<'match' | 'team' | 'result' | 'odds'>('match');
    const [message, setMessage] = useState<string | null>(null);

    async function handleSubmit(action: (fd: FormData) => Promise<any>, formData: FormData) {
        const res = await action(formData);
        if (res.error) setMessage(res.error);
        else setMessage(res.message);
    }

    const TabButton = ({ id, label }: { id: typeof activeTab, label: string }) => (
        <button
            onClick={() => { setActiveTab(id); setMessage(null); }}
            className={`pb-2 text-sm font-medium transition-colors ${activeTab === id ? 'text-yellow-500 border-b-2 border-yellow-500' : 'text-slate-400 hover:text-white'}`}
        >
            {label}
        </button>
    );

    const matchOptionLabel = (m: Match) =>
        `${m.startTime ? format(new Date(m.startTime), 'MM/dd HH:mm') : '待定'} - ${m.teamA?.name || '待定'} 对阵 ${m.teamB?.name || '待定'}`;

    return (
        <div>
            <div className="flex gap-6 border-b border-slate-800 mb-6 pb-2 overflow-x-auto">
                <TabButton id="match" label="新增赛程" />
                <TabButton id="team" label="新增战队" />
                <TabButton id="result" label="更新赛果" />
                <TabButton id="odds" label="录入赔率" />
            </div>

            {message && (
                <div className="mb-6 p-3 bg-slate-800 border border-slate-700 rounded text-sm text-yellow-400">
                    {message}
                </div>
            )}

            {activeTab === 'match' && (
                <form action={(fd) => handleSubmit(createMatch, fd)} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">A 队（蓝色方）</label>
                            <select name="teamAId" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                                <option value="">选择战队...</option>
                                {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.region})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">B 队（红色方）</label>
                            <select name="teamBId" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                                <option value="">选择战队...</option>
                                {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.region})</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">赛事</label>
                            <input name="tournament" type="text" defaultValue="2026 LPL第一赛段" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">开始时间</label>
                            <input name="startTime" type="datetime-local" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors [color-scheme:dark]" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">赛制</label>
                            <select name="format" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                                <option value="BO3">BO3（三局两胜）</option>
                                <option value="BO1">BO1（单局）</option>
                                <option value="BO5">BO5（五局三胜）</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-500 text-slate-950 font-bold py-2 rounded transition-colors mt-2">创建赛程</button>
                </form>
            )}

            {activeTab === 'team' && (
                <form action={(fd) => handleSubmit(createTeam, fd)} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">战队名称</label>
                        <input name="name" type="text" placeholder="例如：T1" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">简称（Tag）</label>
                            <input name="shortName" type="text" placeholder="例如：SKT" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">赛区</label>
                            <select name="region" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                                {systemRegions.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-500 text-slate-950 font-bold py-2 rounded transition-colors mt-2">创建战队</button>
                </form>
            )}

            {activeTab === 'result' && (
                <form action={(fd) => handleSubmit(updateMatchResult, fd)} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">选择比赛</label>
                        <select name="matchId" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                            <option value="">选择未结束比赛...</option>
                            {matches.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {matchOptionLabel(m)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">获胜方</label>
                        <select name="winnerId" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                            <option value="">选择获胜战队...</option>
                            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded transition-colors mt-2">结束比赛并结算</button>
                </form>
            )}

            {activeTab === 'odds' && (
                <form action={(fd) => handleSubmit(addOdds, fd)} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">选择比赛</label>
                        <select name="matchId" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                            <option value="">选择比赛...</option>
                            {matches.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {matchOptionLabel(m)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">赔率类型</label>
                            <select name="type" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors">
                                <option value="WINNER">胜负盘</option>
                                <option value="TEAM_A_HANDICAP_KILLS">A 队让击杀</option>
                                <option value="TOTAL_KILLS">总击杀</option>
                                <option value="KILLS_10M">10 分钟击杀</option>
                                <option value="DURATION">比赛时长</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">阈值（例如 26.5）</label>
                            <input name="threshold" type="number" step="0.5" placeholder="胜负盘可留空" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">大 / A 队赔率</label>
                            <input name="teamAOdds" type="number" step="0.01" placeholder="1.50" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">小 / B 队赔率</label>
                            <input name="teamBOdds" type="number" step="0.01" placeholder="2.50" required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded transition-colors mt-2">添加赔率数据</button>
                </form>
            )}
        </div>
    );
}
