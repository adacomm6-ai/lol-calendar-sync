import { prisma } from '@/lib/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import PlayerPhoto from '@/components/player/PlayerPhoto';
import { getTeamShortDisplayName } from '@/lib/team-display';

export const dynamic = 'force-dynamic';

export default async function PlayersSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const searchText = String(search || '').trim();

  if (!searchText) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
        <div className="text-4xl">检索</div>
        <p className="mt-3 text-base">请输入选手名称后再查询。</p>
        <Link href="/analysis" className="mt-4 text-sm font-bold text-blue-600 hover:text-blue-500">
          返回选手资料总览
        </Link>
      </div>
    );
  }

  const filtered = await prisma.player.findMany({
    where: {
      name: {
        contains: searchText,
      },
    },
    include: { team: true, statSnapshots: true },
    orderBy: [{ name: 'asc' }],
  });
  const normalizedSearch = searchText.toLowerCase();

  const scoreExactPlayer = (candidate: any) => {
    const snapshots = candidate.statSnapshots || [];
    let score = snapshots.length * 5;
    score += snapshots.reduce((acc: number, item: any) => acc + Number(item.games || 0), 0) * 0.05;
    if (snapshots.some((item: any) => item.overallScore !== null && item.overallScore !== undefined)) score += 20;
    score += new Date(candidate.updatedAt || 0).getTime() * 0.000000000001;
    return score;
  };

  const exactCandidates = filtered.filter((player) => String(player.name || '').toLowerCase() === normalizedSearch);
  const exactMatch = exactCandidates.length > 0
    ? exactCandidates.slice().sort((left: any, right: any) => scoreExactPlayer(right) - scoreExactPlayer(left))[0]
    : null;

  if (exactMatch) {
    redirect(`/players/${exactMatch.id}`);
  }

  return (
    <div className="w-full px-1 py-6 sm:px-2 lg:px-3">
      <h1 className="mb-6 text-2xl font-bold text-slate-200">“{searchText}” 的搜索结果</h1>
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center">
          <p className="mb-2 text-slate-400">没有找到匹配“{searchText}”的选手。</p>
          <Link href="/analysis" className="text-blue-400 hover:underline">
            查看全部选手资料
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((player) => (
            <Link
              key={player.id}
              href={`/players/${player.id}`}
              className="group block rounded-xl border border-slate-800 bg-slate-900 p-4 transition-all hover:border-blue-500/50 hover:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <PlayerPhoto
                    src={player.photo}
                    name={player.name}
                    size={48}
                    className="shrink-0 border border-slate-700"
                    fallbackClassName="bg-slate-950 border border-slate-800"
                    fallbackTextClassName="text-slate-500"
                  />
                  <div>
                    <div className="text-lg font-bold text-white transition-colors group-hover:text-blue-400">{player.name}</div>
                    <div className="text-sm text-slate-500">{player.team ? getTeamShortDisplayName(player.team) : '未绑定战队'}</div>
                  </div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-xs font-mono text-slate-400">
                  {player.role}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
