'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const PlayerMatchHistory = dynamic(() => import('./PlayerMatchHistory'), {
    ssr: false,
    loading: () => <div className="min-h-[500px] bg-white rounded-xl border border-gray-200 shadow-sm animate-pulse"></div>
});

export default function PlayerMatchHistoryNoSSR(props: any) {
    return <PlayerMatchHistory {...props} />;
}
