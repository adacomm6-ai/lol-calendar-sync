'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import React, { useState } from 'react';
import { updateGameScreenshot, deleteGameScreenshot } from '@/app/entry/upload/actions';
import AnalysisModal from './AnalysisModal';
import GameDataUploader from './GameDataUploader';

interface PostMatchImagesProps {
    gameId: string;
    mainImage?: string | null;
    suppImage?: string | null;
    isAdmin?: boolean;
    // New props for Analysis
    matchId?: string;
    teamA?: any;
    teamB?: any;
}
function EditIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}
export default function PostMatchImages({ gameId, mainImage, suppImage, isAdmin = false, matchId, teamA, teamB }: PostMatchImagesProps) {
    const [uploading, setUploading] = useState<'main' | 'supplementary' | null>(null);
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'main' | 'supplementary') => {
        const file = e.target.files?.[0];
        if (!file || !gameId) return;

        setUploading(type);
        const formData = new FormData();
        formData.append('image', file);

        try {
            await updateGameScreenshot(gameId, formData, type);
        } catch (error) {
            console.error('Upload failed', error);
            alert('Upload failed');
        } finally {
            setUploading(null);
        }
    };

    const handleDelete = async (type: 'main' | 'supplementary') => {
        if (!(await confirmAction('Are you sure you want to delete this image?'))) return;
        try {
            await deleteGameScreenshot(gameId, type);
        } catch (error) {
            console.error('Delete failed', error);
        }
    };

    const ImageSlot = ({ type, imageUrl, label, icon }: { type: 'main' | 'supplementary', imageUrl?: string | null, label: string, icon: string }) => {
        const isMain = type === 'main';
        return (
            <div className="h-40 bg-slate-900 border border-slate-800 rounded-lg flex flex-col items-center justify-center relative group overflow-hidden cursor-pointer hover:border-blue-500/50 transition-colors">

                {imageUrl ? (
                    <div
                        className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: `url('${imageUrl}')` }}
                        onClick={() => window.open(imageUrl, '_blank')}
                    ></div>
                ) : (
                    <>
                        <div className={`absolute inset-0 bg-cover bg-center opacity-50 group-hover:opacity-70 transition-opacity ${isMain ? "bg-[url('/placeholder-game-stats.jpg')]" : ''}`}></div>
                        <div className="relative z-10 flex flex-col items-center gap-1">
                            <span className={`text-2xl text-slate-600 transition-colors ${isMain ? 'group-hover:text-blue-400' : 'group-hover:text-purple-400'}`}>{icon}</span>
                        </div>
                    </>
                )}

                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded uppercase pointer-events-none">
                    {label}
                </div>

                {isAdmin && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <label className={`w-8 h-8 rounded-full text-white cursor-pointer border border-white/20 flex items-center justify-center shadow-lg transition-all ${uploading === type ? 'bg-slate-500' : 'bg-blue-600/90 hover:bg-blue-500'}`}>
                            {uploading === type ? (
                                <span className="text-[10px] animate-spin block">↻</span>
                            ) : (
                                <span className="text-[10px]">✎</span>
                            )}
                            <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => handleUpload(e, type)}
                                disabled={uploading === type}
                            />
                        </label>
                        {imageUrl && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(type); }}
                                className="w-8 h-8 rounded-full bg-red-600 text-white hover:bg-red-500 border border-white/20 flex items-center justify-center shadow-lg transition-all"
                            >
                                <span className="text-[10px]">✕</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-[#0f141e] border border-slate-800 rounded-xl p-4 shadow-lg mt-6">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                    <span className="text-sm">📊</span> 赛后数据 (POST-MATCH DATA)
                </h3>
                {isAdmin && matchId && (
                    <button
                        onClick={() => setShowAnalysisModal(true)}
                        type="button"
                        title="Edit post-match data"
                        aria-label="Edit post-match data"
                        className="w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 transition-all border border-white/20 flex items-center justify-center"
                    >
                        <EditIcon />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <ImageSlot type="main" imageUrl={mainImage} label="赛后数据" icon="📊" />
                <ImageSlot type="supplementary" imageUrl={suppImage} label="补充面板" icon="📈" />
            </div>

            {/* Analysis Modal */}
            <AnalysisModal isOpen={showAnalysisModal} onClose={() => setShowAnalysisModal(false)}>
                {matchId && (
                    <GameDataUploader
                        matchId={matchId}
                        gameId={gameId}
                        teamA={teamA}
                        teamB={teamB}
                        onSuccess={() => setShowAnalysisModal(false)}
                    />
                )}
            </AnalysisModal>
        </div>
    );
}




