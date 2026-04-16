'use client';

import type { ReactNode } from 'react';

interface DockedPopoverProps {
    open: boolean;
    dock: 'left' | 'right';
    className?: string;
    offsetClassName?: string;
    children: ReactNode;
}

export default function DockedPopover({
    open,
    dock,
    className = '',
    offsetClassName = 'top-[calc(100%+12px)]',
    children,
}: DockedPopoverProps) {
    if (!open) return null;

    const dockClass = dock === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right';

    return (
        <div
            className={[
                'absolute z-[120] cursor-default animate-in fade-in slide-in-from-top-2 duration-200',
                dockClass,
                offsetClassName,
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {children}
        </div>
    );
}
