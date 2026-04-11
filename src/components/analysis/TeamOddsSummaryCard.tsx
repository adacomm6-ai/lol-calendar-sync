import type { TeamOddsSummary, TeamMetricSummary } from '@/lib/odds-history';
import { formatSignedNumber, formatWinRate, getStatusFromResultValue } from '@/lib/odds-history';
import { getTeamShortDisplayName as getShortTeamLabel } from '@/lib/team-display';

interface TeamOddsSummaryCardProps {
    summary: TeamOddsSummary;
    compact?: boolean;
    subtitle?: string;
}

function getProfitTone(value: number): string {
    if (value > 0) return 'text-rose-300';
    if (value < 0) return 'text-emerald-300';
    return 'text-amber-300';
}

function CounterPill({ counter, compact = false }: { counter: { WIN: number; LOSE: number }; compact?: boolean }) {
    return (
        <div
            className={`inline-flex items-center rounded-full border border-white/10 bg-slate-950/85 font-black leading-none ${compact ? 'gap-1 px-1.5 py-0.5 text-[9px]' : 'gap-1.5 px-2.5 py-1 text-[11px]'}`}
        >
            <span className="text-rose-300">赢{counter.WIN}</span>
            <span className="text-slate-600">/</span>
            <span className="text-emerald-300">输{counter.LOSE}</span>
        </div>
    );
}

