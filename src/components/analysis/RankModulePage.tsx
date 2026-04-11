import Link from 'next/link';

import ChampionImage from '@/components/ChampionImage';
import TeamLogo from '@/components/TeamLogo';
import type { RankLeaderboardRowData, RankModulePageData } from '@/lib/player-rank';

import AnalysisViewTabs from './AnalysisViewTabs';
import RankModuleToolbar from './RankModuleToolbar';

type Props = {
  data: RankModulePageData;
  summaryHref: string;
  rankHref: string;
};

function formatDateTime(value: Date | null) {
  if (!value) return '--';
  return value.toLocaleString('zh-CN', { hour12: false });
}

function fixText(value: string | null | undefined) {
  const text = String(value || '');
  if (!/[脙脗芒忙氓莽茅猫茂冒陇]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded || text;
  } catch {
    return text;
  }
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${Number(value).toFixed(digits)}%`;
}

function formatActivityLabel(label: string) {
  const normalized = fixText(String(label || '').trim());
  if (normalized === 'Hot') return '火热';
  if (normalized === 'Active') return '活跃';
  if (normalized === 'Normal') return '一般';
  if (normalized === 'Low') return '低活跃';
  if (normalized === 'No data') return '无数据';
  return normalized || '无数据';
}

function formatConfidenceLabel(label: string) {
  const normalized = fixText(String(label || '').trim());
  if (normalized === 'High') return '高';
  if (normalized === 'Mid-High') return '中高';
  if (normalized === 'Mid') return '中';
  if (normalized === 'Review') return '自动补齐';
  if (normalized === 'Unknown') return '未知';
  return normalized || '未知';
}

function formatFreshness(value: Date | null) {
  if (!value) {
    return {
      label: '尚未同步',
      description: '当前页面还没有拿到可用的 Rank 同步时间，建议先检查后台自动同步状态。',
      tone: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    };
  }

  const diffHours = (Date.now() - value.getTime()) / (1000 * 60 * 60);
  if (diffHours <= 6) {
    return {
      label: '自动同步正常',
      description: `最近一次刷新时间：${formatDateTime(value)}，当前数据可以直接作为近期状态参考。`,
      tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    };
  }

  if (diffHours <= 24) {
    return {
      label: '数据轻微延迟',
      description: `最近一次刷新时间：${formatDateTime(value)}，仍在正常自动刷新窗口内。`,
      tone: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    };
  }

  return {
    label: '数据可能偏旧',
    description: `最近一次刷新时间：${formatDateTime(value)}，建议结合后台最近同步记录一起判断。`,
    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  };
}

function teamAccentClass(team: string) {
  const seed = Array.from(team || 'TEAM').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  const styles = [
    'border-blue-200 bg-blue-50 text-blue-700',
    'border-cyan-200 bg-cyan-50 text-cyan-700',
    'border-violet-200 bg-violet-50 text-violet-700',
    'border-emerald-200 bg-emerald-50 text-emerald-700',
    'border-amber-200 bg-amber-50 text-amber-700',
    'border-rose-200 bg-rose-50 text-rose-700',
  ];
  return styles[seed] || styles[0];
}

function TeamChip({
  team,
  teamLogo,
  region,
}: {
  team: string;
  teamLogo?: string | null;
  region?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black tracking-[0.04em] ${teamAccentClass(team)}`}>
      <TeamLogo
        src={teamLogo}
        name={team}
        region={region}
        size={18}
        className="h-[18px] w-[18px] overflow-hidden rounded-full border border-white/80 bg-white"
      />
      <span>{team}</span>
    </span>
  );
}

function RoleChip({ role }: { role: string }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
      {role}
    </span>
  );
}

function activityBadgeClass(label: string) {
  const normalized = formatActivityLabel(label);
  if (normalized === '火热') return 'border-red-200 bg-red-50 text-red-700';
  if (normalized === '活跃') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === '一般') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === '低活跃') return 'border-slate-300 bg-slate-100 text-slate-700';
  return 'border-stone-300 bg-stone-100 text-stone-600';
}

function renderRankText(row: RankLeaderboardRowData) {
  const text = `${row.currentTier}${row.currentRank ? ` ${row.currentRank}` : ''}`.trim();
  return text || '未上榜';
}

function localizePrimarySummary(summary: string) {
  if (!summary) return '未绑定可展示的 Rank 账号';
  return fixText(summary)
    .replace(/^Main:/, '主号：')
    .replace(/^No linked Rank account$/, '未绑定可展示的 Rank 账号')
    .replace(' / Last active: ', ' / 最近活跃：');
}

