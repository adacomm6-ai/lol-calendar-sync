'use client';

// SyncPreviewModal.tsx
import { useState } from 'react';

export default function SyncPreviewModal({ isOpen, onClose, previewData, onConfirm }: any) {
    const [confirming, setConfirming] = useState(false);

    if (!isOpen || !previewData) return null;

    const { previews, teamA, teamB } = previewData;

    const handleConfirm = async () => {
        setConfirming(true);
        await onConfirm();
        setConfirming(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-6xl h-[90vh] overflow-y-auto flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span>🔍</span> Sync Preview
                        <span className="text-sm font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded ml-2">
                            Check data before saving
                        </span>
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                    {previews.map((game: any) => (
                        <div key={game.gameNumber} className="bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                            <h3 className="font-bold text-lg mb-4 text-cyan-400">GAME {game.gameNumber}</h3>

                            <div className="flex gap-4">
                                {/* Team A */}
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-300 mb-2 border-b border-slate-800 pb-1">{teamA?.name}</h4>
                                    <div className="space-y-1">
                                        {game.teamA.map((p: any, idx: number) => (
                                            <div key={idx} className="grid grid-cols-12 gap-2 text-xs items-center bg-slate-900 p-2 rounded hover:bg-slate-800 transition-colors">
                                                <span className="col-span-2 text-slate-500 font-bold">{p.role || idx}</span>
                                                <span className="col-span-3 text-white font-bold">{p.hero}</span>
                                                <span className="col-span-3 text-slate-300 truncate" title={p.name}>{p.name}</span>
                                                <span className="col-span-4 font-mono text-right text-cyan-300">
                                                    {p.kills}/{p.deaths}/{p.assists}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="w-px bg-slate-800"></div>

                                {/* Team B */}
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-300 mb-2 border-b border-slate-800 pb-1 text-right">{teamB?.name}</h4>
                                    <div className="space-y-1">
                                        {game.teamB.map((p: any, idx: number) => (
                                            <div key={idx} className="grid grid-cols-12 gap-2 text-xs items-center bg-slate-900 p-2 rounded hover:bg-slate-800 transition-colors">
                                                <span className="col-span-4 font-mono text-left text-red-300">
                                                    {p.kills}/{p.deaths}/{p.assists}
                                                </span>
                                                <span className="col-span-3 text-slate-300 truncate text-right" title={p.name}>{p.name}</span>
                                                <span className="col-span-3 text-white font-bold text-right">{p.hero}</span>
                                                <span className="col-span-2 text-slate-500 font-bold text-right">{p.role || idx}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={confirming}
                        className="px-8 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        {confirming ? (
                            <>
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                Saving...
                            </>
                        ) : (
                            <>
                                <span>✅</span> Confirm & Sync
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
