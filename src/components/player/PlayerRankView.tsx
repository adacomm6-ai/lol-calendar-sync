import ChampionImage from '@/components/ChampionImage';
import type { PlayerRankViewData } from '@/lib/player-rank';

type Props = {
  data: PlayerRankViewData;
};

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${Number(value).toFixed(digits)}%`;
}

function formatDateTime(value: Date | null) {
  if (!value) return '--';
  return value.toLocaleString('zh-CN', { hour12: false });
}

function fixText(value: string | null | undefined) {
  const text = String(value || '');
  if (!/[脙脗芒忙氓莽茅猫茂冒陇鑴欒剹鑺掑繖姘撹幗鑼呯尗鑼傚啋闄嘳]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded || text;
  } catch {
    return text;
  }
}

function deriveActivityLabel(score: number, fallback?: string | null) {
  const normalized = fixText(String(fallback || '').trim());
  if (normalized === 'Hot') return '火热';
  if (normalized === 'Active') return '活跃';
  if (normalized === 'Normal') return '一般';
  if (normalized === 'Low') return '低活跃';
  if (normalized === 'No data') return '无数据';
  if (score >= 80) return '火热';
  if (score >= 60) return '活跃';
  if (score >= 35) return '一般';
  if (score > 0) return '低活跃';
  return '无数据';
}

function resolveSyncStatusLabel(lastSyncedAt: Date | null) {
  if (!lastSyncedAt) {
    return {
      label: '尚未同步',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
      helper: '当前页面还没有拿到可用的 Rank 同步时间，建议先检查后台自动同步状态。',
    };
  }

  const diffHours = (Date.now() - lastSyncedAt.getTime()) / (1000 * 60 * 60);

  if (diffHours <= 6) {
    return {
      label: '自动同步正常',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      helper: '最近 6 小时内已经自动刷新，当前数据可以直接作为近期状态参考。',
    };
  }

  if (diffHours <= 24) {
    return {
      label: '数据轻微延迟',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
      helper: '最近 24 小时内仍有刷新，当前还处在正常自动更新窗口内。',
    };
  }

  return {
    label: '数据可能偏旧',
    tone: 'border-rose-200 bg-rose-50 text-rose-700',
    helper: '最近同步时间已经偏久，建议结合后台最近同步记录一起判断。',
  };
}

function ChampionPill({ championName }: { championName: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">
      <div className="h-8 w-8 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
        <ChampionImage
          name={championName}
          className="h-full w-full"
          fallbackContent={
            <div className="flex h-full w-full items-center justify-center text-xs font-black text-slate-300">
              {championName.slice(0, 1)}
            </div>
          }
        />
      </div>
      <span className="text-xs font-bold text-slate-200">{championName}</span>
    </div>
  );
}

export default function PlayerRankView({ data }: Props) {
  const activityLabel = deriveActivityLabel(data.summary.activityScore, data.summary.activityLabel);
  const syncStatus = resolveSyncStatusLabel(data.sync.lastSyncedAt);
  const recentActivityLabel = deriveActivityLabel(data.recentState.activityScore, data.recentState.activityLabel);

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-5 text-lg font-bold text-white">Rank 状态摘要</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">当前 Rank</div>
              <div className="mt-1 text-lg font-black text-slate-100">
                {fixText(data.summary.currentTier)}
                {data.summary.currentRank ? ` ${fixText(data.summary.currentRank)}` : ''}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">当前 LP</div>
              <div className="mt-1 text-lg font-black text-slate-100">{data.summary.leaguePoints ?? '--'}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">活跃度</div>
              <div className="mt-1 text-lg font-black text-amber-300">{activityLabel}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">近 7 天排位</div>
              <div className="mt-1 text-lg font-black text-slate-100">{data.summary.games7d} 局</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">近 14 天胜率</div>
              <div className="mt-1 text-lg font-black text-slate-100">{formatPercent(data.summary.winRate14d, 1)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">账号数</div>
              <div className="mt-1 text-lg font-black text-slate-100">{data.summary.accountCount}</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-5 text-lg font-bold text-white">当前展示账号</h3>
          {data.currentAccount ? (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div>
                <div className="text-lg font-black text-slate-100">{fixText(data.currentAccount.accountName)}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {fixText(data.currentAccount.platform)} / {fixText(data.currentAccount.regionGroup)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.currentAccount.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">
                    {fixText(tag)}
                  </span>
                ))}
              </div>
              <div className="text-sm text-slate-300">最近活跃：{fixText(data.currentAccount.lastGameLabel)}</div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
              当前还没有可展示的 Rank 账号。
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-5 text-lg font-bold text-white">同步与校验状态</h3>
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm text-slate-100">
            <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${syncStatus.tone}`}>
              {syncStatus.label}
            </div>
            <div className="mt-3 text-sm text-slate-300">{syncStatus.helper}</div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">最近同步</div>
              <div className="mt-1 text-sm font-bold text-slate-100">{formatDateTime(data.sync.lastSyncedAt)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">数据来源</div>
              <div className="mt-1 text-sm font-bold text-slate-100">{fixText(data.sync.sourceLabel)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">可信度</div>
              <div className="mt-1 text-sm font-bold text-slate-100">
                {fixText(data.sync.confidenceLabel)} ({data.sync.confidenceScore.toFixed(2)})
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <div className="text-xs font-bold text-slate-500">校验状态</div>
              <div className="mt-1 text-sm font-bold text-slate-100">{fixText(data.sync.verificationLabel)}</div>
            </div>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border border-cyan-900/60 bg-cyan-950/30 p-4 text-sm text-cyan-50">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-bold">数据新鲜度提示</div>
              <div className="mt-1 text-cyan-100">
                最近同步：{formatDateTime(data.sync.lastSyncedAt)}，最近活跃：
                {fixText(data.currentAccount?.lastGameLabel || '暂无近期对局')}。
              </div>
            </div>
            <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${syncStatus.tone}`}>
              {syncStatus.label}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-bold text-white">Rank 概览</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.overview.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-4">
                <div className="text-xs font-bold text-slate-500">{fixText(item.label)}</div>
                <div className="mt-2 text-lg font-black text-slate-100">{fixText(item.value)}</div>
                {item.subValue ? <div className="mt-1 text-xs text-slate-400">{fixText(item.subValue)}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-bold text-white">账号列表</h3>
          <div className="space-y-3">
            {data.accounts.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                当前还没有同步到可展示的 Rank 账号。
              </div>
            ) : (
              data.accounts.map((account) => (
                <div key={account.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-100">{fixText(account.accountName)}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {fixText(account.platform)} / {fixText(account.regionGroup)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {account.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-200">
                            {fixText(tag)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-right md:min-w-[280px]">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <div className="text-[11px] font-bold text-slate-500">当前 Rank</div>
                        <div className="mt-1 text-sm font-black text-slate-100">
                          {fixText(account.currentTier)}
                          {account.currentRank ? ` ${fixText(account.currentRank)}` : ''}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <div className="text-[11px] font-bold text-slate-500">LP</div>
                        <div className="mt-1 text-sm font-black text-slate-100">{account.leaguePoints ?? '--'}</div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <div className="text-[11px] font-bold text-slate-500">近 7 天</div>
                        <div className="mt-1 text-sm font-black text-slate-100">{account.games7d} 局</div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <div className="text-[11px] font-bold text-slate-500">近 14 天胜率</div>
                        <div className="mt-1 text-sm font-black text-slate-100">{formatPercent(account.winRate14d, 1)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <span>最近活跃：{fixText(account.lastGameLabel)}</span>
                    <span>来源：{fixText(account.source || '--')} / 可信度：{account.confidence.toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-bold text-white">最近状态</h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-bold text-slate-300">主玩英雄 Top3</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.recentState.topChampions.length > 0 ? (
                  data.recentState.topChampions.map((item) => (
                    <ChampionPill key={item.championName} championName={fixText(item.championName)} />
                  ))
                ) : (
                  <span className="text-sm text-slate-500">暂无英雄数据</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-bold text-slate-300">活跃度与位置</div>
              <div className="mt-3 text-lg font-black text-amber-300">{recentActivityLabel}</div>
              <div className="mt-1 text-sm text-slate-400">活跃度分：{data.recentState.activityScore.toFixed(1)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.recentState.topPositions.length > 0 ? (
                  data.recentState.topPositions.map((item) => (
                    <span key={item.position} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-200">
                      {fixText(item.position)} {item.games}局
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">暂无位置分布</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-bold text-slate-300">趋势</div>
              <div className="mt-3 text-lg font-black text-sky-300">{fixText(data.recentState.trendLabel)}</div>
              <div className="mt-1 text-sm text-slate-400">趋势分：{data.recentState.trendScore.toFixed(1)}</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-bold text-white">趋势</h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-bold text-slate-300">最近 LP 轨迹</div>
              <div className="mt-4 flex items-end gap-3 overflow-x-auto pb-1">
                {data.trends.lpPoints.length > 0 ? (
                  data.trends.lpPoints.map((point) => (
                    <div key={`${point.label}-${point.value}`} className="flex min-w-[56px] flex-col items-center gap-2">
                      <div
                        className="w-8 rounded-t-md bg-cyan-400/80"
                        style={{ height: `${Math.max(18, Math.min(120, point.value / 8 || 18))}px` }}
                      />
                      <div className="text-[11px] text-slate-400">{fixText(point.label)}</div>
                      <div className="text-xs font-bold text-slate-200">{point.value}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">当前没有可视化趋势数据。</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs font-bold text-slate-500">近 7 天排位</div>
                <div className="mt-2 text-xl font-black text-slate-100">{data.trends.games7d} 局</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs font-bold text-slate-500">近 14 天排位</div>
                <div className="mt-2 text-xl font-black text-slate-100">{data.trends.games14d} 局</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs font-bold text-slate-500">近 14 天胜率</div>
                <div className="mt-2 text-xl font-black text-slate-100">{formatPercent(data.trends.winRate14d, 1)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-bold text-white">数据说明</h3>
          <div className="space-y-3 text-sm text-slate-300">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">来源：{fixText(data.meta.sourceLabel)}</div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">可信度：{fixText(data.meta.confidenceLabel)}</div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              最近校验：{formatDateTime(data.meta.lastVerifiedAt)}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
              <ul className="space-y-2">
                {data.meta.notes.length > 0 ? (
                  data.meta.notes.map((note, index) => <li key={`${index}-${note}`}>- {fixText(note)}</li>)
                ) : (
                  <li>- 当前没有额外的数据说明。</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
