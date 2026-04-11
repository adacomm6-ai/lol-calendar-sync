'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import OddsManager from '@/components/analysis/OddsManager';
import CommentsSection from '@/components/analysis/CommentsSection';
import GameSummaryPanel from '@/components/analysis/GameSummaryPanel';
import PostMatchImages from '@/components/analysis/PostMatchImages';
import StrategyCriticalAlertOverlay from '@/components/analysis/StrategyCriticalAlertOverlay';
import StrategyCriticalAlertStatusBar from '@/components/analysis/StrategyCriticalAlertStatusBar';
import TeamLogo from '@/components/TeamLogo';
import { useAdmin } from '@/hooks/useAdmin';

import RecentFormPreview from './team/RecentFormPreview';
import BpMatchBindingCard from '@/components/analysis/BpMatchBindingCard';
import MatchOddsHintBadges from '@/components/analysis/MatchOddsHintBadges';
import { getTeamShortDisplayName } from '@/lib/team-display';

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
        if (!Number.isNaN(num)) return '\u7B2C' + num + '\u5C40';
    }
    if (tab === 'Match Overview') return '\u6BD4\u8D5B\u6982\u89C8';
    return tab;
}

export default function MatchDetailClient({ match, initialGameNumber, teamAStats, teamBStats }: MatchDetailClientProps) {
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
    const currentUserId = undefined as string | undefined;
    const [activeTab, setActiveTab] = useState(initialGameNumber ? `Game ${initialGameNumber}` : 'Game 1');
    const [showAStats, setShowAStats] = useState(false);
    const [showBStats, setShowBStats] = useState(false);
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

    if (!mounted) {
        return (
            <div className="flex min-h-[420px] items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-slate-400">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500"></div>
                    <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">{"\u52A0\u8F7D\u4E2D"}</div>
                </div>
            </div>
        );
    }

    const activeGame = games.find((g: any) => g.gameNumber === activeGameNumber);
    const activeOdds = oddsData.filter((o: any) => o.gameNumber === activeGameNumber) || [];
    const activeComments = commentsData.filter((c: any) => c.gameNumber === activeGameNumber) || [];

    const tabs: string[] = [];
    const gameCount = Math.max(expectedGameCount, activeGameNumber, 1);
    for (let i = 1; i <= gameCount; i += 1) {
        tabs.push(`Game ${i}`);
    }

    const matchScoreA = match.games?.filter((g: any) => g.winnerId === match.teamAId).length || 0;
    const matchScoreB = match.games?.filter((g: any) => g.winnerId === match.teamBId).length || 0;
    const normalizedVersion = String(match?.gameVersion || '').trim();
    const versionBadge = normalizedVersion
        ? (normalizedVersion.toUpperCase().startsWith('PATCH') ? normalizedVersion : `PATCH ${normalizedVersion}`)
        : '\u7248\u672c\u672a\u77e5';

    const getTeamAnalysisPreview = (team: any) => {
        const raw = team?.teamComments?.[0]?.content || '';
        const plain = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!plain || looksCorruptedText(plain)) return '\u6682\u65e0\u961f\u4f0d\u7b80\u8bc4';
        return plain;
    };

    const teamANotePreview = getTeamAnalysisPreview(match.teamA);
    const teamBNotePreview = getTeamAnalysisPreview(match.teamB);

    return (
        <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2 overflow-x-clip pb-20 text-white">
            <StrategyCriticalAlertOverlay matchId={match.id} matchStartTime={match.startTime} />
            <div className="px-1 pt-4 sm:px-2 lg:px-3 2xl:px-4">
                <StrategyCriticalAlertStatusBar matchId={match.id} matchStartTime={match.startTime} />
            </div>
            <div className="relative z-50 mb-10 border-b border-white/5 p-0 shadow-2xl glass">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-600/5 to-transparent"></div>
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-red-500"></div>

                <div className="relative z-10 flex w-full items-center justify-between px-1 py-5 sm:px-2 lg:px-3 lg:py-8 2xl:px-4">
                    <div className="group flex flex-1 items-center justify-end gap-4 text-right xl:gap-8">
                        <div
                            className={`relative mr-4 hidden flex-col items-end gap-1 rounded-2xl border border-white/5 bg-slate-900/40 p-3 shadow-inner transition-all group-hover:bg-slate-800 xl:flex ${!hasTeamARecentStats ? 'cursor-default opacity-30 grayscale' : 'cursor-help'}`}
                            onMouseEnter={() => setShowAStats(true)}
                            onMouseLeave={() => setShowAStats(false)}
                        >
                            <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-blue-400">
                                {"近期状态 "}<span className="normal-case text-slate-600">{"(最近 2 个大场)"}</span>
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
                            {showAStats && teamAStats?.matches && teamAStats.matches.length > 0 && (
                                <div className="absolute right-0 top-[calc(100%+12px)] z-[100] cursor-default animate-in fade-in slide-in-from-top-2 duration-200">
                                    <RecentFormPreview
                                        teamId={teamALinkId}
                                        matches={teamAStats.matches}
                                        averageDuration={teamAStats.duration || '--'}
                                        averageKills={teamAStats.kills || '--'}
                                        averageTenMinKills={teamAStats.tenMinKills || '--'}
                                    />
                                </div>
                            )}
                        </div>

                        <Link href={teamALinkId ? `/teams/${teamALinkId}` : '#'} className="flex items-center gap-4 xl:gap-8">
                            <div className="min-w-0 shrink pr-2">
                                <h1 className="truncate text-3xl font-black uppercase leading-none tracking-tighter text-white transition-colors group-hover:text-blue-400 lg:text-5xl">
                                    {teamADisplayName}
                                </h1>
                                <div
                                    className="mt-2 ml-auto max-w-[440px] rounded-xl border border-blue-400/30 bg-slate-900/75 px-3 py-2 text-left shadow-[0_0_0_1px_rgba(59,130,246,0.08)]"
                                    title={teamANotePreview}
                                >
                                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-blue-300/90">
                                        队伍简评
                                    </div>
                                    <div className="text-[12px] font-semibold leading-5 tracking-[0.01em] text-slate-100">
                                        {teamANotePreview}
                                    </div>
                                </div>
                                <MatchOddsHintBadges team={{ id: match.teamAId, name: match.teamA?.name || '\u672a\u77e5\u961f\u4f0d', shortName: teamADisplayName || null }} matchMeta={[{ id: match.id, startTime: match.startTime || null, tournament: match.tournament || null, stage: match.stage || null, format: match.format || null, teamAId: match.teamAId, teamBId: match.teamBId, teamAName: teamADisplayName || null, teamBName: teamBDisplayName || null, teamARegion: match.teamA?.region || null, teamBRegion: match.teamB?.region || null }]} />
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
                            <span className={`rounded-full px-5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg ${normalizedVersion ? 'bg-cyan-900/50 text-cyan-200 shadow-cyan-900/40' : 'bg-slate-800 text-slate-300 shadow-black/50'}`}>
                                {versionBadge}
                            </span>
                        </div>
                    </div>

                    <div className="group flex flex-1 items-center justify-start gap-4 text-left xl:gap-8">
                        <Link href={teamBLinkId ? `/teams/${teamBLinkId}` : '#'} className="flex items-center gap-4 xl:gap-8">
                            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-slate-900 shadow-inner transition-all duration-500 group-hover:scale-105 group-hover:border-red-500/20 group-hover:bg-slate-800 lg:h-28 lg:w-28">
                                {match.teamB?.logo && <TeamLogo src={match.teamB.logo} name={match.teamB.name} size={112} />}
                            </div>
                            <div className="min-w-0 shrink pr-2">
                                <h1 className="truncate text-3xl font-black uppercase leading-none tracking-tighter text-white transition-colors group-hover:text-red-500 lg:text-5xl">
                                    {teamBDisplayName}
                                </h1>
                                <div
                                    className="mt-2 max-w-[440px] rounded-xl border border-rose-400/30 bg-slate-900/75 px-3 py-2 text-left shadow-[0_0_0_1px_rgba(244,63,94,0.08)]"
                                    title={teamBNotePreview}
                                >
                                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-rose-300/90">
                                        队伍简评
                                    </div>
                                    <div className="text-[12px] font-semibold leading-5 tracking-[0.01em] text-slate-100">
                                        {teamBNotePreview}
                                    </div>
                                </div>
                                <MatchOddsHintBadges team={{ id: match.teamBId, name: match.teamB?.name || '\u672a\u77e5\u961f\u4f0d', shortName: teamBDisplayName || null }} matchMeta={[{ id: match.id, startTime: match.startTime || null, tournament: match.tournament || null, stage: match.stage || null, format: match.format || null, teamAId: match.teamAId, teamBId: match.teamBId, teamAName: teamADisplayName || null, teamBName: teamBDisplayName || null, teamARegion: match.teamA?.region || null, teamBRegion: match.teamB?.region || null }]} />
                            </div>
                        </Link>

                        <div
                            className={`relative ml-4 hidden flex-col items-start gap-1 rounded-2xl border border-white/5 bg-slate-900/40 p-3 shadow-inner transition-all group-hover:bg-slate-800 xl:flex ${!hasTeamBRecentStats ? 'cursor-default opacity-30 grayscale' : 'cursor-help'}`}
                            onMouseEnter={() => setShowBStats(true)}
                            onMouseLeave={() => setShowBStats(false)}
                        >
                            <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-red-500">
                                {"近期状态 "}<span className="normal-case text-slate-600">{"(最近 2 个大场)"}</span>
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
                            {showBStats && teamBStats?.matches && teamBStats.matches.length > 0 && (
                                <div className="absolute left-0 top-[calc(100%+12px)] z-[100] cursor-default animate-in fade-in slide-in-from-top-2 duration-200">
                                    <RecentFormPreview
                                        teamId={teamBLinkId}
                                        matches={teamBStats.matches}
                                        averageDuration={teamBStats.duration || '--'}
                                        averageKills={teamBStats.kills || '--'}
                                        averageTenMinKills={teamBStats.tenMinKills || '--'}
                                    />
                                </div>
                            )}
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
                    {isAdmin && (
                        <BpMatchBindingCard
                            matchId={match.id}
                            currentSourceMatchId={match.bpSourceMatchId || null}
                        />
                    )}
                </div>

                <div className="min-w-0 flex flex-col gap-6">
                    <div className="glass flex min-h-[760px] flex-col gap-0 overflow-hidden rounded-3xl">
                        <div className="flex overflow-x-auto border-b border-white/5 bg-slate-900/40">
                            {tabs.map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`whitespace-nowrap border-r border-white/5 px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'border-t-2 border-t-blue-500 bg-slate-800 text-blue-400' : 'text-slate-500 hover:bg-slate-800/50 hover:text-white'}`}
                                >
                                    {formatGameTabLabel(tab)}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-1 flex-col gap-4 p-4 lg:p-5">
                            <GameSummaryPanel
                                game={activeGame}
                                match={match}
                                activeGameNumber={activeGameNumber}
                                isAdmin={isAdmin}
                            />

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

                <div className="min-w-0 h-[900px] flex flex-col gap-4 xl:col-span-2 2xl:col-span-1">
                    <div className="min-h-[250px] flex-1 overflow-hidden rounded-3xl border border-emerald-500/20 bg-emerald-500/5">
                        <CommentsSection
                            matchId={match.id}
                            comments={activeComments}
                            activeGameNumber={activeGameNumber}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            commentType="PLAYER_HIGHLIGHT"
                            commentTypes={['PLAYER_HIGHLIGHT']}
                            title={"\u7cbe\u5f69\u53d1\u6325"}
                        />
                    </div>
                    <div className="min-h-[250px] flex-1 overflow-hidden rounded-3xl border border-rose-500/20 bg-rose-500/5">
                        <CommentsSection
                            matchId={match.id}
                            comments={activeComments}
                            activeGameNumber={activeGameNumber}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            commentType="MATCH_FIXING_SUSPECT"
                            commentTypes={['MATCH_FIXING_SUSPECT']}
                            title={"\u7591\u4f3c\u5047\u8d5b"}
                        />
                    </div>
                    <div className="min-h-[250px] flex-1 overflow-hidden rounded-3xl border border-cyan-500/20 bg-cyan-500/5">
                        <CommentsSection
                            matchId={match.id}
                            comments={activeComments}
                            activeGameNumber={activeGameNumber}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            commentType="POST_MATCH_A"
                            commentTypes={['POST_MATCH_A', 'POST_MATCH_B', 'POST_MATCH_C', 'POST_MATCH_D']}
                            title={"\u8d5b\u573a\u9ad8\u5149\u70b9\u8bc4"}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}



