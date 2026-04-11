'use client';

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface PlayerStats {
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgDPM: number;
    avgGPM: number;
}

export default function PlayerRadarChart({ stats }: { stats: PlayerStats }) {
    // Normalize data (Scale 0-100 based on rough max values)
    // Max benchmarks: Kills=10, Deaths=0 (Inverse), Assists=15, DPM=1000, GPM=500
    // Note: Deaths is better if lower. We'll score "Survival" = (10 - Deaths) * 10, min 0.

    const data = [
        { subject: 'Kill', A: Math.min((stats.avgKills / 10) * 100, 100), fullMark: 100 },
        { subject: 'Survival', A: Math.max(0, Math.min(((8 - stats.avgDeaths) / 8) * 100, 100)), fullMark: 100 },
        { subject: 'Assist', A: Math.min((stats.avgAssists / 15) * 100, 100), fullMark: 100 },
        { subject: 'Damage', A: Math.min((stats.avgDPM / 800) * 100, 100), fullMark: 100 }, // 800 DPM is high
    ];

    return (
        <div className="w-full h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                        name="Player Stats"
                        dataKey="A"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fill="#3B82F6"
                        fillOpacity={0.4}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
