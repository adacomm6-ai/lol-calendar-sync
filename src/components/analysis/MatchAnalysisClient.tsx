'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useState } from 'react';
import MatchGameView from './MatchGameView';
import GameDataUploader from './GameDataUploader';
import { deleteGame } from '@/app/entry/upload/actions';
import { useRouter } from 'next/navigation';

interface MatchAnalysisClientProps {
    games: Array<{
        id: string;
        gameNumber: number;
        analysisData?: any;
        teamAStats?: any;
        [key: string]: any;
    }>;
    matchId: string;
    teamA?: { id: string; name: string;[key: string]: any };
    teamB?: { id: string; name: string;[key: string]: any };
    forceActiveGameNumber?: number;
    viewMode?: 'all' | 'chart' | 'scoreboard'; // New Prop
    tournamentName?: string;
    isAdmin?: boolean;
}

export default function MatchAnalysisClient({ games, matchId, teamA, teamB, forceActiveGameNumber, viewMode = 'all', tournamentName, isAdmin = false }: MatchAnalysisClientProps) {
    // If forced, use it. Else default to last game or 1.
    const [selectedGameNumber, setSelectedGameNumber] = useState(
        forceActiveGameNumber || (games.length > 0 ? games[games.length - 1].gameNumber : 1)
    );
    const [isAddingGame, setIsAddingGame] = useState(false);

    // Sync if prop changes (Computed State adjustment)
    if (forceActiveGameNumber && forceActiveGameNumber !== selectedGameNumber) {
        setSelectedGameNumber(forceActiveGameNumber);
        setIsAddingGame(false);
    }

    // Previous useEffect removed

    const router = useRouter();
    // Revert Fallback: Strict matching to avoid showing G1 data on G2 tab.
    const selectedGame = games.find(g => g.gameNumber === selectedGameNumber);
    const showTabs = !forceActiveGameNumber;

    return (
        <div className="space-y-4 h-full">
            {showTabs && (
                <div className="flex items-center gap-4 border-b border-slate-800 pb-2 overflow-x-auto custom-scrollbar">
                    {games.map((g) => (
                        <button
                            key={g.id}
                            onClick={() => { setSelectedGameNumber(g.gameNumber); setIsAddingGame(false); }}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${!isAddingGame && selectedGameNumber === g.gameNumber
                                ? 'bg-slate-800 text-white border-b-2 border-blue-500'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                }`}
                        >
                            Game {g.gameNumber}
                        </button>
                    ))}

                    {isAdmin && (
                        <button
                            onClick={() => setIsAddingGame(true)}
                            className={`px-3 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1 ${isAddingGame
                                ? 'bg-slate-800 text-white border-b-2 border-green-500'
                                : 'text-slate-400 hover:text-green-400 hover:bg-slate-900'
                                }`}
                        >
                            <span className="text-green-500 font-bold text-lg leading-none">+</span>
                            <span>Add Game</span>
                        </button>
                    )}
                </div>
            )}

            <div className="animate-in fade-in duration-300 min-h-[200px] h-full">
                {isAddingGame ? (
                    <div className="animate-in slide-in-from-left-2 duration-300">
                        <GameDataUploader matchId={matchId} onSuccess={() => {
                            setIsAddingGame(false);
                            router.refresh();
                        }} teamA={teamA} teamB={teamB} />
                    </div>
                ) : (
                    selectedGame ? (
                        /* Check if current game has valid analysis data or at least a result */
                        (() => {
                            const hasStats = selectedGame.analysisData || selectedGame.teamAStats;
                            const hasResult = selectedGame.winnerId || selectedGame.totalKills;

                            if (!hasStats && !hasResult) {
                                // CASE 1: Completely Empty -> Show Uploader Only
                                return (
                                    <div className="animate-in fade-in duration-300 relative">
                                        {isAdmin && (
                                            <button
                                                onClick={async () => {
                                                    if (await confirmAction('确定要删除这条空白小局记录吗？')) {
                                                        const res = await deleteGame(selectedGame.id);
                                                        if (res.success) {
                                                            window.location.reload();
                                                        } else {
                                                            alert('删除失败：' + res.error);
                                                        }
                                                    }
                                                }}
                                                className="absolute top-2 right-2 z-10 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-500 hover:text-red-300 px-3 py-1.5 rounded border border-red-900/50 flex items-center gap-2 transition-all"
                                            >
                                                删除空白小局
                                            </button>
                                        )}
                                        <GameDataUploader
                                            key={selectedGame.id}
                                            matchId={matchId}
                                            gameId={selectedGame.id}
                                            onSuccess={() => router.refresh()}
                                            teamA={teamA}
                                            teamB={teamB}
                                        />
                                    </div>
                                );
                            } else {
                                // CASE 2: Has Stats OR Result -> Show View
                                // If missing stats, we also append Uploader below inside the View wrapper? 
                                // Actually MatchGameView handles missing stats by showing a message. 
                                // We should append Uploader if isAdmin and !hasStats so they can add it.
                                return (
                                    <div className="relative h-full space-y-8">
                                        {isAdmin && viewMode === 'all' && (
                                            <button
                                                onClick={async () => {
                                                    if (await confirmAction('确定要删除这局比赛数据吗？此操作不可撤销。')) {
                                                        const res = await deleteGame(selectedGame.id);
                                                        if (res.success) {
                                                            window.location.reload();
                                                        } else {
                                                            alert('删除失败：' + res.error);
                                                        }
                                                    }
                                                }}
                                                className="absolute top-0 right-0 z-10 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-500 hover:text-red-300 px-3 py-1.5 rounded border border-red-900/50 flex items-center gap-2 transition-all"
                                            >
                                                删除数据并重新导入
                                            </button>
                                        )}

                                        <MatchGameView game={selectedGame} teamA={teamA} teamB={teamB} viewMode={viewMode} games={games} tournamentName={tournamentName} isAdmin={isAdmin} />

                                        {/* If Result exists but No Stats, Show Uploader below */}
                                        {isAdmin && !hasStats && (
                                            <div className="border-t border-slate-800 pt-8">
                                                <h3 className="text-center text-slate-400 mb-4 text-sm font-bold tracking-wider">补充详细数据（截图）</h3>
                                                <GameDataUploader
                                                    key={`append-${selectedGame.id}`}
                                                    matchId={matchId}
                                                    gameId={selectedGame.id}
                                                    onSuccess={() => router.refresh()}
                                                    teamA={teamA}
                                                    teamB={teamB}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                        })()
                    ) : (
                        // No selected game found (Likely G2/G3 that haven't been created yet)
                        <div className="animate-in fade-in duration-300">
                            <div className="text-center py-4 mb-4">
                                <span className="text-slate-400 text-sm">Add Data for Game {selectedGameNumber}</span>
                            </div>

                            {/* Helper to clean up corrupted games (Invisible but exists in DB) */}
                            {isAdmin && games.length > 0 && (
                                <div className="mb-4 text-center">
                                    <details className="text-xs text-slate-600 cursor-pointer">
                                        <summary>Debug: Manage Hidden Games</summary>
                                        <div className="mt-2 p-2 bg-slate-900 border border-slate-800 rounded">
                                            {games.map(g => (
                                                <div key={g.id} className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0">
                                                    <span>ID: {g.id.substring(0, 8)}... (G{g.gameNumber})</span>
                                                    <button
                                                        onClick={async () => {
                                                            if (await confirmAction('Delete this game record?')) {
                                                                await deleteGame(g.id);
                                                                window.location.reload();
                                                            }
                                                        }}
                                                        className="text-red-500 hover:underline"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </div>
                            )}

                            {isAdmin && (
                                <GameDataUploader
                                    key="new-game-entry"
                                    matchId={matchId}
                                    onSuccess={() => router.refresh()}
                                    teamA={teamA}
                                    teamB={teamB}
                                />
                            )}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

