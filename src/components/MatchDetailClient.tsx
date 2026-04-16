'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import BpMatchBindingCard from '@/components/analysis/BpMatchBindingCard';
import GameSummaryPanel from '@/components/analysis/GameSummaryPanel';
import ManualReviewDrawer, { type ManualReviewEntryView } from '@/components/analysis/ManualReviewDrawer';
import ManualReviewPanel from '@/components/analysis/ManualReviewPanel';
import MatchOddsHintBadges from '@/components/analysis/MatchOddsHintBadges';
import OddsManager from '@/components/analysis/OddsManager';
import PostMatchImages from '@/components/analysis/PostMatchImages';
import PreMatchAnalysisPanel, { type PreMatchAnalysisData } from '@/components/analysis/PreMatchAnalysisPanel';
import StrategyCriticalAlertOverlay from '@/components/analysis/StrategyCriticalAlertOverlay';
import StrategyCriticalAlertStatusBar from '@/components/analysis/StrategyCriticalAlertStatusBar';
import TeamLogo from '@/components/TeamLogo';
import DockedPopover from '@/components/ui/DockedPopover';
import { useAdmin } from '@/hooks/useAdmin';
import { getManualReviewTypeLabel, type ManualReviewType } from '@/lib/manual-review-comment';
import { getTeamShortDisplayName } from '@/lib/team-display';

import RecentFormPreview from './team/RecentFormPreview';

interface TeamStats {
    duration: string | null;
    kills: string | null;
    tenMinKills?: string | null;
    matches?: any[];
}

interface MatchDetailClientProps {
    match: any;
    initialGameNumber?: number;
    teamAStats?: TeamStats;
    teamBStats?: TeamStats;
    preMatchAnalysis?: PreMatchAnalysisData | null;
    manualReviews?: ManualReviewEntryView[];
    recentManualReviews?: {
        teamA?: ManualReviewEntryView[];
        teamB?: ManualReviewEntryView[];
    };
}

