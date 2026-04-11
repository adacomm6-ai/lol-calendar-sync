import Link from 'next/link';

type Props = {
  activeTab: 'match' | 'rank';
  matchHref: string;
  rankHref: string;
};

function tabClassName(active: boolean) {
  return active
    ? 'border-white bg-white text-slate-950 shadow-sm'
    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:text-white';
}

export default function PlayerDetailTabs({ activeTab, matchHref, rankHref }: Props) {
  return (
    <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/70 p-1">
      <Link href={matchHref} className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all ${tabClassName(activeTab === 'match')}`}>
        职业比赛数据
      </Link>
      <Link href={rankHref} className={`ml-1 rounded-lg border px-4 py-2 text-sm font-bold transition-all ${tabClassName(activeTab === 'rank')}`}>
        Rank 排位状态
      </Link>
    </div>
  );
}
