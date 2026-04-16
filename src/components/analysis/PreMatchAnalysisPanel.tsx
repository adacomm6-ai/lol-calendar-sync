import Link from 'next/link';

import ChampionImage from '@/components/ChampionImage';
import TeamLogo from '@/components/TeamLogo';
import { useState } from 'react';

export type PreMatchAnalysisTeamInfo = {
    id: string | null;
    name: string;
    shortName: string;
    logo: string | null;
    region: string | null;
};

export type PreMatchAnalysisRecentSummary = {
    seriesWins: number;
    seriesCount: number;
    gameWins: number;
    gameLosses: number;
    recent5: string[];
    avgDurationLabel: string;
    avgKills: number | null;
    avgDeaths: number | null;
    avgKillDiff: number | null;
    avgKdRatio: number | null;
};

export type PreMatchAnalysisHeadToHeadEntry = {
    id: string;
    startTime: string | null;
    tournament: string;
    stage: string;
    scoreA: number | null;
    scoreB: number | null;
    winnerSide: 'A' | 'B' | 'NONE';
    hasResult: boolean;
    statusLabel: string | null;
    teamAKills: number | null;
    teamBKills: number | null;
    totalKills: number | null;
    avgDurationLabel: string;
    games: Array<{
        gameNumber: number;
        winnerSide: 'A' | 'B' | 'NONE';
        mapSideWin: 'BLUE' | 'RED' | 'NONE';
        teamASide: 'BLUE' | 'RED' | 'NONE';
        teamBSide: 'BLUE' | 'RED' | 'NONE';
        teamAKills: number | null;
        teamBKills: number | null;
        teamATenMinKills: number | null;
        teamBTenMinKills: number | null;
        totalKills: number | null;
        durationLabel: string;
    }>;
};

export type PreMatchAnalysisPlayerCard = {
    playerId: string | null;
    name: string;
    role: string;
    overallScore: number | null;
    relativeScore: number | null;
    confidence: number | null;
    laneScore: number | null;
    stateScore: number | null;
    masteryScore: number | null;
    trendScore: number | null;
    sampleGames: number | null;
    winRate: number | null;
    recentWinRate: number | null;
    kda: number | null;
    avgKills: number | null;
    avgDeaths: number | null;
    avgAssists: number | null;
    damagePerMin: number | null;
    killParticipationPct: number | null;
    goldDiffAt15: number | null;
    csDiffAt15: number | null;
    xpDiffAt15: number | null;
    evaluationLabel: string | null;
    rankText: string | null;
    leaguePoints: number | null;
    activityLabel: string | null;
    activityScore: number | null;
    topChampions: string[];
    recentRecordText: string | null;
    sourceLabel: string | null;
    sourceDetail: string | null;
};

export type PreMatchAnalysisMatchup = {
    role: string;
    teamAPlayer: PreMatchAnalysisPlayerCard | null;
    teamBPlayer: PreMatchAnalysisPlayerCard | null;
    teamAPlayers: PreMatchAnalysisPlayerCard[];
    teamBPlayers: PreMatchAnalysisPlayerCard[];
    edgeText: string;
    edgeValue: number | null;
    edgeMetricLabel: string | null;
};

export type PreMatchAnalysisRankSummary = {
    coveredPlayers: number;
    rankedPlayers: number;
    avgActivity: number | null;
    maxLp: number | null;
    highActivityPlayers: number;
    lastSyncedAt: string | null;
    topChampions: string[];
};

export type PreMatchAnalysisTrendPoint = {
    matchId: string;
    startTime: string | null;
    opponent: string;
    result: 'W' | 'L' | '-';
    scoreLabel: string;
    durationLabel: string;
    kills: number | null;
    deaths: number | null;
    kdRatio: number | null;
};

export type PreMatchAnalysisBpGame = {
    gameNumber: number;
    sideLabel: string;
    teamAChampions: string[];
    teamBChampions: string[];
};

export type PreMatchAnalysisData = {
    teamA: PreMatchAnalysisTeamInfo;
    teamB: PreMatchAnalysisTeamInfo;
    summary: {
        leanLabel: string;
        leanTeam: 'A' | 'B' | 'EVEN';
        riskLabel: string;
        headToHeadText: string;
        rankEdgeText: string;
        recentEdgeText: string;
        bpStatusText: string;
        focusText: string;
    };
    recent: {
        teamA: PreMatchAnalysisRecentSummary;
        teamB: PreMatchAnalysisRecentSummary;
        headToHead: PreMatchAnalysisHeadToHeadEntry[];
        teamATrends: PreMatchAnalysisTrendPoint[];
        teamBTrends: PreMatchAnalysisTrendPoint[];
    };
    matchups: PreMatchAnalysisMatchup[];
    rank: {
        teamA: PreMatchAnalysisRankSummary;
        teamB: PreMatchAnalysisRankSummary;
    };
    bp: {
        ready: boolean;
        sourceMatchId: string | null;
        note: string;
        totalGames: number;
        teamAHighlights: string[];
        teamBHighlights: string[];
        games: PreMatchAnalysisBpGame[];
    };
};

type Props = {
    data: PreMatchAnalysisData;
};

function formatPercentFromRatio(numerator: number, denominator: number) {
    if (denominator <= 0) return '--';
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatMetric(value: number | null, digits = 1) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    return Number(value).toFixed(digits);
}

