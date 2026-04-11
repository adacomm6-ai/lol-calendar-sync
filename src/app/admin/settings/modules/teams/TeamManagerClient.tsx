'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import React, { useState } from 'react';
import { updateTeamInfo, deleteTeam, addTeam } from './actions';
import TeamLogo from '@/components/TeamLogo';
import { syncTeamRoster } from '../../../sync/actions';

interface Team {
    id: string;
    name: string;
    shortName: string | null;
    region: string;
    logo: string | null;
}

interface Props {
    initialTeams: Team[];
    regions: string[];
    years?: string[];
    splits?: { id: string, name: string, mapping: string, type?: string, regions?: string[] }[];
}

export default function TeamManagerClient({ initialTeams, regions, years = [], splits = [] }: Props) {
    const [teams, setTeams] = useState(initialTeams);
    const [search, setSearch] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [activeRegion, setActiveRegion] = useState<string>('ALL');
    const [activeSplit, setActiveSplit] = useState<string>('ALL');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addMode, setAddMode] = useState<'NEW' | 'PULL'>('NEW');
    const [pullTeamId, setPullTeamId] = useState<string>('');
    const [pullRegionFilter, setPullRegionFilter] = useState<string>('');

    const [addForm, setAddForm] = useState({ id: '', name: '', shortName: '', region: regions[0] || 'LPL', logo: '' });
    const [adding, setAdding] = useState(false);

    // Filter Logic
    const filteredTeams = teams.filter(t => {
        const matchesRegion = activeRegion === 'ALL' || t.region.includes(activeRegion);
        const matchesSplit = activeSplit === 'ALL' || t.region.includes(activeSplit);
        const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.shortName?.toLowerCase().includes(search.toLowerCase());

        return matchesRegion && matchesSplit && matchesSearch;
    });

    // Determine sub-tabs (splits) for the current active region
    const activeRegionSplits = splits.filter(s => {
        if (!s.regions || s.regions.length === 0) return true; // Global split
        return s.regions.includes(activeRegion);
    });

    // Helper to toggle tags in a comma-separated string
    const toggleTag = (currentString: string, tag: string) => {
        const parts = currentString.split(',').map(s => s.trim()).filter(Boolean);
        const isActive = parts.includes(tag);
        let newParts;
        if (isActive) {
            newParts = parts.filter(p => p !== tag);
        } else {
            newParts = [...parts, tag];
        }
        return newParts.join(', ');
    };

    const handleUpdate = async (id: string, field: 'shortName' | 'region', value: string) => {
        setSavingId(id);
        try {
            await updateTeamInfo(id, { [field]: value });
            setTeams(teams.map(t => t.id === id ? { ...t, [field]: value } : t));
        } catch (e) {
            alert('鏇存柊澶辫触: ' + (e as Error).message);
        }
        setSavingId(null);
    };

    const handleSyncRoster = async (id: string) => {
        setSavingId(id);
        try {
            const res = await syncTeamRoster(id);
            if (res.success) {
                alert(`同步完成！更新: ${res.updates}, 新增: ${res.creates}`);
            } else {
                alert('同步澶辫触: ' + (res as any).error);
            }
        } catch (e) {
            alert('同步鍑洪敊: ' + (e as Error).message);
        }
        setSavingId(null);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!(await confirmAction('Confirm delete this team and related data?'))) return;
        setSavingId(id);
        const res = await deleteTeam(id);
        if (res.success) {
            setTeams(teams.filter(t => t.id !== id));
        } else {
            alert(res.error);
        }
        setSavingId(null);
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);

        if (addMode === 'PULL') {
            if (!pullTeamId) { alert('请选择要拉取的战队'); setAdding(false); return; }
            const teamToPull = teams.find(t => t.id === pullTeamId);
            if (!teamToPull) { setAdding(false); return; }

            let targetTag = activeSplit !== 'ALL' ? activeSplit : activeRegion;
            if (activeRegion === 'ALL') { alert('当前为全联赛视图，请先选择具体赛区后再拉取'); setAdding(false); return; }

            const newRegionString = toggleTag(teamToPull.region, targetTag);
            try {
                await updateTeamInfo(pullTeamId, { region: newRegionString });
                setTeams(teams.map(t => t.id === pullTeamId ? { ...t, region: newRegionString } : t));
                setIsAddOpen(false);
                setPullTeamId('');
            } catch (e) {
                alert('拉取失败: ' + (e as Error).message);
            }
            setAdding(false);
            return;
        }

        const initialRegion = activeRegion !== 'ALL'
            ? (activeSplit !== 'ALL' ? `${activeRegion}, ${activeSplit}` : activeRegion)
            : (regions[0] || 'LPL');

        const res = await addTeam({ ...addForm, region: addForm.region || initialRegion });
        setAdding(false);
        if (res.success && res.team) {
            setTeams([res.team, ...teams]);
            setIsAddOpen(false);
            setAddForm({ id: '', name: '', shortName: '', region: initialRegion, logo: '' });
        } else {
            alert(res.error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Region Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {['ALL', ...regions].map(r => (
                    <button
                        key={r}
                        onClick={() => {
                            setActiveRegion(r);
                            setActiveSplit('ALL');
                        }}
                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeRegion === r
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100 hover:text-gray-900'
                            }`}
                    >
                        {r === 'ALL' ? '全联赛视图 (ALL REGIONS)' : `${r} 赛区`}
                    </button>
                ))}
            </div>

            {/* Split Sub-Tabs */}
            {activeRegion !== 'ALL' && activeRegionSplits.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none animate-in fade-in slide-in-from-top-2">
                    <button
                        onClick={() => setActiveSplit('ALL')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSplit === 'ALL'
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                    >
                        全部赛段
                    </button>
                    {activeRegionSplits.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSplit(s.id)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSplit === s.id
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                        >
                            {s.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex justify-between items-center gap-6 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 max-w-lg">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    <input
                        type="text"
                        placeholder="在当前视图中快速检索战队..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-gray-50/50 border border-gray-100 rounded-xl pl-11 pr-4 py-2.5 w-full text-sm font-medium text-gray-900 focus:ring-4 focus:ring-blue-50 focus:border-blue-400 focus:bg-white outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                        INDEXED: <span className="text-blue-600 ml-1">{filteredTeams.length}</span> TEAMS
                    </div>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-black tracking-widest uppercase transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                        <span>+</span> 添加战队
                    </button>
                </div>
            </div>

            {/* Add Team Modal */}
            {isAddOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-black text-lg text-gray-900 tracking-tighter uppercase">添加战队</h3>
                            <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors">×</button>
                        </div>

                        <div className="px-6 pt-4 flex gap-4 uppercase font-black text-xs tracking-widest border-b border-gray-100">
                            <button
                                onClick={() => setAddMode('NEW')}
                                className={`pb-3 border-b-2 transition-all ${addMode === 'NEW' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                            >
                                创建新战队
                            </button>
                            {activeRegion !== 'ALL' && (
                                <button
                                    onClick={() => setAddMode('PULL')}
                                    className={`pb-3 border-b-2 transition-all flex items-center gap-1 ${addMode === 'PULL' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                                >
                                    从其他赛区拉取
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
                            {addMode === 'NEW' ? (
                                <>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">战队 ID</label>
                                        <input required value={addForm.id} onChange={e => setAddForm({ ...addForm, id: e.target.value })} className="w-full bg-gray-50/50 text-gray-900 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono" placeholder="例如 BLG" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">战队全称</label>
                                        <input required value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="w-full bg-gray-50/50 text-gray-900 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Bilibili Gaming" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">简称（可选）</label>
                                        <input value={addForm.shortName} onChange={e => setAddForm({ ...addForm, shortName: e.target.value })} className="w-full bg-gray-50/50 text-gray-900 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono" placeholder="BLG" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">所属初始赛区</label>
                                        <select value={addForm.region} onChange={e => setAddForm({ ...addForm, region: e.target.value })} className="w-full bg-gray-50/50 text-gray-900 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                                            {regions.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-100 text-blue-700 text-xs p-3 rounded-lg leading-relaxed">
                                        将其他赛区已有战队直接挂载到当前视图 <strong>{activeSplit !== 'ALL' ? activeSplit : activeRegion}</strong> 的列表下。
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">选择来源赛区</label>
                                        <select
                                            value={pullRegionFilter}
                                            onChange={e => {
                                                setPullRegionFilter(e.target.value);
                                                setPullTeamId('');
                                            }}
                                            className="w-full bg-gray-50/50 text-gray-900 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        >
                                            <option value="">全部赛区 (All Regions)</option>
                                            {regions.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">选择要拉取的战队</label>
                                        <select
                                            required
                                            value={pullTeamId}
                                            onChange={e => setPullTeamId(e.target.value)}
                                            className="w-full bg-gray-50/50 text-gray-900 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        >
                                            <option value="" disabled>-- 请选择战队 --</option>
                                            {teams
                                                .filter(t => !t.region.includes(activeSplit !== 'ALL' ? activeSplit : activeRegion))
                                                .filter(t => pullRegionFilter ? t.region.includes(pullRegionFilter) : true)
                                                .map(t => (
                                                    <option key={t.id} value={t.id}>{t.name} ({t.region})</option>
                                                ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsAddOpen(false)} className="px-5 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors">取消</button>
                                <button type="submit" disabled={adding} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-black tracking-widest uppercase transition-all shadow-md active:scale-95">
                                    {adding ? '保存中...' : '保存战队'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead>
                        <tr className="bg-gray-50/50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100">
                            <th className="p-5">战队档案 (IDENTITIES)</th>
                            <th className="p-5">简称映射 (MAPPING)</th>
                            <th className="p-5">年份授权 (YEARS)</th>
                            <th className="p-5">所属赛区 (REGIONS)</th>
                            <th className="p-5">所属赛段 (SPLITS)</th>
                            <th className="p-5 text-center">高级操作 (ACTIONS)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredTeams.map((team) => {
                            const teamTags = team.region.split(',').map(s => s.trim()).filter(Boolean);
                            return (
                                <tr key={team.id} className="hover:bg-blue-50/30 transition-all group">
                                    <td className="p-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center p-1.5 border border-gray-100 group-hover:bg-white group-hover:scale-110 transition-all shadow-inner">
                                                <TeamLogo src={team.logo} name={team.name} />
                                            </div>
                                            <div>
                                                <div className="font-black text-sm text-gray-900 leading-tight">{team.name}</div>
                                                <div className="text-[9px] text-gray-400 font-mono tracking-tighter mt-1">{team.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <input
                                            type="text"
                                            defaultValue={team.shortName || ''}
                                            onBlur={(e) => {
                                                if (e.target.value !== (team.shortName || '')) {
                                                    handleUpdate(team.id, 'shortName', e.target.value);
                                                }
                                            }}
                                            className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-xs font-black text-gray-900 w-28 focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all font-mono"
                                        />
                                    </td>

                                    {/* 1. 骞翠唤鎺堟潈 */}
                                    <td className="p-5">
                                        <div className="flex flex-wrap gap-1.5 w-32">
                                            {years.map(y => {
                                                const isActive = teamTags.includes(y);
                                                return (
                                                    <button
                                                        key={y}
                                                        type="button"
                                                        onClick={() => handleUpdate(team.id, 'region', toggleTag(team.region, y))}
                                                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all border ${isActive
                                                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                                                : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'
                                                            }`}
                                                    >
                                                        {y}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {/* 2. 鎵€灞炶禌鍖?*/}
                                    <td className="p-5">
                                        <div className="flex flex-wrap gap-1.5 w-48">
                                            {regions.map(r => {
                                                const isActive = teamTags.includes(r);
                                                return (
                                                    <button
                                                        key={r}
                                                        type="button"
                                                        onClick={() => handleUpdate(team.id, 'region', toggleTag(team.region, r))}
                                                        className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase transition-all border ${isActive
                                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                                : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'
                                                            }`}
                                                    >
                                                        {r}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {/* 3. 鎵€灞炶禌娈?*/}
                                    <td className="p-5">
                                        <div className="flex flex-wrap gap-1.5 w-48">
                                            {activeSplit !== 'ALL' && !regions.includes(activeSplit) && !years.includes(activeSplit) && (() => {
                                                const isActive = teamTags.includes(activeSplit);
                                                const sObj = splits.find(s => s.id === activeSplit);
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdate(team.id, 'region', toggleTag(team.region, activeSplit))}
                                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all border ${isActive
                                                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                                                : 'bg-white text-gray-400 border-gray-100 hover:border-purple-200 hover:text-purple-600'
                                                            }`}
                                                    >
                                                        {sObj?.name || activeSplit}
                                                    </button>
                                                );
                                            })()}

                                            {splits.slice(0, 3).map(s => {
                                                if (s.id === activeSplit) return null;
                                                const isActive = teamTags.includes(s.id);
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => handleUpdate(team.id, 'region', toggleTag(team.region, s.id))}
                                                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all border ${isActive
                                                                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                                                                : 'bg-white text-[9px] text-gray-300 border-gray-50 hover:border-gray-200'
                                                            }`}
                                                    >
                                                        {s.name.includes('(') ? s.name.split('(')[0].trim() : s.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    <td className="p-5 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleSyncRoster(team.id)}
                                                disabled={savingId === team.id}
                                                className="text-[9px] font-black bg-white hover:bg-blue-600 hover:text-white text-blue-600 border border-blue-50 transition-all px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-50"
                                            >
                                                {savingId === team.id ? '...' : '同步'}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(team.id, team.name)}
                                                disabled={savingId === team.id}
                                                className="text-[10px] font-black bg-white hover:bg-red-500 hover:text-white text-red-500 border border-red-50 w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50"
                                            >
                                                删
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filteredTeams.length === 0 && (
                    <div className="p-20 text-center text-gray-300 font-black uppercase tracking-[0.2em] text-xs">
                        未找到相关战队 / NO ARCHIVE FOUND
                    </div>
                )}
            </div>
        </div>
    );
}




