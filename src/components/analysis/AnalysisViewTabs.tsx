'use client';

import Link from 'next/link';

type Props = {
  activeView: 'summary' | 'rank';
  summaryHref: string;
  rankHref: string;
};

function tabClassName(active: boolean) {
  return active
    ? 'border-white bg-white text-slate-950 shadow-sm'
    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:text-white';
}

export default function AnalysisViewTabs({ activeView, summaryHref, rankHref }: Props) {
  return (
    <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/70 p-1">
      <Link
        href={summaryHref}
        prefetch
        aria-label="切换到选手资料总览"
        aria-current={activeView === 'summary' ? 'page' : undefined}
        className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all ${tabClassName(activeView === 'summary')}`}
      >
        选手资料总览
      </Link>
      <Link
        href={rankHref}
        prefetch
        aria-label="切换到 Rank 状态模块"
        aria-current={activeView === 'rank' ? 'page' : undefined}
        className={`ml-1 rounded-lg border px-4 py-2 text-sm font-bold transition-all ${tabClassName(activeView === 'rank')}`}
      >
        Rank 状态模块
      </Link>
    </div>
  );
}