function formatPercent(value: number | null, digits = 1) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    return `${Number(value).toFixed(digits)}%`;
}

function formatSignedMetric(value: number | null, digits = 1) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    const fixed = Number(value).toFixed(digits);
    return Number(value) > 0 ? `+${fixed}` : fixed;
}

function formatDateLabel(value: string | null) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function buildLeanTone(leanTeam: 'A' | 'B' | 'EVEN') {
    if (leanTeam === 'A') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
    if (leanTeam === 'B') return 'border-rose-400/30 bg-rose-500/10 text-rose-100';
    return 'border-slate-400/20 bg-white/5 text-slate-100';
}

function buildRiskTone(riskLabel: string) {
    if (riskLabel.startsWith('低')) return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
    if (riskLabel.startsWith('中')) return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    return 'border-rose-400/30 bg-rose-500/10 text-rose-100';
}

function buildResultTone(value: string) {
    if (value === 'W') return 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100';
    if (value === 'L') return 'border-rose-400/35 bg-rose-500/15 text-rose-100';
    return 'border-white/10 bg-white/5 text-slate-300';
}

function buildTrendTone(value: 'W' | 'L' | '-') {
    if (value === 'W') return 'border-emerald-400/20 bg-emerald-500/10';
    if (value === 'L') return 'border-rose-400/20 bg-rose-500/10';
    return 'border-white/10 bg-white/5';
}

function ChampionThumb({
    champion,
    side,
    compact = false,
}: {
    champion: string;
    side: 'A' | 'B';
    compact?: boolean;
}) {
    const tone = side === 'A'
        ? 'border-cyan-500/25 bg-cyan-500/10'
        : 'border-rose-500/25 bg-rose-500/10';

    const imageFrame = compact ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl';

    return (
        <div
            title={champion}
            className={`inline-flex items-center justify-center rounded-xl border p-1 shadow-[0_10px_24px_rgba(2,6,23,0.22)] transition-transform hover:-translate-y-0.5 ${tone}`}
        >
            <div className={`overflow-hidden border border-white/10 bg-slate-950/80 ${imageFrame}`}>
                <ChampionImage
                    name={champion}
                    className="h-full w-full"
                    fallbackContent={
                        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs font-black text-slate-200">
                            {champion.slice(0, 1)}
                        </div>
                    }
                />
            </div>
        </div>
    );
}

function ChampionThumbStrip({
    champions,
    side,
    compact = false,
    emptyText = '暂无英雄数据',
}: {
    champions: string[];
    side: 'A' | 'B';
    compact?: boolean;
    emptyText?: string;
}) {
    if (champions.length === 0) {
        return <span className="text-xs text-slate-400">{emptyText}</span>;
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {champions.map((champion, index) => (
                <ChampionThumb key={`${side}-${champion}-${index}`} champion={champion} side={side} compact={compact} />
            ))}
        </div>
    );
}

function buildTeamFrameTone(side: 'A' | 'B') {
    return side === 'A'
        ? 'border-cyan-400/18 bg-[linear-gradient(180deg,rgba(6,30,46,0.62),rgba(2,6,23,0.58))] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]'
        : 'border-rose-400/18 bg-[linear-gradient(180deg,rgba(49,12,30,0.58),rgba(2,6,23,0.58))] shadow-[inset_0_0_0_1px_rgba(251,113,133,0.08)]';
}

function buildTeamAccentTone(side: 'A' | 'B') {
    return side === 'A'
        ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
        : 'border-rose-400/25 bg-rose-500/10 text-rose-100';
}

function buildWinnerBadgeTone() {
    return 'border-yellow-300/80 bg-[linear-gradient(180deg,#fde68a,#f59e0b)] text-slate-950 shadow-[0_6px_18px_rgba(245,158,11,0.35)]';
}

function buildMapSideWinTone(side: 'BLUE' | 'RED' | 'NONE') {
    if (side === 'BLUE') return 'border-[#5b8cff]/55 bg-[#1d3f88]/78 text-[#dbeafe]';
    if (side === 'RED') return 'border-[#ff6b8a]/55 bg-[#6f203b]/78 text-[#ffe4ec]';
    return 'border-white/10 bg-white/5 text-slate-300';
}

function buildGameTabTone(side: 'BLUE' | 'RED' | 'NONE', active: boolean) {
    if (side === 'BLUE') {
        return active
            ? 'border-[#77a5ff] bg-[#2957b8] text-white shadow-[0_0_0_1px_rgba(147,197,253,0.18)]'
            : 'border-[#355ea8] bg-[#19396f] text-[#dbeafe] hover:bg-[#214887]';
    }
    if (side === 'RED') {
        return active
            ? 'border-[#ff7d99] bg-[#b23b5f] text-white shadow-[0_0_0_1px_rgba(253,164,175,0.18)]'
            : 'border-[#8b3650] bg-[#5d2035] text-[#ffe4ec] hover:bg-[#743049]';
    }
    return active
        ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100'
        : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10';
}

function buildSideStatCardTone(side: 'BLUE' | 'RED' | 'NONE') {
    if (side === 'BLUE') return 'border-[#315ca8]/55 bg-[#122a52]/72';
    if (side === 'RED') return 'border-[#8c3851]/55 bg-[#4b162b]/72';
    return 'border-white/8 bg-slate-950/45';
}

