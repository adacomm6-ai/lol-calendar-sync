'use client';

import React from 'react';
import Image from 'next/image';

interface PlayerPhotoProps {
  src?: string | null;
  name?: string | null;
  className?: string;
  size?: number;
  fallbackClassName?: string;
  fallbackTextClassName?: string;
}

function buildInitials(name?: string | null) {
  const text = String(name || '').trim();
  if (!text) return '?';
  return text.slice(0, 1).toUpperCase();
}

export default function PlayerPhoto({
  src,
  name,
  className = '',
  size = 40,
  fallbackClassName = 'bg-slate-800 border border-slate-700',
  fallbackTextClassName = 'text-slate-500',
}: PlayerPhotoProps) {
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [src]);

  const initials = buildInitials(name);

  if (!src || imgError) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden rounded-full ${fallbackClassName} ${className}`.trim()}
        style={{ width: `${size}px`, height: `${size}px` }}
        title={name || undefined}
      >
        <span className={`font-black ${fallbackTextClassName}`.trim()} style={{ fontSize: `${Math.max(12, Math.round(size * 0.34))}px` }}>
          {initials}
        </span>
      </div>
    );
  }

  const isLocal = src.startsWith('/');
  const finalSrc = !isLocal && src.startsWith('http')
    ? `/api/image-proxy?url=${encodeURIComponent(src)}`
    : src;

  return (
    <div
      className={`relative overflow-hidden rounded-full ${className}`.trim()}
      style={{ width: `${size}px`, height: `${size}px` }}
      title={name || undefined}
    >
      <Image
        src={finalSrc}
        alt={name || 'Player Photo'}
        fill
        className="object-cover"
        onError={() => setImgError(true)}
        unoptimized={isLocal || !src.includes('ddragon')}
        sizes={`${size}px`}
      />
    </div>
  );
}
