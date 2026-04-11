import React from 'react';

export default function AnalysisLayoutPreview() {
    return (
        <div className="min-h-screen bg-[#0a0e14] p-10 text-slate-200">
            <h1 className="text-2xl font-bold mb-6 text-blue-400">Analysis Layout Preview (2x3 Grid)</h1>

            <div className="w-full h-[800px] border border-dashed border-slate-700 p-4 rounded-xl">
                <div className="grid grid-cols-2 grid-rows-3 gap-4 h-full">

                    {/* Row 1: Player Analysis */}
                    <MockCard title="馃挰 閫夋墜瀵逛綅鍒嗘瀽 A (Player Analysis A)" color="bg-slate-900/40" />
                    <MockCard title="馃挰 閫夋墜瀵逛綅鍒嗘瀽 B (Player Analysis B)" color="bg-slate-900/40" />

                    {/* Row 2: Post Match A & B */}
                    <MockCard title="馃搳 璧涘悗鍒嗘瀽 A (Analysis A)" color="bg-slate-900/60" />
                    <MockCard title="馃搳 璧涘悗鍒嗘瀽 B (Analysis B)" color="bg-indigo-950/40" />

                    {/* Row 3: Post Match C & D */}
                    <MockCard title="馃搳 璧涘悗鍒嗘瀽 C (Analysis C)" color="bg-emerald-950/40" />
                    <MockCard title="馃搳 璧涘悗鍒嗘瀽 D (Analysis D)" color="bg-rose-950/40" />

                </div>
            </div>
        </div>
    );
}

function MockCard({ title, color }: { title: string, color: string }) {
    return (
        <div className={`rounded-xl border border-slate-800/50 p-4 flex flex-col ${color}`}>
            <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-sm text-slate-300">{title}</span>
                <button className="px-2 py-1 bg-slate-800 text-[10px] rounded border border-slate-700">EDIT</button>
            </div>
            <div className="flex-1 flex items-center justify-center text-slate-600 text-xs  border-2 border-dashed border-white/5 rounded">
                Content Area
            </div>
        </div>
    );
}