function buildMatchupEdge(
    teamAPlayer: PreMatchAnalysisPlayerCard | null,
    teamBPlayer: PreMatchAnalysisPlayerCard | null,
    teamAShortName: string,
    teamBShortName: string,
) {
    const normalizeComparisonScore = (player: PreMatchAnalysisPlayerCard | null) => {
        if (!player) return null;
        if (player.overallScore !== null && player.overallScore !== undefined) return { value: player.overallScore, label: '总分' };
        if (player.relativeScore !== null && player.relativeScore !== undefined) return { value: player.relativeScore, label: '赛区分' };
        if (player.laneScore !== null && player.laneScore !== undefined) return { value: player.laneScore, label: '对线评分' };
        if (player.stateScore !== null && player.stateScore !== undefined) return { value: player.stateScore, label: '状态分' };
        return null;
    };

    const leftScore = normalizeComparisonScore(teamAPlayer);
    const rightScore = normalizeComparisonScore(teamBPlayer);

    if (leftScore === null || rightScore === null) {
        return { edgeText: '快照不完整，暂不做综合优劣', edgeValue: null, edgeMetricLabel: null };
    }
    if (leftScore.label !== rightScore.label) {
        return { edgeText: '评分字段不一致，先看下方原始指标', edgeValue: null, edgeMetricLabel: null };
    }

    const diff = leftScore.value - rightScore.value;
    if (Math.abs(diff) < 3) return { edgeText: '双方接近，属于五五开对位', edgeValue: diff, edgeMetricLabel: leftScore.label };
    if (diff > 0) return { edgeText: `${teamAShortName} 位置占优，+${diff.toFixed(1)}`, edgeValue: diff, edgeMetricLabel: leftScore.label };
    return { edgeText: `${teamBShortName} 位置占优，+${Math.abs(diff).toFixed(1)}`, edgeValue: diff, edgeMetricLabel: leftScore.label };
}

function SummaryMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
            <div className="mt-1 text-sm font-black text-white">{value}</div>
            <div className="mt-0.5 text-[10px] leading-4 text-slate-400">{helper}</div>
        </div>
    );
}

function CenterInsightCard({ data }: { data: PreMatchAnalysisData }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(15,23,42,0.75))] p-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${buildLeanTone(data.summary.leanTeam)}`}>{data.summary.leanLabel}</span>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${buildRiskTone(data.summary.riskLabel)}`}>风险：{data.summary.riskLabel}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryMetric label="关键焦点" value={data.summary.focusText} helper="优先关注这组对位。" />
                <SummaryMetric label="近期状态" value={data.summary.recentEdgeText} helper="按最近 10 个系列赛聚合。" />
                <SummaryMetric label="历史交手" value={data.summary.headToHeadText} helper="默认展示最近 5 次直接交手。" />
                <SummaryMetric label="Rank 热度" value={data.summary.rankEdgeText} helper="按当前核心位置活跃度与 LP 汇总。" />
            </div>
        </div>
    );
}

function CollapsibleSection({
    id,
    title,
    subtitle,
    summary,
    children,
    defaultOpen = false,
}: {
    id?: string;
    title: string;
    subtitle?: string;
    summary: string;
    children: any;
    defaultOpen?: boolean;
}) {
    return (
        <div id={id} className="rounded-2xl border border-white/10 bg-slate-950/45">
            <div className="flex items-center justify-between gap-3 px-3 py-3">
                <div>
                    {subtitle ? <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{subtitle}</div> : null}
                    <div className="mt-1 text-base font-black text-white">{title}</div>
                </div>
                <div className="hidden max-w-[360px] text-right text-[11px] text-slate-400 md:block">{summary}</div>
            </div>
            <div className="border-t border-white/8 px-3 py-3">{children}</div>
        </div>
    );
}

function TeamOverviewCard({
    team,
    summary,
    side,
}: {
    team: PreMatchAnalysisTeamInfo;
    summary: PreMatchAnalysisRecentSummary;
    side: 'A' | 'B';
}) {
    return (
        <div className={`rounded-2xl border p-3 ${buildTeamFrameTone(side)}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-white/5 ${side === 'A' ? 'border-cyan-400/18' : 'border-rose-400/18'}`}>
                        <TeamLogo src={team.logo} name={team.shortName} region={team.region || undefined} size={24} className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">近期状态</div>
                        <div className="mt-0.5 text-[11px] font-bold text-slate-300">{side === 'A' ? '左侧阵营' : '右侧阵营'}</div>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                    {summary.recent5.length > 0 ? (
                        summary.recent5.map((item, index) => (
                            <span
                                key={`${team.shortName}-${index}-${item}`}
                                className={`inline-flex min-w-6 justify-center rounded-full border px-2 py-0.5 text-[10px] font-black ${buildResultTone(item)}`}
                            >
                                {item}
                            </span>
                        ))
                    ) : (
                        <span className="text-xs text-slate-400">暂无最近战绩</span>
                    )}
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-5">
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">近 10 场胜率</div>
                    <div className="mt-1 text-sm font-black text-white">{formatPercentFromRatio(summary.seriesWins, summary.seriesCount)}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">小场战绩</div>
                    <div className="mt-1 text-sm font-black text-white">{summary.gameWins} - {summary.gameLosses}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">场均击杀</div>
                    <div className="mt-1 text-sm font-black text-white">{formatMetric(summary.avgKills)}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">K/D 比</div>
                    <div className="mt-1 text-sm font-black text-white">{formatMetric(summary.avgKdRatio, 2)}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">场均时长</div>
                    <div className="mt-1 text-sm font-black text-white">{summary.avgDurationLabel}</div>
                </div>
            </div>

            <div className="mt-2 rounded-xl border border-white/8 bg-slate-900/30 px-2.5 py-2 text-[11px] text-slate-300">
                净击杀
                <span className="ml-2 text-sm font-black text-white">
                    {summary.avgKillDiff === null ? '--' : `${summary.avgKillDiff > 0 ? '+' : ''}${summary.avgKillDiff.toFixed(1)}`}
                </span>
            </div>
        </div>
    );
}

