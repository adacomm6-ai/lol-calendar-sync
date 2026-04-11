'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useState, useMemo } from 'react';
import { uploadBatchImage, previewBatchUpdates, applyBatchUpdates, fixCloudScheduleData, applyGoldenRosterFix } from './actions';

export default function BatchFixClient({ players }: { players: any[] }) {
    const [selectedPlayer, setSelectedPlayer] = useState('');
    const [updates, setUpdates] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    // Hierarchy State
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedStage, setSelectedStage] = useState('');

    // Derived Hierarchies
    const { regions, years, stages, filteredPlayers } = useMemo(() => {
        // 1. Extract Regions
        const uniqueRegions = Array.from(new Set(players.map(p => p.team?.region || 'Unknown'))).sort();

        // 2. Extract Years (from split, e.g. "2026 LPL Spring" -> "2026")
        const allYears = new Set<string>();
        players.forEach(p => {
            const match = p.split.match(/20\d{2}/);
            if (match) allYears.add(match[0]);
            else allYears.add('Other');
        });
        const uniqueYears = Array.from(allYears).sort().reverse();

        // Filter Logic Base
        let filtered = players;

        // Filter by Region
        if (selectedRegion) {
            filtered = filtered.filter(p => (p.team?.region || 'Unknown') === selectedRegion);
        }

        // Filter by Year
        if (selectedYear) {
            filtered = filtered.filter(p => {
                const y = p.split.match(/20\d{2}/)?.[0] || 'Other';
                return y === selectedYear;
            });
        }

        // 3. Extract Stages based on current Year/Region filter
        const currentStages = Array.from(new Set(filtered.map(p => {
            const y = p.split.match(/20\d{2}/)?.[0] || '';
            let s = p.split.replace(y, '').trim();
            s = s.replace(/^[-鈥揬s]+/, '').trim();
            return s || 'Regular';
        }))).sort();

        // Filter by Stage
        if (selectedStage) {
            filtered = filtered.filter(p => {
                const y = p.split.match(/20\d{2}/)?.[0] || '';
                let s = p.split.replace(y, '').trim();
                s = s.replace(/^[-鈥揬s]+/, '').trim();
                return (s || 'Regular') === selectedStage;
            });
        }

        return {
            regions: uniqueRegions,
            years: uniqueYears,
            stages: currentStages,
            filteredPlayers: filtered
        };
    }, [players, selectedRegion, selectedYear, selectedStage]);

    const handleAnalyze = async (formData: FormData) => {
        setLoading(true);
        setStatus('Uploading & Analyzing Image...');
        setUpdates([]);

        try {
            const res = await uploadBatchImage(formData);
            if (!res.success || !res.matches) {
                setStatus('Error: ' + (res.error || 'Analysis failed'));
                setLoading(false);
                return;
            }

            setStatus('Matching with Database...');
            const preview = await previewBatchUpdates(selectedPlayer, res.matches);

            if (preview.success && preview.updates) {
                setUpdates(preview.updates);
                setStatus(`Found ${preview.updates.length} potential matches.`);
            } else {
                setStatus('Error matching DB: ' + preview.error);
            }

        } catch (e: any) {
            setStatus('Error: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async () => {
        if (updates.length === 0) return;
        setLoading(true);
        setStatus('Applying Updates...');

        const res = await applyBatchUpdates(updates);
        if (res.success) {
            setStatus(`Success! Updated ${res.count} games. ` + (res.errors && res.errors.length > 0 ? `Errors: ${res.errors.join(', ')}` : ''));
            setUpdates([]); // Clear
        } else {
            setStatus('Failed to apply updates.');
        }
        setLoading(false);
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-4xl mx-auto mt-10 text-white">
            <h1 className="text-2xl font-bold mb-6">Batch Data Correction Tool (History Image)</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Left: Input */}
                <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-400">1. Select Target Player</label>

                    {/* Level 1: Region */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col">
                            <label className="text-[10px] text-slate-500 mb-1">Region</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white"
                                onChange={(e) => { setSelectedRegion(e.target.value); setSelectedStage(''); setSelectedPlayer(''); }}
                                value={selectedRegion}
                            >
                                <option value="">All</option>
                                {regions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>

                        {/* Level 2: Year */}
                        <div className="flex flex-col">
                            <label className="text-[10px] text-slate-500 mb-1">Year</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white"
                                onChange={(e) => { setSelectedYear(e.target.value); setSelectedStage(''); setSelectedPlayer(''); }}
                                value={selectedYear}
                            >
                                <option value="">All</option>
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        {/* Level 3: Stage */}
                        <div className="flex flex-col">
                            <label className="text-[10px] text-slate-500 mb-1">Stage</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white"
                                onChange={(e) => { setSelectedStage(e.target.value); setSelectedPlayer(''); }}
                                value={selectedStage}
                            >
                                <option value="">All</option>
                                {stages.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <select
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                        onChange={(e) => setSelectedPlayer(e.target.value)}
                        value={selectedPlayer}
                        disabled={filteredPlayers.length === 0}
                    >
                        <option value="">
                            {filteredPlayers.length === 0 ? '-- No Players Found --' : `-- Select Player (${filteredPlayers.length}) --`}
                        </option>
                        {filteredPlayers.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.team?.shortName || 'FA'}) - {p.split}</option>
                        ))}
                    </select>

                    <label className="block text-sm font-bold text-slate-400">2. Upload History Screenshot</label>
                    <form action={handleAnalyze} className="border-2 border-dashed border-slate-700 rounded-lg p-6 hover:bg-slate-800/50 transition">
                        <input type="file" name="image" required accept="image/*" className="block w-full text-sm text-slate-500 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
                        <button type="submit" disabled={loading || !selectedPlayer} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded disabled:opacity-50">
                            {loading ? 'Processing...' : 'Analyze & Preview'}
                        </button>
                    </form>

                    {status && <div className="p-3 bg-slate-800 rounded font-mono text-xs">{status}</div>}
                </div>

                {/* Right: Instructions */}
                <div className="text-sm text-slate-400 space-y-2">
                    <p>Use this tool to fix multiple games at once using a "Match History" screenshot (like the one from Op.gg or similar sites).</p>
                    <ul className="list-disc ml-5 space-y-1">
                        <li>The image must show a <strong>List of Games</strong>.</li>
                        <li>Must contain: Date, Opponent, Game Number (optional), Hero Icon, KDA.</li>
                        <li>Select the correct <strong>Region / Year / Stage</strong> to find your player quickly.</li>
                    </ul>
                </div>
            </div>

            {/* Updates Preview */}
            {updates.length > 0 && (
                <div className="border-t border-slate-800 pt-6">
                    <h3 className="text-lg font-bold mb-4">Proposed Updates ({updates.length})</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="text-slate-500 uppercase bg-slate-800/50">
                                <tr>
                                    <th className="p-2">Status</th>
                                    <th className="p-2">Date</th>
                                    <th className="p-2">Match</th>
                                    <th className="p-2">Game</th>
                                    <th className="p-2">Hero (New)</th>
                                    <th className="p-2">KDA (New)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {updates.map((u, i) => (
                                    <tr key={i} className={u.status === 'READY' ? 'bg-green-900/10' : 'bg-red-900/10'}>
                                        <td className="p-2 font-bold">{u.status}</td>
                                        <td className="p-2">{u.record.date}</td>
                                        <td className="p-2">{u.matchTitle || u.matchId || '-'}</td>
                                        <td className="p-2">GAME {u.gameNumber || '?'}</td>
                                        <td className="p-2 font-bold text-green-400">{u.newHero}</td>
                                        <td className="p-2 font-bold text-green-400">{u.newKda}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={handleApply}
                            disabled={loading || updates.filter(u => u.status === 'READY').length === 0}
                            className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded shadow-lg disabled:opacity-50"
                        >
                            Confirm & Apply Fixes
                        </button>
                    </div>
                </div>
            )}


            {/* Emergency Cloud Fix Util */}
            <div className="mt-12 border-t border-slate-800 pt-8">
                <h3 className="text-xl font-bold text-red-500 mb-2">鈿狅笍 Cloud Database Fix</h3>
                <p className="text-sm text-slate-400 mb-4">
                    Use this button only if Cloud Schedule is incorrect (e.g. AL vs IG missing/wrong time, or LCK times incorrect)
                    while Local is correct. This runs a specific fix script on the database.
                </p>
                <div className="flex gap-4">
                    <button
                        onClick={async () => {
                            if (!(await confirmAction('Run Cloud Data Fix? This will modify match times for AL vs IG and LCK.'))) return;
                            setLoading(true);
                            try {
                                const res = await fixCloudScheduleData();
                                if (res.success) {
                                    alert('Fix applied:\n' + res.logs.join('\n'));
                                } else {
                                    alert('Error:\n' + res.error);
                                }
                            } catch (e: any) {
                                alert('Failed: ' + e.message);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-100 px-4 py-2 rounded text-sm font-bold transition"
                    >
                        Apply Schedule Fix (AL/IG + LCK)
                    </button>

                    <button
                        onClick={async () => {
                            if (!(await confirmAction('Run Smart Roster Sync? This will compare cloud data with local records and ONLY update discrepancies (missing players, wrong roles). Redundant players will be deleted.'))) return;
                            setLoading(true);
                            try {
                                const res = await applyGoldenRosterFix();
                                if (res.success) {
                                    alert('Sync successful! ' + (res.logs || []).slice(-5).join('\n') + '\n...');
                                } else {
                                    alert('Error: ' + res.error);
                                }
                            } catch (e: any) {
                                alert('Failed: ' + e.message);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="bg-blue-900/50 hover:bg-blue-800 border border-blue-700 text-blue-100 px-4 py-2 rounded text-sm font-bold transition"
                    >
                        Smart Roster Sync (Compare & Fix)
                    </button>
                </div>
            </div>
        </div>
    );
}

