'use client';

import { useMemo, useState, useEffect } from 'react';
import AnalysisCharts from "@/components/analysis/AnalysisCharts";
import GameSummaryPanel from "@/components/analysis/GameSummaryPanel";
// @ts-ignore
import { updateGameStats } from "@/app/match/[id]/actions";

interface Team {
    id: string;
    name: string;
    [key: string]: any;
}

interface Game {
    id: string;
    gameNumber: number;
    winnerId?: string;
    blueSideTeamId?: string;
    redSideTeamId?: string;
    blueSideTeam?: Team;
    redSideTeam?: Team;
    analysisData?: any; // strict parsing logic inside
    teamAStats?: string;
    teamBStats?: string;
    screenshot?: string;
    screenshot2?: string;
    [key: string]: any;
}

interface MatchGameViewProps {
    game: Game;
    teamA?: Team;
    teamB?: Team;
    viewMode?: 'all' | 'chart' | 'scoreboard';
    games?: any[];
    tournamentName?: string;
    isAdmin?: boolean;
}
function EditIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}
function EditStatsModal({ isOpen, onClose, initialData, teamA, teamB, onSave }: any) {
    const [data, setData] = useState(initialData);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setData(initialData);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handlePlayerChange = (teamKey: 'teamA' | 'teamB', index: number, field: string, val: any) => {
        const newData = { ...data };
        if (!newData[teamKey]) newData[teamKey] = { players: [] };
        if (!newData[teamKey].players) newData[teamKey].players = [];

        // Ensure player exists
        if (!newData[teamKey].players[index]) newData[teamKey].players[index] = {};

        newData[teamKey].players[index][field] = val;
        setData(newData);
    };

    const save = async () => {
        setSaving(true);
        await onSave(data);
        setSaving(false);
        onClose();
    };

    // Helper to render team inputs
    const renderTeam = (teamKey: 'teamA' | 'teamB', teamName: string) => {
        // Force 5 rows
        const currentPlayers = data[teamKey]?.players || [];
        const rows = Array.from({ length: 5 }, (_, i) => currentPlayers[i] || { role: ['Top', 'Jungle', 'Mid', 'Bot', 'Support'][i] });

        return (
            <div className="flex-1">
                <h3 className="font-bold mb-2 text-blue-400">{teamName}</h3>
                <div className="space-y-2">
                    {rows.map((p: any, idx: number) => (
                        <div key={idx} className="flex gap-2 text-xs items-center bg-slate-800 p-2 rounded">
                            <span className="w-6 text-slate-500">{p.role || idx}</span>
                            <input className="bg-slate-900 border border-slate-700 rounded px-1 w-20" placeholder="Hero" value={p.hero || ''} onChange={e => handlePlayerChange(teamKey, idx, 'hero', e.target.value)} />
                            <input className="bg-slate-900 border border-slate-700 rounded px-1 w-24" placeholder="Name" value={p.name || ''} onChange={e => handlePlayerChange(teamKey, idx, 'name', e.target.value)} />
                            <div className="flex items-center gap-1">
                                <input className="bg-slate-900 border border-slate-700 rounded px-1 w-8 text-center" placeholder="K" value={p.kills} onChange={e => handlePlayerChange(teamKey, idx, 'kills', parseInt(e.target.value) || 0)} />
                                <span>/</span>
                                <input className="bg-slate-900 border border-slate-700 rounded px-1 w-8 text-center" placeholder="D" value={p.deaths} onChange={e => handlePlayerChange(teamKey, idx, 'deaths', parseInt(e.target.value) || 0)} />
                                <span>/</span>
                                <input className="bg-slate-900 border border-slate-700 rounded px-1 w-8 text-center" placeholder="A" value={p.assists} onChange={e => handlePlayerChange(teamKey, idx, 'assists', parseInt(e.target.value) || 0)} />
                            </div>
                            <input className="bg-slate-900 border border-slate-700 rounded px-1 w-12 text-right" placeholder="Dmg" value={p.damage} onChange={e => handlePlayerChange(teamKey, idx, 'damage', parseInt(e.target.value) || 0)} />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-5xl h-[90vh] overflow-y-auto flex flex-col">
                <h2 className="text-xl font-bold mb-4 text-white">Edit Match Stats</h2>

                <div className="flex gap-8 mb-4">
                    {renderTeam('teamA', teamA?.name || 'Team A')}
                    {renderTeam('teamB', teamB?.name || 'Team B')}
                </div>

                <div className="mt-auto pt-4 flex justify-end gap-4 border-t border-slate-800">
                    <button onClick={onClose} title="取消" aria-label="取消" className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/15 flex items-center justify-center">×</button>
                    <button onClick={save} disabled={saving} title="完成" aria-label="完成" className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold border border-white/20 flex items-center justify-center">
                        {saving ? '...' : '√'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function MatchGameView({ game, teamA, teamB, viewMode = 'all', games, tournamentName, isAdmin = false }: MatchGameViewProps) {
    // Parse the stats if they are strings
    // But AnalysisCharts expects the full "analysis" object structure.
    // We stored that in "analysisData" (JSON string).

    const analysisData = useMemo(() => {
        const parseStatsBlob = (raw: string | null | undefined) => {
            if (!raw) return [];
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
                if (Array.isArray(parsed?.players)) return parsed.players;
                return [];
            } catch {
                return [];
            }
        };

        try {
            if (game.analysisData) {
                return JSON.parse(game.analysisData);
            } else if (game.teamAStats && game.teamBStats) {
                // Fallback: Reconstruct basic structure if analysisData is missing
                const teamA = parseStatsBlob(game.teamAStats);
                const teamB = parseStatsBlob(game.teamBStats);

                // Ensure correct structure for editing
                return {
                    teamA: { players: teamA },
                    teamB: { players: teamB },
                    damage_data: [...teamA, ...teamB],
                    gold_diff: [], // No gold diff in old format
                };
            }
            // Prepare Empty Template if nothing exists
            if (isAdmin) {
                return {
                    teamA: { players: Array(5).fill({ role: '', name: '', hero: '', kills: 0, deaths: 0, assists: 0 }) },
                    teamB: { players: Array(5).fill({ role: '', name: '', hero: '', kills: 0, deaths: 0, assists: 0 }) },
                    damage_data: [],
                };
            }
        } catch (e) {
            console.error("Failed to parse game data", e);
        }
        return null;
    }, [game.analysisData, game.teamAStats, game.teamBStats, isAdmin]);

    const [isEditing, setIsEditing] = useState(false);

    if (!analysisData && !isAdmin) {
        return <div className="p-8 text-center text-slate-500">暂无详细对局数据 (No detailed stats available)</div>;
    }

    const handleSaveStats = async (newData: any) => {
        // Construct array stats from object
        const teamAStats = newData.teamA?.players || [];
        const teamBStats = newData.teamB?.players || [];

        // Call Server Action
        const res = await updateGameStats(game.id, teamAStats, teamBStats, game.winnerId || '');
        if (!res.success) {
            alert("Error saving: " + res.error);
        } else {
            // Success
            setIsEditing(false);
        }
    };

    // Check for "Blue"/"Red" strings or Side ID matches
    // Const w = game.winnerId assignment removed if unused


    return (
        <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-4 pt-10 relative h-full group">

            {isAdmin && (
                <button
                    onClick={() => setIsEditing(true)}
                    title="Edit data"
                    aria-label="Edit data"
                    className="absolute top-4 right-4 z-40 w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 transition-all border border-white/20 flex items-center justify-center"
                >
                    <EditIcon />
                </button>
            )}

            <EditStatsModal
                isOpen={isEditing}
                onClose={() => setIsEditing(false)}
                initialData={analysisData}
                teamA={teamA}
                teamB={teamB}
                onSave={handleSaveStats}
            />

            {/* Added pt-10 to clear absolute button if needed, but moving text is better */}

            {/* New Summary Panel - Only show if NOT explicitly scoreboard view (i.e. Chart view or All) */}
            {viewMode !== 'scoreboard' && analysisData && analysisData.damage_data && analysisData.damage_data.length > 0 && (
                <GameSummaryPanel
                    game={game}
                    match={{
                        teamA: teamA,
                        teamB: teamB,
                        tournament: tournamentName || 'Unknown'
                    }}
                    activeGameNumber={game.gameNumber}
                    isAdmin={isAdmin}
                />
            )}

            {/* Scoreboard (Only if mode requires or fallback) - Actually MatchDetailClient passes 'chart' for middle col.
                We want to REPLACE the chart with SummaryPanel. MatchDetailClient passes 'scoreboard' for bottom col.
                So if viewMode is 'scoreboard' or 'all', we show scoreboard.
            */}
            {(viewMode === 'all' || viewMode === 'scoreboard') && analysisData && analysisData.damage_data && analysisData.damage_data.length > 0 && (
                <AnalysisCharts
                    data={{
                        ...analysisData,
                        original_image_url: analysisData.original_image_url || game.screenshot || null
                    }}
                    teamA={teamA}
                    teamB={teamB}
                    blueTeamName={
                        (game.blueSideTeamId === teamA?.id) ? teamA?.name :
                            (game.blueSideTeamId === teamB?.id) ? teamB?.name : "Blue Team"
                    }
                    redTeamName={
                        (game.redSideTeamId === teamA?.id) ? teamA?.name :
                            (game.redSideTeamId === teamB?.id) ? teamB?.name : "Red Team"
                    }
                    viewMode="scoreboard"
                    games={games}
                    forceActiveGameNumber={game.gameNumber}
                    screenshot={game.screenshot}
                    screenshot2={game.screenshot2}
                    isAdmin={isAdmin}
                />
            )}

            {(!analysisData || !analysisData.damage_data || analysisData.damage_data.length === 0) && (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4">
                    <p>No Stats Data</p>
                    {isAdmin && <button onClick={() => setIsEditing(true)} className="text-blue-500 underline">Add Data Manually</button>}
                </div>
            )}
        </div>
    );
}