function OverviewCard({
    label,
    value,
    counter,
    compact = false,
    tone = 'neutral',
    align = 'left',
}: {
    label: string;
    value: string;
    counter?: { WIN: number; LOSE: number };
    compact?: boolean;
    tone?: 'neutral' | 'profit';
    align?: 'left' | 'center';
}) {
    const valueClass = `font-black leading-none ${compact ? 'text-[18px]' : 'text-[20px]'} ${tone === 'profit' ? getProfitTone(Number(value)) : 'text-white'}`;
    const alignClass = align === 'center' ? 'text-center' : '';

    return (
        <div className={`rounded-xl border border-white/10 bg-slate-900/70 ${compact ? 'p-3' : 'rounded-2xl p-3.5'} ${alignClass}`}>
            <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-slate-400`}>{label}</div>
            {counter ? (
                <div className={`mt-2 flex items-end justify-between ${compact ? 'gap-2' : 'gap-3'}`}>
                    <CounterPill counter={counter} compact={compact} />
                    <div className={valueClass}>{value}</div>
                </div>
            ) : (
                <div className={`mt-2 ${valueClass}`}>{value}</div>
            )}
        </div>
    );
}

function RecentBadge({ value, label, compact = false }: { value: number; label: string; compact?: boolean }) {
    const status = getStatusFromResultValue(value);
    const tone =
        status === 'WIN'
            ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
            : status === 'LOSE'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : status === 'PUSH'
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                : 'border-white/10 bg-slate-900/70 text-slate-400';

    if (compact) {
        return (
            <div
                className={`flex items-center justify-between gap-2 overflow-hidden rounded-lg border px-2 py-1.5 ${tone}`}
                title={`${label} ${formatSignedNumber(value)}`}
            >
                <div className="min-w-0 truncate text-[9px] font-black leading-none">{getShortTeamLabel({ name: label })}</div>
                <div className="shrink-0 text-[10px] font-black leading-none">{formatSignedNumber(value)}</div>
            </div>
        );
    }

    return (
        <div className={`rounded-xl border ${tone} px-2.5 py-2`} title={`${label} ${formatSignedNumber(value)}`}>
            <div className="truncate text-[11px] font-black leading-none">{getShortTeamLabel({ name: label })}</div>
            <div className="mt-1.5 text-[13px] font-black leading-none">{formatSignedNumber(value)}</div>
        </div>
    );
}

function getCompactMetricLabel(metric: TeamMetricSummary): string {
    switch (metric.key) {
        case 'killsAll':
            return '总人头';
        case 'timeAll':
            return '总时间';
        case 'winner':
            return '胜负盘';
        case 'handicap':
            return '让分盘';
        default:
            return metric.label;
    }
}

function CompactMetricTile({ metric, centerContent = false }: { metric: TeamMetricSummary; centerContent?: boolean }) {
    return (
        <div className="rounded-xl border border-white/8 bg-slate-900/50 p-3">
            {centerContent ? (
                <>
                    <div className="flex flex-col items-center text-center">
                        <div className="whitespace-nowrap text-[11px] font-black leading-none text-white">{getCompactMetricLabel(metric)}</div>
                        <div className={`mt-1.5 text-[18px] font-black leading-none ${getProfitTone(metric.total)}`}>{formatSignedNumber(metric.total)}</div>
                        <div className="mt-2 flex items-center justify-center gap-1.5">
                            <CounterPill counter={metric.counter} compact />
                            <div className="text-[14px] font-black text-white">{formatWinRate(metric.winRate)}</div>
                        </div>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                        {metric.recentMatches.length === 0 ? (
                            <div className="w-full rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-[11px] text-slate-500">近3场暂无数据</div>
                        ) : (
                            metric.recentMatches.map((recent) => (
                                <RecentBadge key={`${metric.key}-${recent.matchId}`} value={recent.total} label={recent.opponentName} compact />
                            ))
                        )}
                    </div>
                </>
            ) : (
                <>
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="whitespace-nowrap text-[11px] font-black leading-none text-white">{getCompactMetricLabel(metric)}</div>
                            <div className={`mt-1.5 text-[18px] font-black leading-none ${getProfitTone(metric.total)}`}>
                                {formatSignedNumber(metric.total)}
                            </div>
                        </div>
                        <div className="shrink-0 text-right">
                            <div className="text-[9px] text-slate-500">胜率</div>
                            <div className="mt-1 flex items-center justify-end gap-1.5">
                                <CounterPill counter={metric.counter} compact />
                                <div className="text-[14px] font-black text-white">{formatWinRate(metric.winRate)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-1.5">
                        {metric.recentMatches.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-[11px] text-slate-500">近3场暂无数据</div>
                        ) : (
                            metric.recentMatches.map((recent) => (
                                <RecentBadge key={`${metric.key}-${recent.matchId}`} value={recent.total} label={recent.opponentName} compact />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function FullMetricTile({
    metric,
    centerContent = false,
    inwardAlign = null,
    centerBody = false,
}: {
    metric: TeamMetricSummary;
    centerContent?: boolean;
    inwardAlign?: 'left' | 'right' | null;
    centerBody?: boolean;
}) {
    const isInward = !centerContent && inwardAlign !== null;
    const useCenteredBody = !centerContent && centerBody && !isInward;

    return (
        <div className="rounded-2xl border border-white/8 bg-slate-900/50 p-3.5">
            {centerContent ? (
                <>
                    <div className="flex flex-col items-center text-center">
                        <div className="text-xs font-black text-white">{metric.label}</div>
                        <div className={`mt-2 text-[20px] font-black leading-none ${getProfitTone(metric.total)}`}>{formatSignedNumber(metric.total)}</div>
                        <div className="mt-2 flex items-center justify-center gap-2">
                            <CounterPill counter={metric.counter} />
                            <div className="text-[16px] font-black text-white">{formatWinRate(metric.winRate)}</div>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-start justify-center gap-2">
                        {metric.recentMatches.length === 0 ? (
                            <div className="w-full rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-[11px] text-slate-500">近3场暂无数据</div>
                        ) : (
                            metric.recentMatches.map((recent) => (
                                <RecentBadge key={`${metric.key}-${recent.matchId}`} value={recent.total} label={recent.opponentName} />
                            ))
                        )}
                    </div>
                </>
            ) : (
                <>
                    <div
                        className={`flex items-start ${isInward ? (inwardAlign === 'left' ? 'justify-end gap-6' : 'justify-start gap-6') : 'justify-between gap-4'}`}
                    >
                        <div
                            className={
                                isInward
                                    ? `min-w-[170px] ${inwardAlign === 'left' ? 'text-right' : 'text-left'}`
                                    : useCenteredBody
                                      ? 'min-w-0 flex-1 text-center'
                                      : 'min-w-0 flex-1'
                            }
                        >
                            <div className="text-xs font-black text-white">{metric.label}</div>
                            <div className={`mt-2 text-[20px] font-black leading-none ${getProfitTone(metric.total)}`}>
                                {formatSignedNumber(metric.total)}
                            </div>
                        </div>
                        <div className={isInward ? (inwardAlign === 'left' ? 'text-right' : 'text-left') : 'shrink-0 text-right'}>
                            <div className="text-[11px] text-slate-500">胜率</div>
                            <div
                                className={`mt-1 flex items-center ${isInward ? (inwardAlign === 'left' ? 'justify-end' : 'justify-start') : 'justify-end'} gap-2`}
                            >
                                <CounterPill counter={metric.counter} />
                                <div className="text-[16px] font-black text-white">{formatWinRate(metric.winRate)}</div>
                            </div>
                        </div>
                    </div>

                    <div
                        className={`mt-3 flex flex-wrap items-start gap-2 ${isInward ? (inwardAlign === 'left' ? 'justify-end' : 'justify-start') : useCenteredBody ? 'justify-center' : ''}`}
                    >
                        {metric.recentMatches.length === 0 ? (
                            <div className="w-full rounded-xl border border-dashed border-white/10 px-3 py-3 text-[11px] text-slate-500">近3场暂无数据</div>
                        ) : (
                            metric.recentMatches.map((recent) => (
                                <RecentBadge key={`${metric.key}-${recent.matchId}`} value={recent.total} label={recent.opponentName} />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function MetricGroup({
    title,
    titleTone,
    metrics,
    compact = false,
}: {
    title: string;
    titleTone: string;
    metrics: Array<TeamMetricSummary>;
    compact?: boolean;
}) {
    const shouldHighlightTotalRow = metrics.length === 3;
    const gridColsClass = compact
        ? 'sm:grid-cols-2'
        : shouldHighlightTotalRow
          ? 'md:grid-cols-2'
          : metrics.length === 2
            ? 'xl:grid-cols-2'
            : 'md:grid-cols-3';

    return (
        <div>
            <div className={`px-1 text-[10px] font-black uppercase tracking-[0.18em] ${titleTone}`}>{title}</div>
            <div className={`mt-1.5 grid grid-cols-1 ${compact ? 'gap-2' : 'gap-3'} ${gridColsClass}`}>
                {metrics.map((metric, index) => {
                    const centerContent = shouldHighlightTotalRow && index === 0;
                    const spanClass = centerContent ? (compact ? 'sm:col-span-2' : 'md:col-span-2') : '';
                    const inwardAlign = !compact && shouldHighlightTotalRow && index > 0 ? (index === 1 ? 'left' : 'right') : null;
                    const centerBody = !compact && metrics.length === 2;
                    return (
                        <div key={metric.key} className={spanClass}>
                            {compact ? (
                                <CompactMetricTile metric={metric} centerContent={centerContent} />
                            ) : (
                                <FullMetricTile metric={metric} centerContent={centerContent} inwardAlign={inwardAlign} centerBody={centerBody} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function TeamOddsSummaryCard({ summary, compact = false, subtitle }: TeamOddsSummaryCardProps) {
    const summaryName = getShortTeamLabel({ name: summary.teamName });

    if (compact) {
        return (
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-base font-black tracking-tight text-white">{summaryName}</div>
                        <div className="mt-1 text-[11px] text-slate-400">{subtitle || '当前队伍历史盘口结果'}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                        <div>盘口 {summary.totalRecords}</div>
                        <div className="mt-1">大场 {summary.matchCount}</div>
                    </div>
                </div>

                <div className="mt-2.5">
                    <OverviewCard label="总输赢" value={formatSignedNumber(summary.overallTotal)} tone="profit" compact />
                </div>

                <div className="mt-2.5 space-y-2.5">
                    <MetricGroup title="基础盘口" titleTone="text-slate-500" metrics={[summary.metrics.winner, summary.metrics.handicap]} compact />
                    <MetricGroup title="人头盘口组（总盘 + 大小）" titleTone="text-cyan-300" metrics={[summary.metrics.killsAll, summary.metrics.killsOver, summary.metrics.killsUnder]} compact />
                    <MetricGroup title="时间盘口组（总盘 + 大小）" titleTone="text-emerald-300" metrics={[summary.metrics.timeAll, summary.metrics.timeOver, summary.metrics.timeUnder]} compact />
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-lg font-black tracking-tight text-white">{summaryName}</div>
                    <div className="mt-1 text-xs text-slate-400">{subtitle || '单队盘口统计：总输赢、胜率、最近 3 个大场结果。'}</div>
                </div>
                <div className="text-right text-xs text-slate-400">
                    <div>记录盘口: {summary.totalRecords}</div>
                    <div className="mt-1">涉及大场: {summary.matchCount}</div>
                </div>
            </div>

            <div className="mt-4">
                <OverviewCard label="总输赢" value={formatSignedNumber(summary.overallTotal)} tone="profit" align="center" />
            </div>

            <div className="mt-4 space-y-3">
                <MetricGroup title="基础盘口" titleTone="text-slate-500" metrics={[summary.metrics.winner, summary.metrics.handicap]} />
                <MetricGroup title="人头盘口组（总盘 + 大小）" titleTone="text-cyan-300" metrics={[summary.metrics.killsAll, summary.metrics.killsOver, summary.metrics.killsUnder]} />
                <MetricGroup title="时间盘口组（总盘 + 大小）" titleTone="text-emerald-300" metrics={[summary.metrics.timeAll, summary.metrics.timeOver, summary.metrics.timeUnder]} />
            </div>
        </div>
    );
}
