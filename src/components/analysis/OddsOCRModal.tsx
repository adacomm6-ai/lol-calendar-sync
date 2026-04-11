'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { uploadOddsScreenshot } from '@/app/match/[id]/actions';
import { addOdds, updateOdds } from '@/app/entry/upload/actions';

interface OddsOCRModalProps {
    isOpen: boolean;
    onClose: () => void;
    matchId: string;
    gameNumber: number;
    onSuccess: () => void;
}

export default function OddsOCRModal({ isOpen, onClose, matchId, gameNumber, onSuccess }: OddsOCRModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [parsedData, setParsedData] = useState<any>(null); // To store AI result
    const [step, setStep] = useState<'UPLOAD' | 'VERIFY'>('UPLOAD');

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) {
            setFile(f);
            setPreviewUrl(URL.createObjectURL(f));
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);

        const formData = new FormData();
        formData.append('file', file);

        const res = await uploadOddsScreenshot(formData);
        if (res.success) {
            setParsedData(res.data);
            setStep('VERIFY');
        } else {
            alert('识别失败 (Recognition Failed): ' + res.error);
        }
        setLoading(false);
    };

    const handleSave = async (type: string, data: any) => {
        if (!data) return;
        setLoading(true);
        try {
            const payload = new FormData();
            payload.append('matchId', matchId);
            payload.append('gameNumber', gameNumber.toString());
            payload.append('provider', 'OCR Import');
            payload.append('type', type);

            if (type === 'WINNER') {
                payload.append('teamAOdds', data.teamA?.toString() || '0');
                payload.append('teamBOdds', data.teamB?.toString() || '0');
            } else if (type === 'HANDICAP') {
                payload.append('threshold', data.threshold?.toString() || '0');
                payload.append('teamAOdds', data.teamA?.toString() || '0');
                payload.append('teamBOdds', data.teamB?.toString() || '0');
            } else if (type === 'KILLS' || type === 'TIME') {
                payload.append('threshold', data.threshold?.toString() || '0');
                payload.append('teamAOdds', data.over?.toString() || '0');
                payload.append('teamBOdds', data.under?.toString() || '0');
            }

            const res = await addOdds(payload); // Using addOdds for now, assuming new entry
            if (res.success) {
                // Ideally, mark this section as 'saved' in UI
                alert(`Saved ${type}!`);
            } else {
                alert(`Failed to save ${type}`);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleSaveAll = async () => {
        if (!parsedData) return;
        setLoading(true);

        // Sequence save
        if (parsedData.winner) await handleSave('WINNER', parsedData.winner);
        if (parsedData.handicap) await handleSave('HANDICAP', parsedData.handicap);
        if (parsedData.total_kills) await handleSave('KILLS', parsedData.total_kills);
        if (parsedData.duration) await handleSave('TIME', parsedData.duration);

        onSuccess();
        onClose();
    };

    return typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        📸 赔率截图识别 (Odds OCR)
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {step === 'UPLOAD' ? (
                        <div className="flex flex-col items-center gap-6 py-10">
                            {previewUrl ? (
                                <div className="relative w-full max-h-64 h-64">
                                    <Image
                                        src={previewUrl}
                                        alt="Preview"
                                        fill
                                        className="object-contain rounded-lg border border-slate-700 shadow-lg"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <div className="w-full h-48 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-900/50">
                                    <span className="text-4xl opacity-50">🖼️</span>
                                    <span className="font-medium">点击上传截图 或 粘贴图片 (Ctrl+V)</span>
                                </div>
                            )}

                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500"
                            />

                            <button
                                onClick={handleUpload}
                                disabled={!file || loading}
                                className="w-full max-w-sm py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 disabled:opacity-50 transition-all"
                            >
                                {loading ? '🤖 AI 正在识别分析中...' : '开始识别 (Start OCR)'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Verification Form */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Winner */}
                                <DataCard
                                    title="Winner (Moneyline)"
                                    data={parsedData?.winner}
                                    labels={['Team A', 'Team B']}
                                    onChange={(field, val) => setParsedData({ ...parsedData, winner: { ...parsedData.winner, [field === 'Team A' ? 'teamA' : 'teamB']: parseFloat(val) } })}
                                />

                                {/* Handicap */}
                                <DataCard
                                    title="Handicap (Spread)"
                                    data={parsedData?.handicap}
                                    labels={['Threshold', 'Team A', 'Team B']}
                                    onChange={(field, val) => {
                                        const key = field === 'Threshold' ? 'threshold' : field === 'Team A' ? 'teamA' : 'teamB';
                                        setParsedData({ ...parsedData, handicap: { ...parsedData.handicap, [key]: parseFloat(val) } })
                                    }}
                                />

                                {/* Duration */}
                                <DataCard
                                    title="Game Duration"
                                    data={parsedData?.duration}
                                    labels={['Threshold', 'Over', 'Under']}
                                    onChange={(field, val) => {
                                        const key = field === 'Threshold' ? 'threshold' : field === 'Over' ? 'over' : 'under';
                                        setParsedData({ ...parsedData, duration: { ...parsedData.duration, [key]: parseFloat(val) } })
                                    }}
                                />

                                {/* Total Kills */}
                                <DataCard
                                    title="Total Kills"
                                    data={parsedData?.total_kills}
                                    labels={['Threshold', 'Over', 'Under']}
                                    onChange={(field, val) => {
                                        const key = field === 'Threshold' ? 'threshold' : field === 'Over' ? 'over' : 'under';
                                        setParsedData({ ...parsedData, total_kills: { ...parsedData.total_kills, [key]: parseFloat(val) } })
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {step === 'VERIFY' && (
                    <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-end gap-3">
                        <button onClick={() => setStep('UPLOAD')} className="px-4 py-2 text-slate-400 font-bold hover:text-white">Retry Upload</button>
                        <button
                            onClick={handleSaveAll}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-green-900/20"
                        >
                            {loading ? 'Saving...' : 'Confirm & Import All'}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

function DataCard({ title, data, labels, onChange }: { title: string, data: any, labels: string[], onChange: (label: string, val: string) => void }) {
    if (!data) return <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 opacity-50 flex items-center justify-center">{title} Not Detected</div>;

    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h3 className="text-sm font-bold text-slate-400 mb-3">{title}</h3>
            <div className="space-y-2">
                {labels.map(label => {
                    // Map label to key
                    let val = '';
                    if (label === 'Team A') val = data.teamA;
                    else if (label === 'Team B') val = data.teamB;
                    else if (label === 'Threshold') val = data.threshold;
                    else if (label === 'Over') val = data.over;
                    else if (label === 'Under') val = data.under;

                    return (
                        <div key={label} className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500">{label}</span>
                            <input
                                className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-right text-yellow-400 font-mono font-bold focus:border-blue-500 focus:outline-none"
                                defaultValue={val}
                                onChange={e => onChange(label, e.target.value)}
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    );
}