function getExpectedGameCount(formatValue?: string | null): number {
    const formatText = String(formatValue || '').toUpperCase();
    const match = formatText.match(/BO\s*(\d+)/i) || formatText.match(/(\d+)/);
    const parsed = match ? parseInt(match[1], 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function looksCorruptedText(value: string) {
    return value.includes('\uFFFD');
}

function formatGameTabLabel(tab: string) {
    if (tab.startsWith('Game ')) {
        const num = parseInt(tab.split(' ')[1], 10);
        if (!Number.isNaN(num)) return `第${num}局`;
    }
    if (tab === 'Match Overview') return '比赛概览';
    return tab;
}

function getManualReviewTone(type: ManualReviewType) {
    if (type === 'HIGHLIGHT') return 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100';
    if (type === 'ANOMALY') return 'border-rose-400/35 bg-rose-500/12 text-rose-100';
    if (type === 'SPOTLIGHT') return 'border-amber-400/35 bg-amber-500/12 text-amber-100';
    return 'border-fuchsia-400/35 bg-fuchsia-500/12 text-fuchsia-100';
}

function formatManualReviewLocator(entry: ManualReviewEntryView) {
    return `${entry.matchDate} vs ${entry.opponentTeamName} · 第${String(entry.gameNumber)}局`;
}

export default function MatchDetailClient({
    match,
    initialGameNumber,
    teamAStats,
    teamBStats,
    preMatchAnalysis,
    manualReviews,
    recentManualReviews,
}: MatchDetailClientProps) {
    const isAdmin = useAdmin();
    const games = match?.games || [];
    const expectedGameCount = getExpectedGameCount(match?.format);
    const teamALinkId = match?.teamA?.id || match?.teamAId || null;
    const teamBLinkId = match?.teamB?.id || match?.teamBId || null;
    const teamADisplayName = getTeamShortDisplayName(match?.teamA);
    const teamBDisplayName = getTeamShortDisplayName(match?.teamB);

    const oddsData = match?.odds || [];
    const commentsData = match?.comments || [];

    const [activeGameNumber, setActiveGameNumber] = useState(initialGameNumber || 1);
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState(initialGameNumber ? `Game ${initialGameNumber}` : 'Game 1');
    const [showAStats, setShowAStats] = useState(false);
    const [showBStats, setShowBStats] = useState(false);
    const [selectedManualReview, setSelectedManualReview] = useState<ManualReviewEntryView | null>(null);
    const hasTeamARecentStats = Boolean(teamAStats?.duration || teamAStats?.kills || teamAStats?.tenMinKills);
    const hasTeamBRecentStats = Boolean(teamBStats?.duration || teamBStats?.kills || teamBStats?.tenMinKills);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (initialGameNumber) {
            setActiveTab(`Game ${initialGameNumber}`);
            setActiveGameNumber(initialGameNumber);
        }
    }, [initialGameNumber]);

    useEffect(() => {
        if (activeTab.startsWith('Game ')) {
            const num = parseInt(activeTab.split(' ')[1], 10);
            if (!Number.isNaN(num)) setActiveGameNumber(num);
        } else if (activeTab === 'Match Overview') {
            setActiveGameNumber(1);
        }
    }, [activeTab]);

    const scrollToPreMatchAnalysis = useCallback(() => {
        const section = document.getElementById('prematch-analysis-section');
        if (!section) return;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    if (!mounted) {
        return (
            <div className="flex min-h-[420px] items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-slate-400">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
                    <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">加载中</div>
                </div>
            </div>
        );
    }

    const activeGame = games.find((g: any) => g.gameNumber === activeGameNumber);
    const activeOdds = oddsData.filter((o: any) => o.gameNumber === activeGameNumber) || [];
    const matchDateText = match?.startTime ? new Date(match.startTime).toISOString().slice(0, 10) : '--';

    const tabs: string[] = [];
    const gameCount = Math.max(expectedGameCount, activeGameNumber, 1);
    for (let i = 1; i <= gameCount; i += 1) {
        tabs.push(`Game ${i}`);
    }

    const matchScoreA = match.games?.filter((g: any) => g.winnerId === match.teamAId).length || 0;
    const matchScoreB = match.games?.filter((g: any) => g.winnerId === match.teamBId).length || 0;
    const normalizedVersion = String(match?.gameVersion || '').trim();
    const versionBadge = normalizedVersion
        ? normalizedVersion.toUpperCase().startsWith('PATCH')
            ? normalizedVersion
            : `PATCH ${normalizedVersion}`
        : '版本未知';

    const getTeamAnalysisPreview = (team: any) => {
        const raw = team?.teamComments?.[0]?.content || '';
        const plain = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!plain || looksCorruptedText(plain)) return '暂无队伍点评';
        return plain;
    };

    const teamANotePreview = getTeamAnalysisPreview(match.teamA);
    const teamBNotePreview = getTeamAnalysisPreview(match.teamB);
    const teamAReviewCards = recentManualReviews?.teamA || [];
    const teamBReviewCards = recentManualReviews?.teamB || [];

    const renderReviewRail = (entries: ManualReviewEntryView[], accent: 'left' | 'right') => {
        const accentBorder = accent === 'left' ? 'border-cyan-500/20' : 'border-rose-500/20';
        const accentText = accent === 'left' ? 'text-cyan-200/80' : 'text-rose-200/80';
        const accentHover = accent === 'left' ? 'hover:border-cyan-400/35' : 'hover:border-rose-400/35';

        return (
            <div className="w-[244px]">
                <div className="mb-2 flex items-center justify-between px-1">
                    <div className={`text-[10px] font-black uppercase tracking-[0.24em] ${accentText}`}>近期手动回看</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        {entries.length > 0 ? `近 ${entries.length} 条` : '空状态'}
                    </div>
                </div>

                <div className="space-y-2">
                    {entries.length === 0 ? (
                        <div className={`rounded-2xl border border-dashed ${accentBorder} bg-slate-950/35 px-3 py-3.5 shadow-[0_10px_24px_rgba(2,6,23,0.16)]`}>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-slate-300">
                                    手动
                                </span>
                            </div>
                            <div className="mt-2 line-clamp-1 text-[13px] font-black text-white">暂无手动点评</div>
                            <div className="mt-1 text-[11px] leading-4 text-slate-500">有手动点评后，这里只显示最近 2 条紧凑卡片。</div>
                        </div>
                    ) : (
                        entries.slice(0, 2).map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => setSelectedManualReview(entry)}
                                className={`block w-full rounded-2xl border ${accentBorder} ${accentHover} bg-slate-950/42 px-3 py-3 text-left shadow-[0_10px_24px_rgba(2,6,23,0.18)] transition-all hover:-translate-y-0.5 hover:bg-slate-900/62`}
                                title={entry.summary}
                            >
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${getManualReviewTone(entry.reviewType)}`}>
                                        {getManualReviewTypeLabel(entry.reviewType)}
                                    </span>
                                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-white">
                                        {entry.teamName}
                                    </span>
                                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-slate-200">
                                        {entry.playerId}
                                    </span>
                                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-slate-200">
                                        {entry.hero}
                                    </span>
                                </div>
                                <div className="mt-2 line-clamp-2 text-[12px] font-bold leading-5 text-white">{entry.summary}</div>
                                <div className="mt-2 text-[10px] font-semibold text-slate-400">{formatManualReviewLocator(entry)}</div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2 overflow-x-clip pb-20 text-white">
            <StrategyCriticalAlertOverlay matchId={match.id} matchStartTime={match.startTime} />
            <div className="px-1 pt-4 sm:px-2 lg:px-3 2xl:px-4">
                <StrategyCriticalAlertStatusBar matchId={match.id} matchStartTime={match.startTime} />
            </div>
            <div className="glass relative z-50 mb-10 border-b border-white/5 p-0 shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-600/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-red-500" />

                <div className="relative z-10 flex w-full items-center justify-between px-1 py-5 sm:px-2 lg:px-3 lg:py-8 2xl:px-4">
                    <div className="group flex flex-1 items-center justify-end gap-4 text-right xl:gap-8">
                        <div
                            className={`relative mr-4 hidden flex-col items-end gap-1 rounded-2xl border border-white/5 bg-slate-900/40 p-3 shadow-inner transition-all group-hover:bg-slate-800 xl:flex ${
                                !hasTeamARecentStats ? 'cursor-default opacity-30 grayscale' : 'cursor-help'
                            }`}
                            onMouseEnter={() => setShowAStats(true)}
                            onMouseLeave={() => setShowAStats(false)}
                        >
                            <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-blue-400">
                                近期状态<span className="normal-case text-slate-600">（近 2 个大场）</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col items-end">
                                    <span className="text-2xl font-black leading-none tracking-tighter text-white">{teamAStats?.duration || '--'}</span>
                                    <span className="mt-1 text-[8px] font-black text-slate-500">平均时长</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-2xl font-black leading-none tracking-tighter text-white">{teamAStats?.kills || '--'}</span>
                                    <span className="mt-1 text-[8px] font-black text-slate-500">场均总击杀</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-2xl font-black leading-none tracking-tighter text-white">{teamAStats?.tenMinKills || '--'}</span>
                                    <span className="mt-1 text-[8px] font-black text-slate-500">10分钟总人头</span>
                                </div>
                            </div>
                            <DockedPopover open={showAStats && Boolean(teamAStats?.matches && teamAStats.matches.length > 0)} dock="left">
                                <RecentFormPreview
                                    teamId={teamALinkId}
                                    matches={teamAStats?.matches || []}
                                    averageDuration={teamAStats?.duration || '--'}
                                    averageKills={teamAStats?.kills || '--'}
                                    averageTenMinKills={teamAStats?.tenMinKills || '--'}
                                />
                            </DockedPopover>
                        </div>
                        <div className="hidden 2xl:block">{renderReviewRail(teamAReviewCards, 'left')}</div>

                        <Link href={teamALinkId ? `/teams/${teamALinkId}` : '#'} className="flex items-center gap-4 xl:gap-8">
                            <div className="min-w-0 shrink pr-2 max-w-[280px] lg:max-w-[340px] 2xl:max-w-[380px]">
                                <h1 className="truncate text-3xl font-black uppercase leading-none tracking-tighter text-white transition-colors group-hover:text-blue-400 lg:text-5xl">
                                    {teamADisplayName}
                                </h1>
                                <div
                                    className="mt-2 ml-auto w-full max-w-full overflow-hidden rounded-xl border border-blue-400/30 bg-slate-900/75 px-3 py-2 text-left shadow-[0_0_0_1px_rgba(59,130,246,0.08)]"
                                    title={teamANotePreview}
                                >
                                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-blue-300/90">队伍简评</div>
                                    <div className="line-clamp-2 overflow-hidden text-[12px] font-semibold leading-5 tracking-[0.01em] break-words text-slate-100">
                                        {teamANotePreview}
                                    </div>
                                </div>
                                <div className="mt-2 max-w-full overflow-hidden">
                                    <MatchOddsHintBadges
                                        team={{ id: match.teamAId, name: match.teamA?.name || '未知队伍', shortName: teamADisplayName || null }}
                                        matchMeta={[
                                            {
                                                id: match.id,
                                                startTime: match.startTime || null,
                                                tournament: match.tournament || null,
                                                stage: match.stage || null,
                                                format: match.format || null,
                                                teamAId: match.teamAId,
                                                teamBId: match.teamBId,
                                                teamAName: teamADisplayName || null,
                                                teamBName: teamBDisplayName || null,
                                                teamARegion: match.teamA?.region || null,
                                                teamBRegion: match.teamB?.region || null,
                                            },
                                        ]}
                                    />
                                </div>
                            </div>
                            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-slate-900 shadow-inner transition-all duration-500 group-hover:scale-105 group-hover:border-blue-500/20 group-hover:bg-slate-800 lg:h-28 lg:w-28">
                                {match.teamA?.logo && <TeamLogo src={match.teamA.logo} name={match.teamA.name} size={112} />}
                            </div>
                        </Link>
                    </div>

                    <div className="flex shrink-0 flex-col items-center px-6 lg:px-10 2xl:px-12">
                        <div className="flex items-center gap-6 text-6xl font-black tracking-tighter text-white lg:gap-10 lg:text-8xl">
                            <span className={matchScoreA > matchScoreB ? 'text-blue-500' : 'text-slate-500'}>{matchScoreA}</span>
                            <span className="text-4xl font-thin text-slate-800 lg:text-6xl">:</span>
                            <span className={matchScoreB > matchScoreA ? 'text-red-500' : 'text-slate-500'}>{matchScoreB}</span>
                        </div>
                        <div className="mt-5 flex flex-col items-center gap-2">
                            <span
                                className={`rounded-full px-5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg ${
                                    normalizedVersion ? 'bg-cyan-900/50 text-cyan-200 shadow-cyan-900/40' : 'bg-slate-800 text-slate-300 shadow-black/50'
                                }`}
                            >
                                {versionBadge}
                            </span>
                        </div>
                    </div>

                    <div className="group flex flex-1 items-center justify-start gap-4 text-left xl:gap-8">
                        <Link href={teamBLinkId ? `/teams/${teamBLinkId}` : '#'} className="flex items-center gap-4 xl:gap-8">
                            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-slate-900 shadow-inner transition-all duration-500 group-hover:scale-105 group-hover:border-red-500/20 group-hover:bg-slate-800 lg:h-28 lg:w-28">
                                {match.teamB?.logo && <TeamLogo src={match.teamB.logo} name={match.teamB.name} size={112} />}
                            </div>
                            <div className="min-w-0 shrink pr-2 max-w-[280px] lg:max-w-[340px] 2xl:max-w-[380px]">
                                <h1 className="truncate text-3xl font-black uppercase leading-none tracking-tighter text-white transition-colors group-hover:text-red-500 lg:text-5xl">
                                    {teamBDisplayName}
                                </h1>
                                <div
                                    className="mt-2 w-full max-w-full overflow-hidden rounded-xl border border-rose-400/30 bg-slate-900/75 px-3 py-2 text-left shadow-[0_0_0_1px_rgba(244,63,94,0.08)]"
                                    title={teamBNotePreview}
                                >
                                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-rose-300/90">队伍简评</div>
                                    <div className="line-clamp-2 overflow-hidden text-[12px] font-semibold leading-5 tracking-[0.01em] break-words text-slate-100">
                                        {teamBNotePreview}
                                    </div>
                                </div>
                                <div className="mt-2 max-w-full overflow-hidden">
                                    <MatchOddsHintBadges
                                        team={{ id: match.teamBId, name: match.teamB?.name || '未知队伍', shortName: teamBDisplayName || null }}
                                        matchMeta={[
                                            {
                                                id: match.id,
                                                startTime: match.startTime || null,
                                                tournament: match.tournament || null,
                                                stage: match.stage || null,
                                                format: match.format || null,
                                                teamAId: match.teamAId,
                                                teamBId: match.teamBId,
                                                teamAName: teamADisplayName || null,
                                                teamBName: teamBDisplayName || null,
                                                teamARegion: match.teamA?.region || null,
                                                teamBRegion: match.teamB?.region || null,
                                            },
                                        ]}
                                    />
                                </div>
                            </div>
                        </Link>
                        <div className="hidden 2xl:block">{renderReviewRail(teamBReviewCards, 'right')}</div>

                        <div
                            className={`relative ml-4 hidden flex-col items-start gap-1 rounded-2xl border border-white/5 bg-slate-900/40 p-3 shadow-inner transition-all group-hover:bg-slate-800 xl:flex ${
                                !hasTeamBRecentStats ? 'cursor-default opacity-30 grayscale' : 'cursor-help'
                            }`}
                            onMouseEnter={() => setShowBStats(true)}
                            onMouseLeave={() => setShowBStats(false)}
                        >
                            <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-red-500">
                                近期状态<span className="normal-case text-slate-600">（近 2 个大场）</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col items-start">
                                    <span className="text-2xl font-black leading-none tracking-tighter text-white">{teamBStats?.duration || '--'}</span>
                                    <span className="mt-1 text-[8px] font-black text-slate-500">平均时长</span>
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-2xl font-black leading-none tracking-tighter text-white">{teamBStats?.kills || '--'}</span>
                                    <span className="mt-1 text-[8px] font-black text-slate-500">场均总击杀</span>
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-2xl font-black leading-none tracking-tighter text-white">{teamBStats?.tenMinKills || '--'}</span>
                                    <span className="mt-1 text-[8px] font-black text-slate-500">10分钟总人头</span>
                                </div>
                            </div>
                            <DockedPopover open={showBStats && Boolean(teamBStats?.matches && teamBStats.matches.length > 0)} dock="right">
                                <RecentFormPreview
                                    teamId={teamBLinkId}
                                    matches={teamBStats?.matches || []}
                                    averageDuration={teamBStats?.duration || '--'}
                                    averageKills={teamBStats?.kills || '--'}
                                    averageTenMinKills={teamBStats?.tenMinKills || '--'}
                                />
                            </DockedPopover>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid w-full grid-cols-1 gap-5 px-1 sm:px-2 lg:px-3 xl:grid-cols-[minmax(700px,0.84fr)_minmax(0,1.16fr)] xl:gap-5 2xl:grid-cols-[minmax(740px,0.7fr)_minmax(0,0.9fr)_420px] 2xl:gap-5 2xl:px-4">
                <div className="min-w-0 flex flex-col gap-4">
                    <OddsManager
                        matchId={match.id}
                        activeGameNumber={activeGameNumber}
                        initialOdds={activeOdds}
                        isAdmin={isAdmin}
                        games={games}
                        teamA={match.teamA}
                        teamB={match.teamB}
                        matchStartTime={match.startTime}
                        tournament={match.tournament}
                        stage={match.stage}
                    />
                    {isAdmin && <BpMatchBindingCard matchId={match.id} currentSourceMatchId={match.bpSourceMatchId || null} />}
                </div>

                <div className="min-w-0 flex flex-col gap-6">
                    <div className="glass flex min-h-[760px] flex-col gap-0 overflow-hidden rounded-3xl">
                        <div className="flex items-stretch border-b border-white/5 bg-slate-900/40">
                            <div className="min-w-0 flex-1 overflow-x-auto">
                                <div className="flex min-w-max">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`whitespace-nowrap border-r border-white/5 px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                activeTab === tab ? 'border-t-2 border-t-blue-500 bg-slate-800 text-blue-400' : 'text-slate-500 hover:bg-slate-800/50 hover:text-white'
                                            }`}
                                        >
                                            {formatGameTabLabel(tab)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {preMatchAnalysis ? (
                                <div className="flex shrink-0 items-center border-l border-white/5 px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={scrollToPreMatchAnalysis}
                                        className="group relative inline-flex min-w-[144px] items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/35 bg-[linear-gradient(135deg,rgba(14,116,144,0.28),rgba(6,182,212,0.16))] px-5 py-3 text-left shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_10px_30px_rgba(8,145,178,0.18)] transition-all hover:-translate-y-0.5 hover:border-cyan-300/60 hover:shadow-[0_0_0_1px_rgba(103,232,249,0.16),0_16px_40px_rgba(8,145,178,0.24)]"
                                        title="跳转到页面下方的赛前分析"
                                    >
                                        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(103,232,249,0.14),transparent_58%)] opacity-80" />
                                        <span className="relative inline-flex items-center gap-3">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/12">
                                                <span className="h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.9)] transition-all group-hover:scale-125" />
                                            </span>
                                            <span className="flex flex-col items-start">
                                                <span className="text-[11px] font-black tracking-[0.18em] text-cyan-100">赛前分析</span>
                                                <span className="mt-0.5 text-[10px] font-bold text-cyan-200/70">查看深度数据</span>
                                            </span>
                                        </span>
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <div className="flex flex-1 flex-col gap-4 p-4 lg:p-5">
                            <GameSummaryPanel game={activeGame} match={match} activeGameNumber={activeGameNumber} isAdmin={isAdmin} />

                            {activeGame && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <PostMatchImages
                                        gameId={activeGame.id}
                                        mainImage={activeGame.screenshot}
                                        suppImage={activeGame.screenshot2}
                                        isAdmin={isAdmin}
                                        matchId={match.id}
                                        teamA={match.teamA}
                                        teamB={match.teamB}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="min-w-0 flex flex-col gap-4 xl:col-span-2 2xl:col-span-1">
                    <ManualReviewPanel
                        matchId={match.id}
                        activeGameNumber={activeGameNumber}
                        comments={commentsData}
                        manualReviews={manualReviews || []}
                        teamA={match.teamA}
                        teamB={match.teamB}
                        matchDate={matchDateText}
                        activeGame={activeGame}
                    />
                </div>
            </div>
            {preMatchAnalysis ? (
                <div className="mt-6">
                    <PreMatchAnalysisPanel data={preMatchAnalysis} />
                </div>
            ) : null}
            <ManualReviewDrawer entry={selectedManualReview} onClose={() => setSelectedManualReview(null)} />
        </div>
    );
}

