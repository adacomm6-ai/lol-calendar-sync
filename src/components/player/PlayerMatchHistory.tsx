'use client';


import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { uploadBatchImage } from '@/app/admin/batch-fix/actions'; // Reuse existing upload action
import { savePlayerMatches } from '@/app/players/[id]/actions';
import TeamLogo from '@/components/TeamLogo';
import ChampionImage from '@/components/ChampionImage';

interface MatchHistoryItem {
    matchId: string;
    gameId: string;
    date: Date;
    gameNumber: number;
    result: 'WIN' | 'LOSS';
    hero: string;
    kda: string;
    damage: number;
    opponent: {
        id: string;
        name: string;
        shortName: string;
        region: string;
        logo: string | null;
    } | null;
    tournament: string; // Added
}

interface Props {
    player: any;
    initialHistory: MatchHistoryItem[];
}

export default function PlayerMatchHistory({ player, initialHistory }: Props) {
    const [history, setHistory] = useState(initialHistory);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [analyzeStatus, setAnalyzeStatus] = useState('');
    const [activeTab, setActiveTab] = useState('ALL');

    const normalizeTournamentAliasKey = (value: string) => {
        const stopwords = new Set(['season', '赛季', 'unknown', '未知', 'tournament', '赛事', 'vs', 'versus', 'regular', 'playoffs', 'group', 'stage', 'swiss', 'playin']);
        const normalizeToken = (token: string) => {
            if (token === 'playoff' || token === 'playoffs' || token === '季后赛') return 'playoffs';
            if (token === 'group' || token === 'groups') return 'group';
            if (token === 'stage' || token === '阶段') return 'stage';
            return token;
        };

        return String(value || '')
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean)
            .map(normalizeToken)
            .filter((token) => !stopwords.has(token))
            .sort()
            .join(' ');
    };

    const scoreTournamentLabel = (value: string) => {
        const t = String(value || '').trim();
        if (!t) return 0;
        let score = 0;
        if (/^[A-Za-z]+\s+20\d{2}\b/.test(t)) score += 20;
        if (/\b20\d{2}\b/.test(t)) score += 8;
        if (/\b(split|cup)\b/i.test(t)) score += 6;
        if (/\b(playoffs?|regular|group|stage|swiss|play[- ]?in)\b/i.test(t)) score -= 4;
        if (t.toLowerCase().includes('unknown') || t.includes('未知')) score -= 1000;
        score -= Math.max(0, t.length - 36) * 0.05;
        return score;
    };

    const tournamentAliasMap = useMemo(() => {
        const grouped = new Map<string, string[]>();
        history.forEach((item) => {
            const raw = String(item.tournament || 'Unknown').trim();
            if (!raw) return;
            const key = normalizeTournamentAliasKey(raw);
            const list = grouped.get(key) || [];
            if (!list.includes(raw)) list.push(raw);
            grouped.set(key, list);
        });

        const aliasMap = new Map<string, string[]>();
        grouped.forEach((aliases) => {
            const display = aliases.slice().sort((left, right) => {
                const diff = scoreTournamentLabel(right) - scoreTournamentLabel(left);
                if (diff !== 0) return diff;
                return left.localeCompare(right);
            })[0];
            aliasMap.set(display, aliases);
        });
        return aliasMap;
    }, [history]);

    const tournaments = ['ALL', ...Array.from(tournamentAliasMap.keys())];

    const filteredHistory = activeTab === 'ALL'
        ? history
        : history.filter((h) => {
            const aliases = tournamentAliasMap.get(activeTab) || [activeTab];
            return aliases.includes(String(h.tournament || 'Unknown'));
        });

    const updateHistoryItem = useCallback((gameId: string, updater: (item: MatchHistoryItem) => MatchHistoryItem) => {
        setHistory((prevHistory) =>
            prevHistory.map((item) => (item.gameId === gameId ? updater(item) : item)),
        );
    }, []);

    const [debugLogs, setDebugLogs] = useState<string[]>([]); // Temporary Debug State

    const processImageFile = useCallback(async (file: File) => {
        setLoading(true);
        setAnalyzeStatus('正在识别图片...（安全模式：优先识别 KDA）');

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await uploadBatchImage(formData);
            if (res.success && res.matches) {
                let matchCountResult = 0;

                setHistory(prevHistory => {
                    const newHistory = [...prevHistory];
                    if (res.matches.length === 0) {
                        setAnalyzeStatus('未从图片中识别到比赛数据，请上传清晰有效的计分板截图。');
                        setIsEditing(false);
                        return prevHistory;
                    }

                    res.matches.forEach((record: any) => {
                        const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '');
                        const nRecOpp = normalize(record.opponent || '');

                        const target = newHistory.find(h => {
                            const oppName = h.opponent?.shortName || h.opponent?.name || '';
                            const nOpp = normalize(oppName);
                            const oppMatch = nRecOpp && (nOpp.includes(nRecOpp) || nRecOpp.includes(nOpp));

                            let gNumMatch = true;
                            if (record.game_number !== undefined && record.game_number !== null) {
                                gNumMatch = h.gameNumber === Number(record.game_number);
                            }

                            let isSameDay = true;
                            if (record.date) {
                                const hDate = new Date(h.date);
                                const recDate = new Date(record.date);
                                if (!isNaN(hDate.getTime()) && !isNaN(recDate.getTime())) {
                                    const diffTime = Math.abs(hDate.getTime() - recDate.getTime());
                                    isSameDay = diffTime < 48 * 60 * 60 * 1000;
                                }
                            }
                            return oppMatch && gNumMatch && isSameDay;
                        });

                        if (target) {
                            if (record.kda && typeof record.kda === 'string') {
                                target.kda = record.kda;
                            }
                            if (record.damage && (!target.damage || target.damage === 0)) {
                                const dmgStr = String(record.damage).toLowerCase();
                                let dmgVal = parseFloat(dmgStr.replace(/[k,]/g, ''));
                                if (dmgStr.includes('k')) dmgVal *= 1000;
                                target.damage = Math.floor(dmgVal);
                            }
                            matchCountResult++;
                        }
                    });

                    if (matchCountResult > 0) {
                        setAnalyzeStatus(`识别完成，已更新 ${matchCountResult} 条比赛记录。`);
                        setDebugLogs([]);
                        setIsEditing(true);
                    } else {
                        setAnalyzeStatus('未匹配到可更新的比赛记录。');
                    }
                    return newHistory;
                });

            } else {
                setAnalyzeStatus('识别失败：' + res.error);
            }
        } catch (e: any) {
            setAnalyzeStatus('处理出错：' + e.message);
        } finally {
            setLoading(false);
        }
    }, []); // No dependencies due to functional setHistory

    // Paste Handler - Moved here to allow access to processImageFile
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        e.preventDefault();
                        processImageFile(blob);
                    }
                    break;
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [processImageFile]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processImageFile(file);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await savePlayerMatches(player.id, history);
            setIsEditing(false);
            setAnalyzeStatus('保存成功。');
        } catch (e: any) {
            setAnalyzeStatus('保存失败：' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="min-h-[500px] bg-white rounded-xl border border-gray-200 shadow-sm animate-pulse"></div>;
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-[500px] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4" suppressHydrationWarning>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1 h-6 bg-blue-600 rounded-full block"></span>
                        比赛记录
                    </h3>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
                        本地修正模式
                    </span>
                    <div className="flex items-center gap-2">
                        {!isEditing ? (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-3 py-1 text-xs font-bold bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                            >
                                编辑 / 修正数据
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleSave}
                                    disabled={loading}
                                    className="px-3 py-1 text-xs font-bold bg-green-600 text-white rounded hover:bg-green-500"
                                >
                                    {loading ? '保存中...' : '保存修改'}
                                </button>
                                <button
                                    onClick={() => { setIsEditing(false); setHistory(initialHistory); }} // Cancel
                                    className="px-3 py-1 text-xs font-bold bg-red-100 text-red-600 rounded hover:bg-red-200"
                                >
                                    取消
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Excel Controls */}
                <div className="flex items-center gap-3">


                    {/* Image Analyzer Input */}
                    <div className="relative">
                        <input
                            type="file"
                            id="history-upload"
                            className="hidden"
                            accept="image/*"
                            onChange={handleImageUpload}
                            disabled={loading}
                        />
                        <label
                            htmlFor="history-upload"
                            className={`cursor-pointer flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded transition-colors ${loading ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {loading ? '识别中...' : '自动识别（上传 / Ctrl+V）'}
                        </label>
                    </div>
                    {analyzeStatus && <span className="text-xs text-blue-600 font-mono hidden md:block">{analyzeStatus}</span>}
                </div>
            </div>

            {/* Tournament Tabs */}
            {tournaments.length > 2 && ( // Only show if we actually have multiple (ALL + 1 is redundant if only 1 exists? No, ALL + 1 = 2 items. So length > 2 means at least 2 distinct tourneys.)
                <div className="px-6 pt-4 flex gap-2 overflow-x-auto border-b border-gray-100 pb-0">
                    {tournaments.map(t => (
                        <button
                            key={t}
                            onClick={() => setActiveTab(t)}
                            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === t
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            {t === 'ALL' ? '全部记录' : t}
                        </button>
                    ))}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                            <th className="py-3 pl-6 w-32 text-center">时间 / 结果</th>
                            <th className="py-3 pl-4">VS</th>
                            <th className="py-3 pl-4">英雄</th>
                            <th className="py-3">KDA</th>
                            <th className="py-3 text-right pr-6">伤害</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredHistory.map((m) => (
                            <tr key={m.gameId} className={`group transition-colors ${isEditing ? 'hover:bg-blue-50' : 'hover:bg-slate-50'}`}>
                                {/* Date / Status */}
                                <td className={`py-3 pl-6 ${isEditing ? 'border-r border-gray-200 bg-gray-50' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0 ${m.result === 'WIN' ? 'bg-blue-500' : 'bg-red-500'}`}>
                                            {m.result === 'WIN' ? '胜' : '负'}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-900 font-mono" suppressHydrationWarning>{format(new Date(m.date), 'yyyy-MM-dd')}</span>
                                            <span className="text-[10px] text-gray-400 font-mono hidden md:block" suppressHydrationWarning>{format(new Date(m.date), 'HH:mm')}</span>
                                        </div>
                                    </div>
                                </td>

                                {/* Opponent */}
                                <td className={`py-3 pl-4 ${isEditing ? 'border-r border-gray-200 bg-gray-50' : ''}`}>
                                    {m.opponent && !isEditing ? (
                                        <Link href={`/match/${m.matchId}?gameNumber=${m.gameNumber}`} className="group block">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col items-center min-w-[40px]">
                                                    <TeamLogo src={player.team.logo} name={player.team.name} size={24} className="w-6 h-6 opacity-60 grayscale group-hover:grayscale-0 transition-all" region={player.team.region} />
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[10px] font-bold text-gray-300 font-mono group-hover:text-blue-400 transition-colors">VS</span>
                                                    <span className="text-xs font-black text-gray-700 font-mono group-hover:text-blue-600 transition-colors">第 {m.gameNumber} 局</span>
                                                </div>
                                                <div className="flex flex-col items-center min-w-[40px]">
                                                    <TeamLogo src={m.opponent.logo} name={m.opponent.name} size={24} className="w-6 h-6 group-hover:scale-110 transition-transform" region={m.opponent.region} />
                                                </div>
                                            </div>
                                        </Link>
                                    ) : m.opponent && (
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col items-center min-w-[40px]">
                                                <TeamLogo src={player.team.logo} name={player.team.name} size={24} className="w-6 h-6 opacity-60 grayscale group-hover:grayscale-0 transition-all" region={player.team.region} />
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-[10px] font-bold text-gray-300 font-mono">VS</span>
                                                <span className="text-xs font-black text-gray-700 font-mono">第 {m.gameNumber} 局</span>
                                            </div>
                                            <div className="flex flex-col items-center min-w-[40px]">
                                                <TeamLogo src={m.opponent.logo} name={m.opponent.name} size={24} className="w-6 h-6 group-hover:scale-110 transition-transform" region={m.opponent.region} />
                                            </div>
                                        </div>
                                    )}
                                </td>

                                {/* Hero */}
                                <td className={`py-3 pl-4 ${isEditing ? 'border-r border-gray-200 p-0' : ''}`}>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={m.hero || ''}
                                            onChange={(e) => {
                                                updateHistoryItem(m.gameId, (item) => ({
                                                    ...item,
                                                    hero: e.target.value,
                                                }));
                                            }}
                                            className="w-full h-full min-h-[50px] px-2 text-xs font-mono font-bold text-center text-gray-900 border-none focus:ring-2 focus:ring-inset focus:ring-blue-500 bg-white"
                                            placeholder="英雄名"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded overflow-hidden relative border border-gray-200 shadow-sm group-hover:border-blue-300 transition-colors">
                                            <ChampionImage
                                                name={m.hero}
                                                className="w-full h-full object-cover"
                                                fallbackContent={null}
                                            />
                                        </div>
                                    )}
                                </td>

                                {/* KDA */}
                                <td className={`py-3 ${isEditing ? 'border-r border-gray-200 p-0' : ''}`}>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={m.kda || ''}
                                            onChange={(e) => {
                                                updateHistoryItem(m.gameId, (item) => ({
                                                    ...item,
                                                    kda: e.target.value,
                                                }));
                                            }}
                                            onBlur={(e) => {
                                                let val = e.target.value.trim();
                                                val = val.replace(/[\s-]+/g, '/');
                                                if (/^\d+\/\d+\/\d+$/.test(val)) {
                                                    updateHistoryItem(m.gameId, (item) => ({
                                                        ...item,
                                                        kda: val,
                                                    }));
                                                }
                                            }}
                                            className="w-full h-full min-h-[50px] px-2 text-sm font-mono font-bold text-center text-gray-900 border-none focus:ring-2 focus:ring-inset focus:ring-blue-500 bg-white"
                                            placeholder="K / D / A"
                                        />
                                    ) : (
                                        <span className="text-sm font-bold text-gray-800 font-mono tracking-tight">{m.kda}</span>
                                    )}
                                </td>

                                {/* Damage */}
                                <td className="py-3 text-right pr-6">
                                    {m.damage > 0 ? (
                                        <div className="flex flex-col items-end">
                                            <span className="text-sm font-bold text-gray-700 font-mono">{(m.damage / 1000).toFixed(1)}k</span>
                                            <div className="w-16 h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${Math.min((m.damage / 40000) * 100, 100)}%` }}></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-300">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredHistory.length === 0 && (
                    <div className="py-10 text-center text-sm text-gray-400">
                        {history.length === 0
                            ? '当前没有可展示的比赛记录。'
                            : activeTab === 'ALL'
                                ? '当前没有可展示的比赛记录。'
                                : `当前筛选赛事“${activeTab}”下没有比赛记录。`}
                    </div>
                )}

                {/* Debug Logs Area */}
                {isEditing && debugLogs.length > 0 && (
                    <div className="p-4 bg-yellow-50 border-t border-yellow-100">
                        <p className="text-xs font-bold text-yellow-800 mb-2">识别调试信息：</p>
                        <div className="text-[10px] font-mono text-yellow-700 bg-white p-2 rounded border border-yellow-200 h-32 overflow-y-auto">
                            {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
                            <div className="mt-2 text-gray-400">
                                当前记录中的对手：{history.map(h => h.opponent?.shortName || h.opponent?.name).join(', ')}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

