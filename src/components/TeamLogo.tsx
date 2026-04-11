'use client';

import React from 'react';
import { getTeamShortDisplayName } from '@/lib/team-display';

interface TeamLogoProps {
    src?: string | null;
    name?: string | null;
    className?: string;
    size?: number; // Size in px for standard container, not strictly enforced if className overrides
    region?: string; // For fallback emoji
}

import Image from 'next/image';

export default function TeamLogo({ src, name, className = "", size = 24, region }: TeamLogoProps) {
    const [imgError, setImgError] = React.useState(false);

    // Determine fallback content
    const initials = getTeamShortDisplayName({ name });
    const fallbackEmoji = region === 'LPL' ? '🐉' : region === 'LCK' ? '🐯' : '🛡️';

    // Visual correction for BNK FEARX
    const lowerName = name?.toLowerCase() || '';
    const isFox = lowerName.includes('bnk fearx') || lowerName.includes('fearx') || lowerName.includes('fox');

    // Effect to reset error if src changes
    React.useEffect(() => {
        setImgError(false);
    }, [src]);

    if (!src || imgError) {
        // ... (keep existing fallback UI) ...
        return (
            <div
                className={`flex items-center justify-center rounded-full font-bold select-none ${className ? className : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                suppressHydrationWarning={true}
                style={{
                    width: size ? `${size}px` : '24px',
                    height: size ? `${size}px` : '24px',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    fontSize: size ? size * 0.4 : '10px',
                    transform: isFox ? 'scale(0.7)' : undefined,
                    transformOrigin: 'center'
                }}
                title={name || undefined}
            >
                {initials || fallbackEmoji}
            </div>
        );
    }

    const isLocal = src.startsWith('/');
    // Strip query strings (like ?v=1) from local images to prevent next/image errors
    let finalSrc = isLocal ? src.split('?')[0] : src;

    // Use Image Proxy for external (Leaguepedia usually) to prevent 403 or heavy client loading
    if (!isLocal && src.startsWith('http')) {
        finalSrc = `/api/image-proxy?url=${encodeURIComponent(src)}`;
    }

    return (
        <div
            suppressHydrationWarning={true}
            style={{
                position: 'relative',
                width: size ? `${size}px` : '24px',
                height: size ? `${size}px` : '24px',
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }} className={className}>
            <Image
                src={finalSrc}
                alt={name || 'Team Logo'}
                width={size || 24}
                height={size || 24}
                className={`object-contain`}
                style={{
                    transform: isFox ? 'scale(0.7)' : undefined,
                    transformOrigin: 'center'
                }}
                onError={() => setImgError(true)}
                // Force unoptimized for local images to save Vercel Quota
                // Also unoptimize if size is small enough to not matter (e.g. < 100px)
                unoptimized={isLocal || size <= 100 || (!src.includes('ddragon') && !src.includes('akamaihd') && !src.includes('wikia'))}
            />
        </div>
    );
}
