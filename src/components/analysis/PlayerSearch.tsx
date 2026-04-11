'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/use-debounce';

export default function PlayerSearch() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Initialize with URL param
    const [text, setText] = useState(searchParams.get('search') || '');
    const [query] = useDebounce(text, 500);

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (query) {
            params.set('search', query);
        } else {
            params.delete('search');
        }
        router.push(`${pathname}?${params.toString()}`);
    }, [query, router, pathname, searchParams]);

    return (
        <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg className="w-4 h-4 text-slate-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                </svg>
            </div>
            <input
                type="text"
                className="block w-full p-2 pl-10 text-sm border bg-slate-900 border-slate-800 placeholder-slate-500 text-white focus:ring-blue-500 focus:border-blue-500 rounded-lg outline-none transition-all"
                placeholder="搜索选手..."
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
        </div>
    );
}
