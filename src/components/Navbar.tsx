'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

export default function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <nav className="sticky top-0 z-50 w-full glass">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-10">
                    <div className="flex-shrink-0">
                        <Link href="/" className="group flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-tr from-blue-600 to-cyan-400 text-lg font-black text-white shadow-lg shadow-blue-500/20 transition-all group-hover:scale-110">
                                L
                            </div>
                            <span className="text-[18px] font-black tracking-tighter text-white transition-all group-hover:text-blue-400">
                                LOL HP
                            </span>
                        </Link>
                    </div>

                    <div className="hidden items-center gap-8 md:flex">
                        <NavList />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/settings?tab=general"
                        className="hidden rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-black text-slate-200 transition-all hover:bg-white/10 md:block"
                    >
                        后台设置
                    </Link>

                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="hamburger-menu rounded-xl p-2 text-slate-400 transition-all hover:bg-white/5 hover:text-white md:hidden"
                        aria-label="Toggle menu"
                    >
                        {isMenuOpen ? (
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {isMenuOpen && (
                <div className="animate-in slide-in-from-top border-t border-white/5 bg-slate-900/95 duration-300 backdrop-blur-xl md:hidden">
                    <div className="container mx-auto flex flex-col gap-4 px-4 py-6">
                        <NavLink href="/schedule" onClick={() => setIsMenuOpen(false)}>
                            赛程
                        </NavLink>
                        <NavLink href="/teams" onClick={() => setIsMenuOpen(false)}>
                            战队资料
                        </NavLink>
                        <NavLink href="/odds" onClick={() => setIsMenuOpen(false)}>
                            盘口统计
                        </NavLink>
                        <NavLink href="/strategy" onClick={() => setIsMenuOpen(false)}>
                            策略中心
                        </NavLink>
                        <NavLink href="/analysis" onClick={() => setIsMenuOpen(false)}>
                            选手资料
                        </NavLink>

                        <div className="mt-4 flex flex-col gap-3 border-t border-white/5 pt-4">
                            <Link
                                href="/admin/settings?tab=general"
                                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-center text-xs font-black text-slate-200"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                后台设置
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
}

function NavLink({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) {
    const pathname = usePathname();
    const isActive = pathname === href || pathname.startsWith(`${href}/`);

    return (
        <Link
            href={href}
            onClick={onClick}
            className={`relative py-1 text-sm font-black uppercase tracking-widest transition-all ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-white'
            }`}
        >
            {children}
            {isActive && <span className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-white" />}
        </Link>
    );
}

function NavList() {
    return (
        <>
            <NavLink href="/schedule">赛程</NavLink>
            <NavLink href="/teams">战队资料</NavLink>
            <NavLink href="/odds">盘口统计</NavLink>
            <NavLink href="/strategy">策略中心</NavLink>
            <NavLink href="/analysis">选手资料</NavLink>
        </>
    );
}
