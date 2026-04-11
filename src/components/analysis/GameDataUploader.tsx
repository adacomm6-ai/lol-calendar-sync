'use client';

import { useState } from 'react';
import Image from 'next/image';
import { uploadMatchAnalysisImage, saveAnalysisResult } from '@/app/entry/upload/actions'; // Reusing server actions
import { useRouter } from 'next/navigation';
import AnalysisCharts from './AnalysisCharts';
import LineupEditor from '@/app/entry/upload/LineupEditor';

interface GameDataUploaderProps {
    matchId: string;
    gameId?: string; // Optional: If provided, updates this game instead of creating new
    onSuccess?: () => void;
    teamA?: any;
    teamB?: any;
}

export default function GameDataUploader({ matchId, gameId, onSuccess, teamA, teamB }: GameDataUploaderProps) {
    const router = useRouter();
    const [preview, setPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPreview(URL.createObjectURL(file));
            setResult(null);
            setError(null);
        }
    };

    const handleUpload = async (formData: FormData) => {
        setUploading(true);
        setError(null);
        try {
            const res = await uploadMatchAnalysisImage(formData);
            if (res.success) {
                if (res.error) {
                    setError(res.error);
                    setResult(null);
                } else {
                    // Inject the uploaded file path into the analysis result
                    setResult({ ...res.analysis, original_image_url: res.path });
                }
            } else {
                setError('Upload failed: Server returned unsuccessful response.');
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'An unexpected error occurred.');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (!result) return;
        setSaving(true);
        try {
            // Determine Sides mapping
            const teamAId = teamA?.id || 'teamA';
            const teamBId = teamB?.id || 'teamB';
            const winningTeamId = result.winningTeamId || teamAId; // Default to Team A won if not set? Or use logic

            // Logic:
            // IF winningTeam is Team A AND winner is Blue -> Blue=Team A, Red=Team B
            // IF winningTeam is Team A AND winner is Red  -> Blue=Team B, Red=Team A
            // IF winningTeam is Team B AND winner is Blue -> Blue=Team B, Red=Team A
            // IF winningTeam is Team B AND winner is Red  -> Blue=Team A, Red=Team B

            let blueTeamId, redTeamId;
            if (winningTeamId === teamAId) {
                if (result.winner === 'Blue') {
                    blueTeamId = teamAId; redTeamId = teamBId;
                } else {
                    blueTeamId = teamBId; redTeamId = teamAId;
                }
            } else { // Winner is Team B
                if (result.winner === 'Blue') {
                    blueTeamId = teamBId; redTeamId = teamAId;
                } else {
                    blueTeamId = teamAId; redTeamId = teamBId;
                }
            }

            const res = await saveAnalysisResult(result, matchId, gameId, { blueTeamId, redTeamId });
            if (res.success) {
                alert('Game data saved successfully!');
                setResult(null);
                setPreview(null);
                router.refresh(); // Refresh to show new game
                if (onSuccess) onSuccess();
            } else {
                alert('Save failed: ' + res.error);
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">录入新对局数据 (Add Game Data)</h3>

            {!result ? (
                <div className="space-y-4">
                    <form action={handleUpload} className="space-y-4">
                        <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:border-blue-500/50 hover:bg-slate-800/50 transition-all group cursor-pointer relative">
                            <input
                                type="file"
                                name="image"
                                accept="image/*"
                                required
                                onChange={handleFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />

                            {preview ? (
                                <div className="relative w-full h-48">
                                    <Image
                                        src={preview}
                                        alt="Preview"
                                        fill
                                        className="rounded shadow-lg object-contain"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                        <span className="text-2xl">📸</span>
                                    </div>
                                    <p className="text-slate-400 font-medium">点击或拖拽上传截图</p>
                                </>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={!preview || uploading}
                            className={`w-full py-2.5 rounded-lg font-bold text-white transition-all ${!preview ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
                                uploading ? 'bg-blue-600/50 cursor-wait' :
                                    'bg-blue-600 hover:bg-blue-500 hover:shadow-lg'
                                }`}
                        >
                            {uploading ? 'Analyzing...' : 'Analyze Screenshot'}
                        </button>

                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    </form>

                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-slate-700"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-500 text-xs">OR</span>
                        <div className="flex-grow border-t border-slate-700"></div>
                    </div>

                    <button
                        onClick={() => {
                            setResult({
                                winner: "Unknown",
                                duration: "00:00",
                                total_kills: 0,
                                blue_kills: 0,
                                red_kills: 0,
                                winningTeamId: teamA?.id || null,
                                blue_team_name: teamA?.name || "Blue Team",
                                red_team_name: teamB?.name || "Red Team",
                                damage_data: [
                                    ...Array(5).fill(null).map((_, i) => ({
                                        name: `Player ${i + 1}`,
                                        hero: "Unknown",
                                        damage: 0,
                                        kills: 0,
                                        deaths: 0,
                                        assists: 0,
                                        team: "Blue",
                                        role: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"][i] || "Unknown",
                                        hero_avatar: ""
                                    })),
                                    ...Array(5).fill(null).map((_, i) => ({
                                        name: `Player ${i + 6}`,
                                        hero: "Unknown",
                                        damage: 0,
                                        kills: 0,
                                        deaths: 0,
                                        assists: 0,
                                        team: "Red",
                                        role: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"][i] || "Unknown",
                                        hero_avatar: ""
                                    }))
                                ]
                            });
                            setPreview("manual_entry"); // Placeholder to satisfy "preview" check if needed, but actually we use !result check in render.
                            // Actually, if I set result, the preview variable isn't strictly needed for the view switch because the view switches on `!result ? ... : ...`.
                            // However, the "Cancel" button in the result view calls `setPreview(null)`. 
                            // Let's set preview to something truthy so we know we are in "entry mode" effectively, though logical switch is on `result`.
                        }}
                        className="w-full py-2.5 rounded-lg font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-all border border-slate-700"
                    >
                        ✏️ Manual Entry (No Screenshot)
                    </button>
                </div>
            ) : (
                <div className="animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex flex-col gap-4 mb-4 bg-slate-950 p-4 rounded border border-slate-800">
                        <div className="flex items-center justify-between">
                            <span className="text-green-400 font-bold text-sm">
                                {result.original_image_url ? "Analysis Complete!" : "Manual Entry Mode"}
                            </span>
                            <button
                                onClick={() => { setResult(null); setPreview(null); }}
                                className="text-xs text-slate-500 hover:text-white"
                            >
                                Cancel
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-6">
                            {/* Winning Team Selector */}
                            <div className="space-y-2">
                                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Winning Team 🏆</div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setResult({ ...result, winningTeamId: teamA?.id || 'teamA' })}
                                        className={`flex-1 min-w-[100px] px-3 py-2 text-xs font-bold rounded border transition-all ${(!result.winningTeamId || result.winningTeamId === (teamA?.id || 'teamA'))
                                            ? 'bg-slate-700 text-white border-slate-600 shadow-lg shadow-black/20'
                                            : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'}`}
                                    >
                                        {teamA?.name || 'Team A'}
                                    </button>
                                    <button
                                        onClick={() => setResult({ ...result, winningTeamId: teamB?.id || 'teamB' })}
                                        className={`flex-1 min-w-[100px] px-3 py-2 text-xs font-bold rounded border transition-all ${(result.winningTeamId === (teamB?.id || 'teamB'))
                                            ? 'bg-slate-700 text-white border-slate-600 shadow-lg shadow-black/20'
                                            : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'}`}
                                    >
                                        {teamB?.name || 'Team B'}
                                    </button>
                                </div>
                            </div>

                            {/* Winning Side Selector */}
                            <div className="space-y-2">
                                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Winning Side 🚩</div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setResult({ ...result, winner: 'Blue' })}
                                        className={`px-3 py-2 text-xs font-bold rounded border transition-all ${result.winner === 'Blue'
                                            ? 'bg-blue-900/40 text-blue-400 border-blue-800 shadow-lg shadow-blue-900/10'
                                            : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'}`}
                                    >
                                        Blue (Left)
                                    </button>
                                    <button
                                        onClick={() => setResult({ ...result, winner: 'Red' })}
                                        className={`px-3 py-2 text-xs font-bold rounded border transition-all ${result.winner === 'Red'
                                            ? 'bg-red-900/40 text-red-400 border-red-800 shadow-lg shadow-red-900/10'
                                            : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'}`}
                                    >
                                        Red (Right)
                                    </button>
                                </div>
                            </div>

                            {/* Kills Breakdown */}
                            <div className="space-y-2">
                                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Kills ⚔️</div>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        className="w-12 px-1 py-2 text-xs font-bold rounded border bg-slate-900 border-blue-900 text-blue-400 focus:border-blue-500 outline-none text-center"
                                        value={result.blue_kills || ''}
                                        placeholder="B"
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const red = result.red_kills || 0;
                                            setResult({ ...result, blue_kills: val, total_kills: val + red });
                                        }}
                                    />
                                    <span className="text-slate-600">+</span>
                                    <input
                                        type="number"
                                        className="w-12 px-1 py-2 text-xs font-bold rounded border bg-slate-900 border-red-900 text-red-400 focus:border-red-500 outline-none text-center"
                                        value={result.red_kills || ''}
                                        placeholder="R"
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const blue = result.blue_kills || 0;
                                            setResult({ ...result, red_kills: val, total_kills: blue + val });
                                        }}
                                    />
                                    <span className="text-slate-600">=</span>
                                    <div className="w-10 py-2 text-xs font-bold text-yellow-500 text-center bg-slate-900/50 rounded border border-slate-800">
                                        {result.total_kills || 0}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Info Guide */}
                        <div className="text-[11px] text-slate-500 bg-slate-900/50 p-2 rounded border border-slate-800/50 flex flex-wrap gap-x-4 gap-y-1">
                            <div>
                                <span className="text-blue-400 font-bold">Blue Side</span> =
                                <span className="text-slate-300 ml-1">
                                    {(result.winner === 'Blue' && (!result.winningTeamId || result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamA?.name || 'Team A') :
                                        (result.winner === 'Blue' && result.winningTeamId === (teamB?.id || 'teamB')) ? (teamB?.name || 'Team B') :
                                            (result.winner === 'Red' && (!result.winningTeamId || result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamB?.name || 'Team B') :
                                                (teamA?.name || 'Team A')}
                                </span>
                            </div>
                            <div>
                                <span className="text-red-400 font-bold">Red Side</span> =
                                <span className="text-slate-300 ml-1">
                                    {(result.winner === 'Red' && (!result.winningTeamId || result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamA?.name || 'Team A') :
                                        (result.winner === 'Red' && result.winningTeamId === (teamB?.id || 'teamB')) ? (teamB?.name || 'Team B') :
                                            (result.winner === 'Blue' && (!result.winningTeamId || result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamB?.name || 'Team B') :
                                                (teamB?.name || 'Team B')}
                                </span>
                            </div>
                        </div>

                        {/* Data Swap Utility */}
                        <div className="mt-2 flex justify-end">
                            <button
                                onClick={() => {
                                    if (!result || !result.damage_data) return;
                                    const newData = { ...result };
                                    newData.damage_data = result.damage_data.map((p: any) => ({
                                        ...p,
                                        team: p.team === 'Blue' ? 'Red' : p.team === 'Red' ? 'Blue' : p.team
                                    }));
                                    setResult(newData);
                                }}
                                className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1 bg-slate-900 border border-slate-700 px-2 py-1 rounded transition-colors"
                            >
                                <span>⇄</span>
                                <span>Swap Player Data (Fix Incorrect Sides)</span>
                            </button>
                        </div>
                    </div>

                    {/* Lineup Editor for Manual Correction */}
                    <LineupEditor data={result} onUpdate={(newData) => setResult({ ...newData })} />

                    {/* Preview Chart */}
                    <AnalysisCharts
                        data={result}
                        blueTeamName={
                            (result.winner === 'Blue' && (result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamA?.name || 'Team A') :
                                (result.winner === 'Blue' && (result.winningTeamId === (teamB?.id || 'teamB'))) ? (teamB?.name || 'Team B') :
                                    (result.winner === 'Red' && (result.winningTeamId === (teamB?.id || 'teamB'))) ? (teamA?.name || 'Team A') : // If Red won and Red is TeamB -> Blue is TeamA
                                        (result.winner === 'Red' && (result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamB?.name || 'Team B') : // If Red won and Red is TeamA -> Blue is TeamB
                                            'Blue Team'
                        }
                        redTeamName={
                            (result.winner === 'Red' && (result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamA?.name || 'Team A') :
                                (result.winner === 'Red' && (result.winningTeamId === (teamB?.id || 'teamB'))) ? (teamB?.name || 'Team B') :
                                    (result.winner === 'Blue' && (result.winningTeamId === (teamB?.id || 'teamB'))) ? (teamA?.name || 'Team A') :
                                        (result.winner === 'Blue' && (result.winningTeamId === (teamA?.id || 'teamA'))) ? (teamB?.name || 'Team B') :
                                            'Red Team'
                        }
                    />

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full mt-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition shadow-lg shadow-green-900/20 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Confirm & Add Game'}
                    </button>
                </div>
            )
            }
        </div >
    );
}