function PlayerCard({
    player,
    side,
    align = 'left',
}: {
    player: PreMatchAnalysisPlayerCard | null;
    side: 'A' | 'B';
    align?: 'left' | 'right';
}) {
    if (!player) {
        return <div className={`rounded-xl border border-dashed px-3 py-3 text-xs text-slate-400 ${side === 'A' ? 'border-cyan-400/16 bg-cyan-500/[0.03]' : 'border-rose-400/16 bg-rose-500/[0.03]'}`}>暂无该位置可用数据</div>;
    }

    const hasPreciseSnapshot =
        player.overallScore !== null ||
        player.relativeScore !== null ||
        player.laneScore !== null ||
        player.stateScore !== null ||
        player.masteryScore !== null ||
        player.trendScore !== null;
    const rankMetricValue = player.rankText
        ? player.leaguePoints !== null && player.leaguePoints !== undefined
            ? `${player.rankText} ${player.leaguePoints}LP`
            : player.rankText
        : '--';
    const metricCards = hasPreciseSnapshot
        ? [
              { label: 'Rank', value: rankMetricValue },
              { label: '总分', value: formatMetric(player.overallScore) },
              { label: '赛区分', value: formatMetric(player.relativeScore) },
              { label: '对线评分', value: formatMetric(player.laneScore) },
              { label: '状态分', value: formatMetric(player.stateScore) },
              { label: '样本局数', value: player.sampleGames ?? '--' },
              { label: 'KDA', value: formatMetric(player.kda, 2) },
          ]
        : [
              { label: 'Rank', value: rankMetricValue },
              { label: '近场胜率', value: formatPercent(player.recentWinRate) },
              { label: '近期战绩', value: player.recentRecordText || '--' },
              { label: '样本局数', value: player.sampleGames ?? '--' },
              { label: 'KDA', value: formatMetric(player.kda, 2) },
              { label: '场均击杀', value: formatMetric(player.avgKills) },
              { label: '场均助攻', value: formatMetric(player.avgAssists) },
          ];

    const content = (
        <>
            <div className={`flex flex-wrap gap-1.5 text-[11px] ${align === 'right' ? 'justify-start xl:justify-end' : 'justify-start'}`}>
                {metricCards.map((item) => (
                    <span key={`${player.playerId || player.name}-${item.label}`} className="inline-flex rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1 font-bold text-slate-100">
                        <span className="mr-1.5 text-slate-500">{item.label}</span>
                        {item.value}
                    </span>
                ))}
            </div>

            <div className={`mt-2 flex flex-wrap gap-1.5 text-[11px] ${align === 'right' ? 'justify-start xl:justify-end' : 'justify-start'}`}>
                {hasPreciseSnapshot ? (
                    [
                        { label: '熟练度', value: formatMetric(player.masteryScore) },
                        { label: '趋势', value: formatMetric(player.trendScore) },
                        { label: '可信', value: formatMetric(player.confidence) },
                        { label: 'DPM', value: formatMetric(player.damagePerMin, 0) },
                        { label: '参团率', value: formatPercent(player.killParticipationPct) },
                        { label: '15分经济差', value: formatSignedMetric(player.goldDiffAt15) },
                        { label: '15分补刀差', value: formatSignedMetric(player.csDiffAt15, 2) },
                        { label: '15分经验差', value: formatSignedMetric(player.xpDiffAt15) },
                    ].map((item) => (
                        <span key={`${player.playerId || player.name}-extra-${item.label}`} className="inline-flex rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1 font-bold text-slate-300">
                            <span className="mr-1.5 text-slate-500">{item.label}</span>
                            {item.value}
                        </span>
                    ))
                ) : (
                    [
                        { label: '场均死亡', value: formatMetric(player.avgDeaths) },
                        { label: 'DPM', value: formatMetric(player.damagePerMin, 0) },
                        { label: '参团率', value: formatPercent(player.killParticipationPct) },
                    ].map((item) => (
                        <span key={`${player.playerId || player.name}-extra-${item.label}`} className="inline-flex rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1 font-bold text-slate-300">
                            <span className="mr-1.5 text-slate-500">{item.label}</span>
                            {item.value}
                        </span>
                    ))
                )}
            </div>

            <div className={`mt-2 flex flex-wrap gap-1.5 ${align === 'right' ? 'justify-start xl:justify-end' : 'justify-start'}`}>
                {player.sourceLabel ? (
                    <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-100">
                        {player.sourceLabel}
                    </span>
                ) : null}
                {(player.topChampions || []).slice(0, 3).map((champion) => (
                    <span key={`${player.playerId || player.name}-${champion}`} className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-100">
                        {champion}
                    </span>
                ))}
                {player.evaluationLabel ? (
                    <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                        {player.evaluationLabel}
                    </span>
                ) : null}
            </div>
        </>
    );

    if (!player.playerId) {
        return <div className={`rounded-xl border px-3 py-3 ${buildTeamFrameTone(side)}`}>{content}</div>;
    }

    return (
        <Link
            href={`/players/${player.playerId}`}
            className={`block rounded-xl border px-3 py-3 transition-all hover:-translate-y-0.5 hover:bg-slate-900/80 ${buildTeamFrameTone(side)} ${side === 'A' ? 'hover:border-cyan-400/35' : 'hover:border-rose-400/35'}`}
        >
            {content}
        </Link>
    );
}

