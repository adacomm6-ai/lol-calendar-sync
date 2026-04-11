'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useState } from 'react';
import { fetchFullTournamentToSandbox, confirmSandboxBatch } from './actions';

export default function SandboxSyncClient() {
    const [tournamentName, setTournamentName] = useState('');
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [sandboxData, setSandboxData] = useState<any[] | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleScan = async () => {
        if (!tournamentName) return;
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        setSandboxData(null);

        try {
            const res = await fetchFullTournamentToSandbox(tournamentName);
            if (res.success && res.items) {
                setSandboxData(res.items);
            } else {
                setErrorMsg(res.error || '鎵弿澶辫触');
            }
        } catch (e: any) {
            setErrorMsg(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!sandboxData) return;

        // Filter out CONFLICT items and IN_SYNC items. Only NEW or PARTIAL should be imported.
        const itemsToImport = sandboxData.filter(i => i.status === 'NEW' || i.status === 'PARTIAL');

        if (itemsToImport.length === 0) {
            alert('娌℃湁鍙互瀵煎叆鐨勬柊璧涚▼锛?New or Partial items)');
            return;
        }

        if (!(await confirmAction(`Confirm importing ${itemsToImport.length} matches?`))) return;

        setImporting(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            const res = await confirmSandboxBatch(itemsToImport);
            if (res.success) {
                setSuccessMsg(res.message || '????');
                // Refresh scan
                await handleScan();
            } else {
                setErrorMsg(res.message || '瀵煎叆澶辫触');
            }
        } catch (e: any) {
            setErrorMsg(e.message);
        } finally {
            setImporting(false);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'IN_SYNC': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'NEW': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'PARTIAL': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'CONFLICT': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-slate-700 text-slate-400 border-slate-600';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'IN_SYNC': return '???';
            case 'NEW': return '???';
            case 'PARTIAL': return '????';
            case 'CONFLICT': return '馃敶 闇€鍐茬獊澶勭悊';
            default: return status;
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl">
                <h2 className="text-xl font-bold mb-2">闆疯揪鎺㈡祴绔?(Tournament Radar)</h2>
                <p className="text-sm text-slate-400 mb-6">输入外站完整的 Tournament Name（例如 <code>LPL/2024 Season/Spring Season</code>），一键推入沙盒进行队伍审查。</p>

                <div className="flex gap-4">
                    <input
                        type="text"
                        value={tournamentName}
                        onChange={e => setTournamentName(e.target.value)}
                        placeholder="LPL/2026 Season/Split 1"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none transition-all font-mono"
                    />
                    <button
                        onClick={handleScan}
                        disabled={loading || !tournamentName}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-8 py-3 rounded-lg font-bold shadow-lg shadow-blue-600/20 transition-all font-mono"
                    >
                        {loading ? '馃摗 姝ｅ湪娣辩┖鎺㈡祴...' : '鎵弿璧涘'}
                    </button>
                </div>

                {errorMsg && <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{errorMsg}</div>}
                {successMsg && <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg text-sm">{successMsg}</div>}
            </div>

            {sandboxData && (
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold">瀹℃牳娌欑洅 (Review Pool)</h3>
                            <p className="text-xs text-slate-400 mt-1">
                                宸茬紦鍐?{sandboxData.length} 鍦?BO 绯诲垪璧涖€傚叾涓寘鍚?
                                <span className="text-blue-400 mx-1">{sandboxData.filter(i => i.status === 'NEW').length}</span> 鍦哄叏鏂帮紝
                                <span className="text-yellow-400 mx-1">{sandboxData.filter(i => i.status === 'PARTIAL').length}</span> 鍦哄緟琛ョ己锛?
                                <span className="text-red-400 mx-1">{sandboxData.filter(i => i.status === 'CONFLICT').length}</span> 鍦哄啿绐佸紓甯搞€?
                            </p>
                        </div>
                        <button
                            onClick={handleImport}
                            disabled={importing || sandboxData.filter(i => i.status === 'NEW' || i.status === 'PARTIAL').length === 0}
                            className={`px-6 py-2 rounded-lg font-bold transition-all shadow-lg ${importing
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-green-600/20'
                                }`}
                        >
                            {importing ? '鈴?鎵归噺闃熷垪浼犺緭涓?..' : '鉁?瀹夊叏鍐欏叆涓诲簱 (浠呭啓鍏?NEW / PARTIAL)'}
                        </button>
                    </div>

                    <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                        {sandboxData.map((item, idx) => (
                            <div key={item.lpId} className="bg-slate-950 border border-slate-800/50 p-4 rounded-lg flex items-center gap-4 hover:border-slate-700 transition-colors">
                                <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                                    {idx + 1}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-slate-300 text-sm">{item.date}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${getStatusStyle(item.status)}`}>
                                            {getStatusLabel(item.status)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className={`font-mono font-bold ${item.status === 'CONFLICT' && !item.dbTeamA ? 'text-red-400' : 'text-cyan-400'}`}>
                                            {item.lpTeam1} {item.dbTeamA ? `(${item.dbTeamA.shortName})` : '(鈿狅笍鏈尮閰?'}
                                        </div>
                                        <span className="text-slate-600 font-black italic">VS</span>
                                        <div className={`font-mono font-bold ${item.status === 'CONFLICT' && !item.dbTeamB ? 'text-red-400' : 'text-cyan-400'}`}>
                                            {item.lpTeam2} {item.dbTeamB ? `(${item.dbTeamB.shortName})` : '(鈿狅笍鏈尮閰?'}
                                        </div>
                                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded ml-2">BO{item.lpGameCount}</span>
                                    </div>
                                    {item.issue && (
                                        <div className="text-xs text-red-400 mt-2 flex items-center gap-1">
                                            <span>鈿狅笍 涓诲簱鍐茬獊鐔旀柇:</span> {item.issue}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {sandboxData.length === 0 && (
                            <div className="text-center py-10 text-slate-500 italic">
                                娌欑洅涓虹┖锛屾帰娴嬬粨鏋滃寘鍚浂鏁版嵁銆?
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


