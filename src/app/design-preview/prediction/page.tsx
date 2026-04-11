'use client';

import React from 'react';
import CommentsSection from '@/components/analysis/CommentsSection';
import OddsManager from '@/components/analysis/OddsManager';

export default function PredictionPreviewPage() {
    // Mock Data
    const mockOdds = [
        { type: 'WINNER', teamAOdds: 1.58, teamBOdds: 2.41, gameNumber: 1 },
        { type: 'HANDICAP', teamAOdds: 1.90, teamBOdds: 1.90, threshold: -7.5, gameNumber: 1 },
        { type: 'TIME', teamAOdds: 1.79, teamBOdds: 2.01, threshold: 31, gameNumber: 1 },
        { type: 'KILLS', teamAOdds: 1.90, teamBOdds: 1.90, threshold: 29.5, gameNumber: 1 },
    ];

    const mockComments = [
        {
            id: '1',
            content: 'EDG is looking strong today with their new roster. Expecting a quick 2-0.',
            author: 'Analyst',
            type: 'PRE_MATCH',
            createdAt: new Date(),
            gameNumber: 1
        }
    ];

    return (
        <div className="min-h-screen bg-[#0a0c10] text-white p-8">
            <h1 className="text-2xl font-bold mb-8">Pre-match Prediction Preview</h1>

            <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[30fr_30fr_40fr]">

                {/* LEFT COLUMN SIMULATION */}
                <div className="flex flex-col gap-4">

                    {/* 1. Odds Module */}
                    <OddsManager
                        matchId="preview-match-id"
                        initialOdds={mockOdds.map((o, i) => ({
                            ...o,
                            id: `mock-${i}`,
                            provider: 'mock',
                            timestamp: new Date(),
                            matchId: 'preview-match-id',
                            teamA: { id: 't1', name: 'EDG', shortName: 'EDG' },
                            teamB: { id: 't2', name: 'WE', shortName: 'WE' }
                        })) as any}
                        games={[{ gameNumber: 1 } as any]}
                        teamA={{ id: 't1', name: 'EDG', shortName: 'EDG' } as any}
                        teamB={{ id: 't2', name: 'WE', shortName: 'WE' } as any}
                        activeGameNumber={1}
                        isAdmin={true}
                    />

                    {/* 2. PROPOSED CHANGE: Pre-match Prediction */}
                    <div className="bg-slate-900/40 rounded-xl overflow-hidden border border-slate-800/40 p-1 h-[320px]">
                        <CommentsSection
                            matchId="preview-match-id"
                            comments={mockComments}
                            activeGameNumber={1}
                            isAdmin={true} // Enable editing
                            commentType="PRE_MATCH"
                            title="馃弳 璧涘墠棰勬祴 (PRE-MATCH)"
                        />
                    </div>

                </div>

                {/* Placeholder for other columns */}
                <div className="border border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 opacity-50">
                    Center Stats Column (Placeholder)
                </div>
                <div className="border border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 opacity-50">
                    Right Analysis Column (Placeholder)
                </div>

            </div>
        </div>
    );
}

