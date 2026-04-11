'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Use dynamic import with ssr: false to force client-side rendering
// This avoids hydration mismatches for components that rely on browser-specific APIs or state
const PlayerMatchHistory = dynamic(() => import('./PlayerMatchHistory'), {
    ssr: false,
    loading: () => (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-[500px] p-6 animate-pulse">
            <div className="h-8 bg-gray-100 rounded w-1/3 mb-6"></div>
            <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 bg-gray-50 rounded w-full"></div>
                ))}
            </div>
        </div>
    )
});

export default function PlayerMatchHistoryClient(props: any) {
    return <PlayerMatchHistory {...props} />;
}