function PlayerColumn({
    players,
    side,
    align = 'left',
    selectedIndex,
    onSelect,
}: {
    players: PreMatchAnalysisPlayerCard[];
    side: 'A' | 'B';
    align?: 'left' | 'right';
    selectedIndex: number;
    onSelect: (index: number) => void;
}) {
    if (players.length === 0) {
        return <PlayerCard player={null} side={side} align={align} />;
    }

    const safeIndex = Math.min(Math.max(selectedIndex, 0), players.length - 1);
    const selectedPlayer = players[safeIndex] || null;

    return (
        <div className="space-y-2">
            {players.length > 1 ? (
                <div className={`flex flex-wrap gap-1.5 ${align === 'right' ? 'justify-start xl:justify-end' : 'justify-start'}`}>
                    {players.map((player, index) => {
                        const active = index === safeIndex;
                        return (
                            <button
                                key={`${player.playerId || player.name}-${index}`}
                                type="button"
                                onClick={() => onSelect(index)}
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black transition-colors ${
                                    active
                                        ? buildTeamAccentTone(side)
                                        : 'border-white/10 bg-slate-950/45 text-slate-300 hover:bg-white/5'
                                }`}
                            >
                                {player.name}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            <PlayerCard player={selectedPlayer} side={side} align={align} />
        </div>
    );
}

function RankSummaryCard({
    team,
    summary,
    side,
}: {
    team: PreMatchAnalysisTeamInfo;
    summary: PreMatchAnalysisRankSummary;
    side: 'A' | 'B';
}) {
    return (
        <div className={`rounded-2xl border p-3 ${buildTeamFrameTone(side)}`}>
            <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-white/5 ${side === 'A' ? 'border-cyan-400/18' : 'border-rose-400/18'}`}>
                    <TeamLogo src={team.logo} name={team.shortName} region={team.region || undefined} size={24} className="h-6 w-6" />
                </div>
                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Rank 汇总</div>
                    <div className="mt-0.5 text-[11px] font-bold text-slate-300">{side === 'A' ? '左侧阵营 Rank' : '右侧阵营 Rank'}</div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">覆盖人数</div><div className="mt-1 text-sm font-black text-white">{summary.coveredPlayers} / {summary.rankedPlayers}</div></div>
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">平均活跃度</div><div className="mt-1 text-sm font-black text-white">{formatMetric(summary.avgActivity)}</div></div>
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">最高 LP</div><div className="mt-1 text-sm font-black text-white">{summary.maxLp !== null ? summary.maxLp : '--'}</div></div>
                <div className="rounded-xl border border-white/8 bg-slate-900/40 px-2.5 py-2"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">高活跃人数</div><div className="mt-1 text-sm font-black text-white">{summary.highActivityPlayers}</div></div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {summary.topChampions.length > 0 ? summary.topChampions.map((champion) => (
                    <span key={`${team.shortName}-${champion}`} className="inline-flex rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold text-fuchsia-100">{champion}</span>
                )) : <span className="text-xs text-slate-400">暂未拿到稳定 Rank 英雄池</span>}
            </div>

            <div className="mt-3 text-[11px] text-slate-400">最近同步：{formatDateLabel(summary.lastSyncedAt)}</div>
        </div>
    );
}

function TrendCard({
    title,
    team,
    points,
    side,
}: {
    title: string;
    team: PreMatchAnalysisTeamInfo;
    points: PreMatchAnalysisTrendPoint[];
    side: 'A' | 'B';
}) {
    return (
        <div className={`rounded-2xl border p-3 ${buildTeamFrameTone(side)}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl border bg-white/5 ${side === 'A' ? 'border-cyan-400/18' : 'border-rose-400/18'}`}>
                        <TeamLogo src={team.logo} name={team.shortName} region={team.region || undefined} size={18} className="h-[18px] w-[18px]" />
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</div>
                        <div className="mt-0.5 text-[11px] font-bold text-slate-300">最近 {points.length} 个系列赛</div>
                    </div>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${buildTeamAccentTone(side)}`}>{side === 'A' ? '左侧阵营' : '右侧阵营'}</span>
            </div>

            <div className="mt-3 space-y-2">
                {points.length > 0 ? (
                    points.map((point) => (
                        <div key={point.matchId} className={`rounded-xl border px-3 py-2.5 ${buildTrendTone(point.result)}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs font-black text-white">
                                        vs {point.opponent}
                                        <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${buildTeamAccentTone(side)}`}>
                                            {point.result}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-400">
                                        {formatDateLabel(point.startTime)} · {point.scoreLabel}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-black text-white">{point.durationLabel}</div>
                                    <div className="mt-0.5 text-[10px] text-slate-400">场均时长</div>
                                </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                                <span className="rounded-full border border-white/10 bg-slate-950/45 px-2 py-0.5 text-slate-200">击杀 {formatMetric(point.kills)}</span>
                                <span className="rounded-full border border-white/10 bg-slate-950/45 px-2 py-0.5 text-slate-200">阵亡 {formatMetric(point.deaths)}</span>
                                <span className="rounded-full border border-white/10 bg-slate-950/45 px-2 py-0.5 text-slate-200">K/D {formatMetric(point.kdRatio, 2)}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/35 px-3 py-3 text-xs text-slate-400">暂无可用趋势样本。</div>
                )}
            </div>
        </div>
    );
}

function BpGameCard({
    game,
    teamAName,
    teamBName,
}: {
    game: PreMatchAnalysisBpGame;
    teamAName: string;
    teamBName: string;
}) {
    return (
        <div className="rounded-xl border border-white/8 bg-slate-900/45 p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-black text-white">第 {game.gameNumber} 局</div>
                <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold text-slate-300">{game.sideLabel}</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/80">{teamAName} Picks</div>
                    <div className="mt-2">
                        <ChampionThumbStrip champions={game.teamAChampions} side="A" compact />
                    </div>
                </div>

                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200/80">{teamBName} Picks</div>
                    <div className="mt-2">
                        <ChampionThumbStrip champions={game.teamBChampions} side="B" compact />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PreMatchAnalysisPanel({ data }: Props) {
    const headToHeadAWins = data.recent.headToHead.filter((item) => item.winnerSide === 'A').length;
    const headToHeadBWins = data.recent.headToHead.filter((item) => item.winnerSide === 'B').length;
    const [selectedPlayersByRole, setSelectedPlayersByRole] = useState<Record<string, { teamA: number; teamB: number }>>({});
    const [selectedHeadToHeadGames, setSelectedHeadToHeadGames] = useState<Record<string, number>>({});

    return (
        <section id="prematch-analysis-section" className="scroll-mt-24 px-1 sm:px-2 lg:px-3 2xl:px-4">
            <div className="glass overflow-hidden rounded-3xl border border-white/10 shadow-[0_24px_80px_rgba(2,6,23,0.34)]">
                <div className="border-b border-white/8 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/70">Pre-Match Insights</div>
                            <h2 className="mt-1.5 text-xl font-black tracking-tight text-white">赛前分析</h2>
                            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-300">改成桌面信息板布局，重点压缩卡片尺寸和纵向高度，让你更快扫完一整块内容。</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${buildLeanTone(data.summary.leanTeam)}`}>{data.summary.leanLabel}</span>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${buildRiskTone(data.summary.riskLabel)}`}>风险：{data.summary.riskLabel}</span>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-300">
                        <a href="#prematch-overview" className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 hover:bg-white/10">总览</a>
                        <a href="#prematch-form" className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 hover:bg-white/10">近期状态</a>
                        <a href="#prematch-trends" className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 hover:bg-white/10">趋势明细</a>
                        <a href="#prematch-matchups" className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 hover:bg-white/10">选手对位</a>
                        <a href="#prematch-rank" className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 hover:bg-white/10">Rank 汇总</a>
                        <a href="#prematch-bp" className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 hover:bg-white/10">BP 倾向</a>
                    </div>

                    <div id="prematch-overview" className="mt-3">
                        <CenterInsightCard data={data} />
                    </div>
                </div>

                <div className="space-y-4 px-4 py-4">
                    <div id="prematch-form" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <TeamOverviewCard team={data.teamA} summary={data.recent.teamA} side="A" />
                        <TeamOverviewCard team={data.teamB} summary={data.recent.teamB} side="B" />
                    </div>

                    <div id="prematch-headtohead" className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Head To Head</div>
                        <div className="mt-0.5 text-base font-black text-white">历史交手</div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-2 text-center"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/80">{data.teamA.shortName}</div><div className="mt-1 text-xl font-black text-white">{headToHeadAWins}</div></div>
                            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-center"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">样本</div><div className="mt-1 text-xl font-black text-white">{data.recent.headToHead.length}</div></div>
                            <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-2.5 py-2 text-center"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200/80">{data.teamB.shortName}</div><div className="mt-1 text-xl font-black text-white">{headToHeadBWins}</div></div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                            {data.recent.headToHead.length > 0 ? data.recent.headToHead.map((item) => {
                                const selectedGameIndex = Math.min(
                                    Math.max(selectedHeadToHeadGames[item.id] ?? 0, 0),
                                    Math.max(item.games.length - 1, 0),
                                );
                                const selectedGame = item.games[selectedGameIndex] || null;

                                return (
                                    <div
                                        key={item.id}
                                        className="rounded-xl border border-white/8 bg-slate-900/45 px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-slate-900/70"
                                    >
                                        <Link href={`/match/${item.id}`} className="block">
                                            <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                                                <span>{formatDateLabel(item.startTime)}</span>
                                                <span className="truncate">{item.tournament} / {item.stage}</span>
                                            </div>
                                        </Link>

                                        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs font-black text-white">
                                            <div className="flex items-center gap-2">
                                                <span>{data.teamA.shortName}</span>
                                                {item.winnerSide === 'A' ? <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${buildWinnerBadgeTone()}`}>👑 WIN</span> : null}
                                            </div>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-center">
                                                {item.hasResult ? `${item.scoreA ?? '--'} : ${item.scoreB ?? '--'}` : item.statusLabel || '待同步'}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {item.winnerSide === 'B' ? <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${buildWinnerBadgeTone()}`}>👑 WIN</span> : null}
                                                <span>{data.teamB.shortName}</span>
                                            </div>
                                        </div>

                                        {item.games.length > 0 ? (
                                                <>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {item.games.map((game, index) => {
                                                            const active = index === selectedGameIndex;
                                                            return (
                                                            <button
                                                                key={`${item.id}-${game.gameNumber}`}
                                                                type="button"
                                                                    onClick={() =>
                                                                        setSelectedHeadToHeadGames((current) => ({
                                                                            ...current,
                                                                            [item.id]: index,
                                                                        }))
                                                                    }
                                                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black transition ${buildGameTabTone(game.mapSideWin, active)}`}
                                                                >
                                                                    第{game.gameNumber}局
                                                                </button>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="mt-2 grid grid-cols-3 gap-2 text-center xl:grid-cols-6">
                                                        <div className={`rounded-lg px-2 py-1.5 ${buildSideStatCardTone(selectedGame?.teamASide || 'NONE')}`}>
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{data.teamA.shortName} 击杀</div>
                                                            <div className="mt-0.5 text-xs font-black text-white">{selectedGame?.teamAKills ?? '--'}</div>
                                                        </div>
                                                        <div className={`rounded-lg px-2 py-1.5 ${buildSideStatCardTone(selectedGame?.teamBSide || 'NONE')}`}>
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{data.teamB.shortName} 击杀</div>
                                                            <div className="mt-0.5 text-xs font-black text-white">{selectedGame?.teamBKills ?? '--'}</div>
                                                        </div>
                                                        <div className={`rounded-lg px-2 py-1.5 ${buildSideStatCardTone(selectedGame?.teamASide || 'NONE')}`}>
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{data.teamA.shortName} 10分击杀</div>
                                                            <div className="mt-0.5 text-xs font-black text-white">{selectedGame?.teamATenMinKills ?? '--'}</div>
                                                        </div>
                                                        <div className={`rounded-lg px-2 py-1.5 ${buildSideStatCardTone(selectedGame?.teamBSide || 'NONE')}`}>
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{data.teamB.shortName} 10分击杀</div>
                                                            <div className="mt-0.5 text-xs font-black text-white">{selectedGame?.teamBTenMinKills ?? '--'}</div>
                                                        </div>
                                                        <div className="rounded-lg border border-white/8 bg-slate-950/45 px-2 py-1.5">
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">总击杀</div>
                                                            <div className="mt-0.5 text-xs font-black text-white">{selectedGame?.totalKills ?? '--'}</div>
                                                        </div>
                                                        <div className="rounded-lg border border-white/8 bg-slate-950/45 px-2 py-1.5 text-center">
                                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">时长</div>
                                                            <div className="mt-0.5 text-xs font-black text-white">{selectedGame?.durationLabel ?? '--'}</div>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                            <div className="mt-2 rounded-lg border border-dashed border-white/10 bg-slate-950/35 px-3 py-2 text-[11px] text-slate-400">
                                                当前没有可展示的小局明细。
                                            </div>
                                        )}

                                        <Link href={`/match/${item.id}`} className="mt-2 block text-right text-[10px] font-bold text-cyan-200/80">
                                            点击查看详情
                                        </Link>
                                    </div>
                                );
                            }) : <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/35 px-3 py-3 text-xs text-slate-400">当前没有已完赛的交手记录。</div>}
                        </div>
                    </div>

                    <div id="prematch-matchups" className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Core Matchups</div>
                        <div className="mt-0.5 text-base font-black text-white">核心选手对位</div>
                        <div className="mt-1 text-[11px] text-slate-400">名字放到中轴两侧，结论放正中上方，下面只保留左右关键指标，减少重复信息。</div>
                        <div className="mt-3 space-y-2">
                            {data.matchups.map((matchup) => {
                                const selection = selectedPlayersByRole[matchup.role] || { teamA: 0, teamB: 0 };
                                const selectedTeamAIndex = Math.min(Math.max(selection.teamA, 0), Math.max(matchup.teamAPlayers.length - 1, 0));
                                const selectedTeamBIndex = Math.min(Math.max(selection.teamB, 0), Math.max(matchup.teamBPlayers.length - 1, 0));
                                const selectedTeamAPlayer = matchup.teamAPlayers[selectedTeamAIndex] || null;
                                const selectedTeamBPlayer = matchup.teamBPlayers[selectedTeamBIndex] || null;
                                const dynamicEdge = buildMatchupEdge(selectedTeamAPlayer, selectedTeamBPlayer, data.teamA.shortName, data.teamB.shortName);
                                const dynamicLean = dynamicEdge.edgeText.includes(data.teamA.shortName)
                                    ? 'A'
                                    : dynamicEdge.edgeText.includes(data.teamB.shortName)
                                      ? 'B'
                                      : 'EVEN';

                                return (
                                <div key={matchup.role} className="rounded-xl border border-white/8 bg-slate-900/40 p-3">
                                    <div className="flex flex-wrap items-center justify-center gap-3 text-center">
                                        <div className="min-w-[120px] text-right">
                                            <div className="text-xl font-black tracking-tight text-cyan-50 drop-shadow-[0_0_14px_rgba(34,211,238,0.12)]">
                                                {selectedTeamAPlayer?.name || '暂无'}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center gap-2 text-center">
                                            <div className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${buildLeanTone(dynamicLean)}`}>
                                                {dynamicEdge.edgeText}
                                            </div>
                                        </div>
                                        <div className="min-w-[120px] text-left">
                                            <div className="text-xl font-black tracking-tight text-rose-50 drop-shadow-[0_0_14px_rgba(251,113,133,0.12)]">
                                                {selectedTeamBPlayer?.name || '暂无'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] xl:items-stretch">
                                        <PlayerColumn
                                            players={matchup.teamAPlayers}
                                            side="A"
                                            selectedIndex={selectedTeamAIndex}
                                            onSelect={(index) =>
                                                setSelectedPlayersByRole((current) => ({
                                                    ...current,
                                                    [matchup.role]: {
                                                        teamA: index,
                                                        teamB: current[matchup.role]?.teamB ?? 0,
                                                    },
                                                }))
                                            }
                                        />
                                        <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center">
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">对位结论</div>
                                                <div className="mt-1.5 text-sm font-black text-white">{dynamicEdge.edgeText}</div>
                                                <div className="mt-1.5 text-[11px] leading-4 text-slate-400">{dynamicEdge.edgeValue === null ? '快照不完整时，只展示真实数据。' : `${dynamicEdge.edgeMetricLabel || '评分依据'} 差值 ${dynamicEdge.edgeValue > 0 ? '+' : ''}${dynamicEdge.edgeValue.toFixed(1)}`}</div>
                                            </div>
                                        </div>
                                        <PlayerColumn
                                            players={matchup.teamBPlayers}
                                            side="B"
                                            align="right"
                                            selectedIndex={selectedTeamBIndex}
                                            onSelect={(index) =>
                                                setSelectedPlayersByRole((current) => ({
                                                    ...current,
                                                    [matchup.role]: {
                                                        teamA: current[matchup.role]?.teamA ?? 0,
                                                        teamB: index,
                                                    },
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <CollapsibleSection
                            id="prematch-trends"
                            title="趋势明细"
                            subtitle="Recent Trends"
                            summary={`最近 ${Math.max(data.recent.teamATrends.length, data.recent.teamBTrends.length)} 个系列赛的简版趋势。`}
                        >
                            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                                <TrendCard title="近期趋势" team={data.teamA} points={data.recent.teamATrends} side="A" />
                                <TrendCard title="近期趋势" team={data.teamB} points={data.recent.teamBTrends} side="B" />
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection
                            id="prematch-rank"
                            title="Rank 状态汇总"
                            subtitle="Rank Summary"
                            summary={`${data.teamA.shortName} / ${data.teamB.shortName} 的 Rank 热度与英雄池。`}
                        >
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                <RankSummaryCard team={data.teamA} summary={data.rank.teamA} side="A" />
                                <RankSummaryCard team={data.teamB} summary={data.rank.teamB} side="B" />
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection
                            id="prematch-bp"
                            title="BP / 英雄倾向"
                            subtitle="BP Status"
                            summary={data.bp.ready ? `已解析 ${data.bp.totalGames} 局 BP。` : '当前 BP 明细不完整。'}
                        >
                            <div className="rounded-2xl border border-white/8 bg-slate-900/45 px-3 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${data.bp.ready ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>{data.bp.ready ? '已接入 BP 英雄数据' : '待接入 BP 明细'}</span>
                                    {data.bp.sourceMatchId ? <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-black text-slate-200">{data.bp.sourceMatchId}</span> : null}
                                    {data.bp.totalGames > 0 ? <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-black text-slate-200">已解析 {data.bp.totalGames} 局</span> : null}
                                </div>
                                <div className="mt-3 text-xs leading-5 text-slate-300">{data.bp.note}</div>
                                <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                                    <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/80">{data.teamA.shortName} 常见英雄</div>
                                        <div className="mt-2">
                                            <ChampionThumbStrip champions={data.bp.teamAHighlights} side="A" emptyText="暂无英雄倾向样本" />
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-rose-400/15 bg-rose-500/5 p-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200/80">{data.teamB.shortName} 常见英雄</div>
                                        <div className="mt-2">
                                            <ChampionThumbStrip champions={data.bp.teamBHighlights} side="B" emptyText="暂无英雄倾向样本" />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                                    {data.bp.games.length > 0 ? data.bp.games.map((game) => (
                                        <BpGameCard key={`bp-${game.gameNumber}`} game={game} teamAName={data.teamA.shortName} teamBName={data.teamB.shortName} />
                                    )) : <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/35 px-3 py-3 text-xs text-slate-400">当前还没有可直接渲染的 BP 英雄数据。等 BP 同步继续填充后，这里会优先展示每局英雄与常见倾向。</div>}
                                </div>
                            </div>
                        </CollapsibleSection>
                    </div>
                </div>
            </div>
        </section>
    );
}