function renderPrimarySummary(summary: string) {
  const localized = localizePrimarySummary(summary);
  if (!localized.includes(' / ')) return localized;
  const [account, platform, lastActive] = localized.split(' / ');
  return { account, platform, lastActive };
}

function ChampionBadge({ championName }: { championName: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
      title={championName}
    >
      <div className="h-7 w-7 overflow-hidden rounded-full border border-slate-200 bg-slate-200">
        <ChampionImage
          name={championName}
          className="h-full w-full"
          fallbackContent={
            <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-slate-600">
              {championName.slice(0, 1)}
            </div>
          }
        />
      </div>
      <span className="text-xs font-medium text-slate-700">{championName}</span>
    </div>
  );
}

function PlayerIdentityBlock({ row, compact = false }: { row: RankLeaderboardRowData; compact?: boolean }) {
  const teamLabel = fixText(row.teamShortName || row.teamName);
  const roleLabel = fixText(row.role);

  return (
    <div className={`flex items-start gap-3 ${compact ? 'min-h-[52px]' : ''}`}>
      <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
        <TeamLogo
          src={row.teamLogo}
          name={teamLabel}
          region={row.region}
          size={28}
          className="h-7 w-7 overflow-hidden rounded-full"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="truncate text-[15px] font-black text-slate-900">{fixText(row.playerName)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <TeamChip team={teamLabel} teamLogo={row.teamLogo} region={row.region} />
          <RoleChip role={roleLabel} />
        </div>
      </div>
    </div>
  );
}

function HighlightCard({
  label,
  row,
  value,
  helper,
}: {
  label: string;
  row: RankLeaderboardRowData | null;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-base font-black text-slate-900">{value}</div>
      {row ? (
        <div className="mt-3">
          <PlayerIdentityBlock row={row} compact />
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-400">{helper}</div>
      )}
    </div>
  );
}

export default function RankModulePage({ data, summaryHref, rankHref }: Props) {
  const freshness = formatFreshness(data.overview.rankSyncedAt);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4">
          <AnalysisViewTabs activeView="rank" summaryHref={summaryHref} rankHref={rankHref} />

          <div className="max-w-4xl">
            <h1 className="text-2xl font-black tracking-tight">Rank 状态模块</h1>
            <p className="mt-1 text-sm text-slate-300">
              聚焦职业选手近期排位状态，展示 Rank、LP、活跃度、主玩英雄、账号数与最近同步情况。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
              <div className="text-slate-400">Rank 同步时间</div>
              <div className="font-bold text-slate-100">{formatDateTime(data.overview.rankSyncedAt)}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
              <div className="text-slate-400">当前选手数</div>
              <div className="font-bold text-emerald-300">{data.overview.currentPlayerCount}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
              <div className="text-slate-400">已接入 Rank</div>
              <div className="font-bold text-cyan-300">{data.overview.rankCoveredPlayerCount}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
              <div className="text-slate-400">高活跃选手</div>
              <div className="font-bold text-amber-300">{data.overview.highActivityPlayerCount}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
              <div className="text-slate-400">近 7 天均值</div>
              <div className="font-bold text-violet-300">{data.overview.avgGames7d.toFixed(1)}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
              <div className="text-slate-400">宗师及以上</div>
              <div className="font-bold text-fuchsia-300">{data.overview.masterPlusPlayerCount}</div>
            </div>
          </div>

          <div className={`rounded-xl border px-4 py-3 text-sm ${freshness.tone}`}>
            <div className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">同步状态</div>
            <div className="mt-1 text-sm font-bold">{freshness.label}</div>
            <div className="mt-1 text-sm opacity-90">{freshness.description}</div>
          </div>
        </div>
      </div>

      <RankModuleToolbar
        selectedRegion={data.selectedRegion}
        selectedYear={data.selectedYear}
        selectedTournament={data.selectedTournament}
        selectedRole={data.selectedRole}
        selectedActivity={data.selectedActivity}
        selectedAccountStatus={data.selectedAccountStatus}
        selectedSortKey={data.selectedSortKey}
        selectedOrder={data.selectedOrder}
        searchText={data.searchText}
        regionOptions={data.regionOptions}
        roleOptions={data.roleOptions}
        activityOptions={data.activityOptions}
        accountStatusOptions={data.accountStatusOptions}
        sortOptions={data.sortOptions}
        yearsByRegion={data.yearsByRegion}
        tournamentsByRegionYear={data.tournamentsByRegionYear}
      />

      <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-900">今日 Rank 状态</h2>
          <div className="text-sm text-slate-500">
            {data.selectedRegion} / {data.selectedYear} / {data.selectedTournament}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <HighlightCard
            label="最活跃选手"
            row={data.highlights.mostActivePlayer}
            value={data.highlights.mostActivePlayer ? `${data.highlights.mostActivePlayer.games7d} 局` : '--'}
            helper="暂无数据"
          />
          <HighlightCard
            label="最高 LP"
            row={data.highlights.highestLpPlayer}
            value={
              data.highlights.highestLpPlayer
                ? `${renderRankText(data.highlights.highestLpPlayer)} / ${data.highlights.highestLpPlayer.leaguePoints ?? '--'}LP`
                : '--'
            }
            helper="暂无数据"
          />
          <HighlightCard
            label="上分最快"
            row={data.highlights.fastestRisingPlayer}
            value={
              data.highlights.fastestRisingPlayer
                ? `${data.highlights.fastestRisingPlayer.games7d} 局 / ${formatPercent(data.highlights.fastestRisingPlayer.winRate14d, 1)}`
                : '--'
            }
            helper="暂无数据"
          />
          <HighlightCard
            label="最久未活跃"
            row={data.highlights.coldestPlayer}
            value={data.highlights.coldestPlayer ? data.highlights.coldestPlayer.lastGameLabel : '--'}
            helper="暂无数据"
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-bold text-slate-500">自动补齐账号</div>
            <div className="mt-2 text-base font-black text-slate-900">{data.highlights.pendingAccountCount}</div>
            <div className="mt-2 text-sm text-slate-600">
              系统已先补齐展示，后续会继续替换成真实账号。
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-black text-slate-900">Rank 状态榜</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1600px] w-full text-[13px] text-slate-800">
            <thead className="border-b border-slate-200 bg-slate-100">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">名次</th>
                <th className="whitespace-nowrap px-3 py-3 text-left font-bold text-slate-700">选手 / 战队</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">当前 Rank</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">LP</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">近 7 天排位</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">近 14 天胜率</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">活跃度</th>
                <th className="whitespace-nowrap px-3 py-3 text-left font-bold text-slate-700">主玩英雄</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">账号数</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">可信度</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-bold text-slate-700">操作</th>
              </tr>
            </thead>

            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center font-medium text-slate-500">
                    当前筛选条件下还没有可展示的 Rank 数据。
                  </td>
                </tr>
              ) : (
                data.rows.map((row, index) => {
                  const summary = renderPrimarySummary(row.primaryAccountSummary);
                  return (
                    <tr key={row.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
                      <td className="px-3 py-4 text-center font-black text-slate-900">{index + 1}</td>
                      <td className="min-w-[420px] px-3 py-4">
                        <div className="space-y-3">
                          <PlayerIdentityBlock row={row} />
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            {typeof summary === 'string' ? (
                              <span>{summary}</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="font-semibold text-slate-700">{summary.account}</span>
                                <span>{summary.platform}</span>
                                <span>{summary.lastActive}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center font-semibold">{renderRankText(row)}</td>
                      <td className="px-3 py-4 text-center font-semibold">{row.leaguePoints ?? '--'}</td>
                      <td className="px-3 py-4 text-center font-semibold">{row.games7d} 局</td>
                      <td className="px-3 py-4 text-center font-semibold">{formatPercent(row.winRate14d, 1)}</td>
                      <td className="px-3 py-4 text-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${activityBadgeClass(row.activityLabel)}`}>
                          {formatActivityLabel(row.activityLabel)}
                        </span>
                      </td>
                      <td className="min-w-[280px] px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          {row.topChampions.length > 0 ? (
                            row.topChampions.map((champion) => (
                              <ChampionBadge key={`${row.id}-${champion.championName}`} championName={fixText(champion.championName)} />
                            ))
                          ) : (
                            <span className="text-slate-400">暂无英雄数据</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center font-semibold">{row.accountCount}</td>
                      <td className="px-3 py-4 text-center font-semibold">{formatConfidenceLabel(row.confidenceLabel)}</td>
                      <td className="px-3 py-4 text-center">
                        <Link
                          href={row.detailUrl}
                          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                        >
                          查看详情
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
