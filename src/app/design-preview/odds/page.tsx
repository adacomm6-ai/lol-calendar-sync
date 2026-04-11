import React from 'react';

export default function OddsPreview() {
    return (
        <div className="min-h-screen bg-[#0a0e14] p-10 text-slate-200 flex justify-center">

            <div className="w-[600px] flex flex-col gap-6">
                <h1 className="text-xl font-bold text-blue-400 mb-2">Odds Module Preview</h1>

                <div className="bg-[#1e232d] p-4 rounded-xl shadow-lg border border-slate-700/50">

                    {/* List Content */}
                    <div className="flex flex-col gap-4">

                        {/* Row 1: Winner */}
                        <OddsRow
                            title="单局 - 获胜"
                            leftLabel="IG" leftVal="2.487"
                            rightLabel="WBG" rightVal="1.550"
                        />

                        {/* Row 2: Spread */}
                        <OddsRow
                            title="击杀让分"
                            leftLabel="IG +5.5" leftVal="1.900"
                            rightLabel="WBG -5.5" rightVal="1.900"
                        />

                        {/* Row 3: Over/Under (Time) */}
                        <OddsRow
                            title="比赛时间大小"
                            leftLabel="大于 > 32" leftVal="1.810"
                            rightLabel="小于 < 32" rightVal="1.999"
                        />

                        {/* Row 4: Total Kills */}
                        <OddsRow
                            title="总击杀大小"
                            leftLabel="大于 > 23.5" leftVal="1.850"
                            rightLabel="小于 < 23.5" rightVal="1.850"
                        />

                    </div>
                </div>
            </div>

        </div>
    );
}

function OddsRow({ title, leftLabel, leftVal, rightLabel, rightVal }: any) {
    return (
        <div className="flex flex-col gap-2">
            <div className="text-center text-[#8a92a6] text-xs font-medium">{title}</div>
            <div className="flex gap-4">

                {/* Left Option */}
                <div className="flex-1 bg-[#13161c] hover:bg-[#1c212b] cursor-pointer rounded-lg px-4 py-3 flex items-center justify-between transition-colors group">
                    <span className="text-sm text-slate-300 font-bold group-hover:text-white transition-colors">{leftLabel}</span>
                    <span className="text-lg text-white font-black font-mono group-hover:text-yellow-400 transition-colors">{leftVal}</span>
                </div>

                {/* Right Option */}
                <div className="flex-1 bg-[#13161c] hover:bg-[#1c212b] cursor-pointer rounded-lg px-4 py-3 flex items-center justify-between transition-colors group">
                    <span className="text-lg text-white font-black font-mono group-hover:text-yellow-400 transition-colors">{rightVal}</span>
                    <span className="text-sm text-slate-300 font-bold group-hover:text-white transition-colors text-right">{rightLabel}</span>
                </div>

            </div>
        </div>
    );
}
