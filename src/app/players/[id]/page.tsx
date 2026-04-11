import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import TeamLogo from '@/components/TeamLogo';
import ChampionImage from '@/components/ChampionImage';
import PlayerPhoto from '@/components/player/PlayerPhoto';
import PlayerPhotoUpload from '@/components/player/PlayerPhotoUpload';
import PlayerDetailTabs from '@/components/player/PlayerDetailTabs';
import PlayerMatchHistory from '@/components/player/PlayerMatchHistory';
import PlayerRankView from '@/components/player/PlayerRankView';
import { prisma } from '@/lib/db';
import { getPlayerRankViewData } from '@/lib/player-rank';
import { getTeamShortDisplayName } from '@/lib/team-display';
import { format } from 'date-fns';
import { parseJsonArray } from '@/lib/player-snapshot';
import { sortByStartTimeDesc } from '@/lib/time-utils';

export const dynamic = 'force-dynamic';

function normalize(value: unknown) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return Number(value).toFixed(digits);
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${Number(value).toFixed(digits)}%`;
}

function formatSignedNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  const fixed = Number(value).toFixed(digits);
  return Number(value) > 0 ? `+${fixed}` : fixed;
}

function formatDateTime(value: unknown) {
  if (!value) return '--';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '--';
  return format(parsed, 'yyyy-MM-dd HH:mm');
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}


function normalizeRoleKey(value: unknown) {
  const raw = String(value || '').trim();
  const role = raw.toUpperCase();
  if (role === 'TOP' || role === 'TOPLANE' || raw === '上' || raw === '上单') return 'TOP';
  if (role === 'JUN' || role === 'JUNGLE' || role === 'JG' || raw === '野' || raw === '打野') return 'JUN';
  if (role === 'MID' || role === 'MIDDLE' || raw === '中' || raw === '中单') return 'MID';
  if (role === 'ADC' || role === 'BOT' || role === 'BOTTOM' || role === 'CARRY' || raw === '下' || raw === '下路') return 'ADC';
  if (role === 'SUP' || role === 'SUPPORT' || raw === '辅' || raw === '辅助') return 'SUP';
  return role;
}

function parsePlayersBlob(blob: unknown): any[] {
  if (!blob) return [];
  if (Array.isArray(blob)) return blob as any[];
  const parsed = parseJsonObject(blob) as any;
  if (Array.isArray(parsed.players)) return parsed.players as any[];
  if (Array.isArray(parsed.damage_data)) return parsed.damage_data as any[];
  if (Array.isArray(parsed.teamA?.players) || Array.isArray(parsed.teamB?.players)) {
    return [...((parsed.teamA?.players || []) as any[]), ...((parsed.teamB?.players || []) as any[])];
  }
  try {
    const json = JSON.parse(String(blob));
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.players)) return json.players;
    if (Array.isArray(json?.damage_data)) return json.damage_data;
  } catch {
    return [];
  }
  return [];
}

function readAnalysisPayload(value: unknown): Record<string, any> {
  return parseJsonObject(value) as Record<string, any>;
}

function findPlayerStats(rows: any[], playerKey: string, roleKey: string) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const exact = rows.find((item: any) => normalize(item?.name || item?.player || item?.player_name || item?.summonerName) === playerKey);
  if (exact) return exact;
  if (!roleKey) return null;
  const byRole = rows.find((item: any) => normalizeRoleKey(item?.role || item?.position || item?.lane) === roleKey);
  return byRole || null;
}

function extractChampionName(stats: any) {
  return String(stats?.hero || stats?.champion || stats?.championName || stats?.character || 'Unknown').trim() || 'Unknown';
}

function extractDamage(stats: any) {
  return toNumber(stats?.damage ?? stats?.damageToChampions ?? stats?.dmg ?? 0);
}

function extractKdaText(stats: any) {
  const kills = toNumber(stats?.kills ?? stats?.k ?? 0);
  const deaths = toNumber(stats?.deaths ?? stats?.d ?? 0);
  const assists = toNumber(stats?.assists ?? stats?.a ?? 0);
  return String(kills) + '/' + String(deaths) + '/' + String(assists);
}

function buildSnapshotCoverage(snapshot: any) {
  if (!snapshot) {
    return {
      label: '未同步',
      detail: '当前还没有同步到这名选手的快照数据。',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  if (snapshot.overallScore !== null && snapshot.overallScore !== undefined) {
    return {
      label: '完整覆盖',
      detail: '赛事统计与当前状态算法都已同步，可直接用于可视化查询。',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  return {
    label: '部分覆盖',
    detail: '赛事统计已同步，但当前状态算法字段仍待补齐。',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  };
}

function resolveBadgeClass(label: string) {
  if (label.includes('火热')) return 'bg-red-50 text-red-700 border-red-200';
  if (label.includes('良好')) return 'bg-cyan-50 text-cyan-700 border-cyan-200';
  if (label.includes('稳定')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (label.includes('偏弱')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (label.includes('低迷')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (label.includes('抗压')) return 'bg-orange-50 text-orange-700 border-orange-200';
  if (label.includes('对线强')) return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
  if (label.includes('上升')) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (label.includes('下滑')) return 'bg-stone-100 text-stone-700 border-stone-300';
  if (label.includes('绝活')) return 'bg-violet-50 text-violet-700 border-violet-200';
  if (label.includes('样本少')) return 'bg-slate-100 text-slate-700 border-slate-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

function roleLabel(role: string) {
  const upper = String(role || '').toUpperCase();
  if (upper === 'TOP') return '上单';
  if (upper === 'JUN') return '打野';
  if (upper === 'MID') return '中单';
  if (upper === 'ADC') return '下路';
  if (upper === 'SUP') return '辅助';
  return upper || '未知位置';
}

function buildSummaryItems(snapshot: any) {
  return [
    { label: '总评价', value: snapshot?.evaluationLabel || '待评估' },
    { label: '总分', value: formatNumber(snapshot?.overallScore, 1) },
    { label: '赛区分', value: formatNumber(snapshot?.relativeScore, 1) },
    { label: 'Z 值', value: formatNumber(snapshot?.relativeZScore, 2) },
    { label: '可信', value: formatNumber(snapshot?.confidence, 1) },
    { label: '赛事样本', value: String(snapshot?.games ?? '--') },
    { label: '当前近期样本', value: String(snapshot?.currentRecentGames ?? '--') },
    { label: '当前总样本', value: String(snapshot?.currentTotalGames ?? '--') },
  ];
}

function buildMetricGroups(snapshot: any) {
  return [
    {
      title: '赛事统计',
      items: [
        ['KDA', formatNumber(snapshot?.kda, 2)],
        ['胜率', formatPercent(snapshot?.winRatePct, 1)],
        ['场均击杀', formatNumber(snapshot?.avgKills, 1)],
        ['场均死亡', formatNumber(snapshot?.avgDeaths, 1)],
        ['场均助攻', formatNumber(snapshot?.avgAssists, 1)],
        ['参团率', formatPercent(snapshot?.killParticipationPct, 1)],
        ['GPM', formatNumber(snapshot?.goldPerMin, 1)],
        ['CSPM', formatNumber(snapshot?.csPerMin, 2)],
        ['DPM', formatNumber(snapshot?.damagePerMin, 0)],
        ['输出占比', formatPercent(snapshot?.damageSharePct, 1)],
        ['视野评分/分', formatNumber(snapshot?.visionScorePerMin, 2)],
        ['做眼/分', formatNumber(snapshot?.wardsPerMin, 2)],
        ['排眼/分', formatNumber(snapshot?.wardsClearedPerMin, 2)],
        ['真眼/分', formatNumber(snapshot?.visionWardsPerMin, 2)],
      ],
    },
    {
      title: '15 分钟对线',
      items: [
        ['15分经济差', formatSignedNumber(snapshot?.goldDiffAt15, 1)],
        ['15分补刀差', formatSignedNumber(snapshot?.csDiffAt15, 2)],
        ['15分经验差', formatSignedNumber(snapshot?.xpDiffAt15, 1)],
        ['一血参与率', formatPercent(snapshot?.firstBloodParticipationPct, 1)],
        ['一血被害率', formatPercent(snapshot?.firstBloodVictimPct, 1)],
        ['对线评分', formatNumber(snapshot?.laneScore, 1)],
      ],
    },
    {
      title: '当前状态算法',
      items: [
        ['状态分', formatNumber(snapshot?.stateScore, 1)],
        ['熟练度分', formatNumber(snapshot?.masteryScore, 1)],
        ['趋势分', formatNumber(snapshot?.trendScore, 1)],
        ['当前近期胜率', formatPercent(snapshot?.recentWinRatePct, 1)],
        ['当前生涯胜率', formatPercent(snapshot?.careerWinRatePct, 1)],
        ['当前近期 KDA', formatNumber(snapshot?.recentKda, 2)],
        ['当前生涯 KDA', formatNumber(snapshot?.careerKda, 2)],
        ['当前 GPM', formatNumber(snapshot?.localGoldPerMin, 1)],
        ['当前 CSPM', formatNumber(snapshot?.localCsPerMin, 2)],
        ['当前 DPM', formatNumber(snapshot?.localDamagePerMin, 0)],
        ['当前承伤/分', formatNumber(snapshot?.localDamageTakenPerMin, 0)],
        ['当前参团率', formatPercent(snapshot?.localKillParticipationPct, 1)],
        ['当前视野/分', formatNumber(snapshot?.localVisionPerMin, 2)],
        ['当前综合表现', formatNumber(snapshot?.localScore, 1)],
      ],
    },
  ];
}

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ snapshot?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { snapshot: snapshotKey, tab } = await searchParams;
  const activeTab = tab === 'rank' ? 'rank' : 'match';

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      team: true,
      statSnapshots: {
        orderBy: [{ updatedAt: 'desc' }, { games: 'desc' }],
      },
    },
  });

  if (!player) return notFound();

  const canonicalCandidates = await prisma.player.findMany({
    where: { name: player.name },
    include: {
      team: true,
      statSnapshots: {
        orderBy: [{ updatedAt: 'desc' }, { games: 'desc' }],
      },
    },
  });

  const scoreCanonicalPlayer = (candidate: any) => {
    const snapshots = candidate.statSnapshots || [];
    let score = snapshots.length * 5;
    score += snapshots.reduce((acc: number, item: any) => acc + toNumber(item.games), 0) * 0.05;
    if (snapshots.some((item: any) => item.overallScore !== null && item.overallScore !== undefined)) score += 20;
    if (candidate.teamId === player.teamId) score += 2;
    score += new Date(candidate.updatedAt || 0).getTime() * 0.000000000001;
    return score;
  };

  const canonicalPlayer = canonicalCandidates
    .slice()
    .sort((left: any, right: any) => scoreCanonicalPlayer(right) - scoreCanonicalPlayer(left))[0] || player;

  if (canonicalPlayer.id !== player.id) {
    const currentSnapshotCount = player.statSnapshots.length;
    const canonicalSnapshotCount = canonicalPlayer.statSnapshots.length;
    const sameRole = normalizeRoleKey(canonicalPlayer.role) === normalizeRoleKey(player.role);
    const scoreDelta = scoreCanonicalPlayer(canonicalPlayer) - scoreCanonicalPlayer(player);
    const shouldRedirect = canonicalSnapshotCount > 0 && sameRole && (currentSnapshotCount === 0 || scoreDelta > 10);

    if (shouldRedirect) {
      const hasRequestedSnapshot = snapshotKey
        ? canonicalPlayer.statSnapshots.some((item: any) => item.sourceKey === snapshotKey)
        : false;

      const nextUrl = hasRequestedSnapshot
        ? `/players/${canonicalPlayer.id}?snapshot=${encodeURIComponent(String(snapshotKey || ''))}`
        : `/players/${canonicalPlayer.id}`;

      redirect(nextUrl);
    }
  }

  const activeSnapshot = canonicalPlayer.statSnapshots.find((item: any) => item.sourceKey === snapshotKey) || canonicalPlayer.statSnapshots[0] || null;
  const labels = activeSnapshot ? parseJsonArray(activeSnapshot.labelsJson) : [];
  const insights = activeSnapshot ? parseJsonArray(activeSnapshot.insightsJson) : [];
  const snapshotExtra = activeSnapshot ? parseJsonObject(activeSnapshot.extraJson) : {};
  const coverage = buildSnapshotCoverage(activeSnapshot);

  const normalizeTournamentAliasKey = (value: unknown) => {
    const stopwords = new Set(['season', '赛季', 'unknown', '未知', 'tournament', '赛事', 'vs', 'versus', 'regular', 'playoffs', 'group', 'stage', 'swiss', 'playin']);
    const normalizeToken = (token: string) => {
      if (token === 'playoff' || token === 'playoffs' || token === '季后赛') return 'playoffs';
      if (token === 'group' || token === 'groups') return 'group';
      if (token === 'stage' || token === '阶段') return 'stage';
      return token;
    };

    return String(value || '')
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map(normalizeToken)
      .filter((token) => !stopwords.has(token))
      .sort()
      .join(' ');
  };

  const snapshotScore = (item: any) => {
    let score = 0;
    if (item.overallScore !== null && item.overallScore !== undefined) score += 5;
    score += toNumber(item.games) * 0.01;
    if (item.source === 'oracleselixir') score += 1;
    if (item.source === 'golgg') score += 0.8;
    if (item.source === 'lolesports_official') score += 0.6;
    score += new Date(item.updatedAt || 0).getTime() * 0.000000000001;
    return score;
  };

  const snapshotCards = Array.from(
    canonicalPlayer.statSnapshots.reduce((acc: Map<string, any>, item: any) => {
      const key = `${String(item.seasonYear || '')}::${String(item.league || '')}::${normalizeTournamentAliasKey(item.tournamentName)}`;
      const existing = acc.get(key);
      if (!existing || snapshotScore(item) > snapshotScore(existing)) {
        acc.set(key, item);
      }
      return acc;
    }, new Map<string, any>()).values(),
  ).sort((left: any, right: any) => {
    const rightMs = new Date(right.updatedAt || 0).getTime();
    const leftMs = new Date(left.updatedAt || 0).getTime();
    return rightMs - leftMs;
  });

  const teamNameKeys = new Set(
    [canonicalPlayer.team.name, canonicalPlayer.team.shortName, activeSnapshot?.teamName, activeSnapshot?.teamShortName, activeSnapshot?.mappedTeamName]
      .map((value) => normalize(value))
      .filter(Boolean),
  );

  const allTeams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  });

  const candidateTeamIds = new Set<string>([canonicalPlayer.teamId]);
  for (const team of allTeams) {
    const matchByName = teamNameKeys.has(normalize(team.name));
    const matchByShortName = team.shortName ? teamNameKeys.has(normalize(team.shortName)) : false;
    if (matchByName || matchByShortName) {
      candidateTeamIds.add(team.id);
    }
  }

  const candidateTeamIdList = Array.from(candidateTeamIds);
  const rawRelevantMatches = await prisma.match.findMany({
    where: {
      status: 'FINISHED',
      OR: candidateTeamIdList.flatMap((teamId) => [{ teamAId: teamId }, { teamBId: teamId }]),
    },
    include: {
      teamA: true,
      teamB: true,
      games: true,
    },
  });
  const relevantMatches = sortByStartTimeDesc(rawRelevantMatches);

  const games = (relevantMatches as any[])
    .flatMap((match: any) =>
      (match.games as any[]).map((game: any) => ({
        ...game,
        match,
      })),
    )
    .sort((left: any, right: any) => {
      const leftMs = left.match.startTime ? new Date(left.match.startTime).getTime() : 0;
      const rightMs = right.match.startTime ? new Date(right.match.startTime).getTime() : 0;
      return rightMs - leftMs;
    })
    .slice(0, 80);

  let totalGames = 0;
  let wins = 0;
  const heroStats: Record<string, { games: number; wins: number }> = {};
  const matchHistory: any[] = [];
  const playerKey = normalize(canonicalPlayer.name);
  const playerRoleKey = normalizeRoleKey(canonicalPlayer.role);

  games.forEach((game: any) => {
    try {
      const teamAId = String(game.match.teamAId || '');
      const teamBId = String(game.match.teamBId || '');
      let myTeamId = candidateTeamIds.has(teamAId) ? teamAId : candidateTeamIds.has(teamBId) ? teamBId : '';
      let mySide: 'A' | 'B' | '' = myTeamId === teamAId ? 'A' : myTeamId === teamBId ? 'B' : '';
      const analysis = readAnalysisPayload(game.analysisData);

      let sideAPlayers = parsePlayersBlob(game.teamAStats);
      let sideBPlayers = parsePlayersBlob(game.teamBStats);
      if (sideAPlayers.length === 0) {
        sideAPlayers = (analysis.teamA?.players || []) as any[];
      }
      if (sideBPlayers.length === 0) {
        sideBPlayers = (analysis.teamB?.players || []) as any[];
      }

      const pickFromSide = (side: 'A' | 'B', sidePlayers: any[]) => {
        const stats = findPlayerStats(sidePlayers, playerKey, playerRoleKey);
        if (!stats) return null;
        return { stats, side };
      };

      let picked: { stats: any; side: 'A' | 'B' } | null = null;
      if (mySide === 'A') picked = pickFromSide('A', sideAPlayers);
      if (!picked && mySide === 'B') picked = pickFromSide('B', sideBPlayers);
      if (!picked) picked = pickFromSide('A', sideAPlayers);
      if (!picked) picked = pickFromSide('B', sideBPlayers);

      if (!picked) {
        const analysisAPlayers = (analysis.teamA?.players || []) as any[];
        const analysisBPlayers = (analysis.teamB?.players || []) as any[];
        picked = pickFromSide('A', analysisAPlayers) || pickFromSide('B', analysisBPlayers);
      }

      if (!picked && Array.isArray(analysis.damage_data)) {
        const stats = findPlayerStats(analysis.damage_data as any[], playerKey, playerRoleKey);
        if (stats) {
          picked = { stats, side: mySide === 'B' ? 'B' : 'A' };
        }
      }

      if (!picked) return;

      if (!mySide) mySide = picked.side;
      if (!myTeamId) {
        myTeamId = mySide === 'A' ? teamAId : teamBId;
      }
      if (!myTeamId) return;

      totalGames += 1;
      const hero = extractChampionName(picked.stats);

      const winnerRaw = String(game.winnerId || '').trim();
      let isWin = winnerRaw.length > 0 && winnerRaw === myTeamId;
      if (!isWin && /^(BLUE|RED)$/i.test(winnerRaw)) {
        const winnerTeamId = winnerRaw.toUpperCase() === 'BLUE' ? String(game.blueSideTeamId || '') : String(game.redSideTeamId || '');
        isWin = winnerTeamId.length > 0 && winnerTeamId === myTeamId;
      }
      if (isWin) wins += 1;

      if (!heroStats[hero]) {
        heroStats[hero] = { games: 0, wins: 0 };
      }
      heroStats[hero].games += 1;
      if (isWin) heroStats[hero].wins += 1;

      const opponent = myTeamId === teamAId ? game.match.teamB : myTeamId === teamBId ? game.match.teamA : null;

      matchHistory.push({
        gameId: game.id,
        matchId: game.matchId,
        date: game.match.startTime,
        opponent,
        hero,
        result: isWin ? 'WIN' : 'LOSS',
        damage: extractDamage(picked.stats),
        kda: extractKdaText(picked.stats),
        gameNumber: game.gameNumber,
        tournament: game.match.tournament || '\u672a\u77e5\u8d5b\u4e8b',
      });
    } catch (error) {
      console.error('\u89e3\u6790\u9009\u624b\u6bd4\u8d5b\u8bb0\u5f55\u5931\u8d25', error);
    }
  });

  const topHeroes = Object.entries(heroStats)
    .sort(([, left], [, right]) => right.games - left.games || right.wins - left.wins)
    .slice(0, 5);

  const rankData = activeTab === 'rank' ? await getPlayerRankViewData(canonicalPlayer.id) : null;
  const matchHref = snapshotKey
    ? `/players/${canonicalPlayer.id}?snapshot=${encodeURIComponent(String(snapshotKey))}`
    : `/players/${canonicalPlayer.id}`;
  const rankHref = `/players/${canonicalPlayer.id}?tab=rank`;

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-8 shadow-2xl">
        <div className="absolute right-0 top-0 p-4 opacity-10 pointer-events-none">
          <span className="text-[150px] font-black leading-none tracking-tighter text-white uppercase">{canonicalPlayer.name}</span>
        </div>

        <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-end">
          <div className="relative">
            <PlayerPhotoUpload
              playerId={canonicalPlayer.id}
              initialPhoto={canonicalPlayer.photo}
              playerName={canonicalPlayer.name}
            />
            <div className="absolute -bottom-2 -right-2 rounded-full border border-slate-700 bg-slate-900 p-2 shadow-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800">
                <span className="text-[10px] font-bold text-blue-400">{roleLabel(canonicalPlayer.role)}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-2 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <h1 className="text-5xl font-black tracking-tight text-white">{canonicalPlayer.name}</h1>
              {activeSnapshot?.evaluationLabel ? (
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${resolveBadgeClass(activeSnapshot.evaluationLabel)}`}>
                  {activeSnapshot.evaluationLabel}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400 md:justify-start">
              <div className="flex items-center gap-2">
                <TeamLogo src={canonicalPlayer.team.logo} name={canonicalPlayer.team.name} size={24} className="h-6 w-6 opacity-80 grayscale transition-all hover:grayscale-0" region={canonicalPlayer.team.region} />
                <span className="text-lg font-bold">{getTeamShortDisplayName(canonicalPlayer.team)}</span>
              </div>
              <span className="text-slate-600">/</span>
              <span className="font-medium">{roleLabel(canonicalPlayer.role)} · {activeSnapshot?.league || canonicalPlayer.team.region}</span>
              {activeSnapshot?.tournamentName ? <span className="text-slate-500">{activeSnapshot.tournamentName}</span> : null}
            </div>
            <div className="pt-2 flex justify-center md:justify-start">
              <PlayerDetailTabs activeTab={activeTab} matchHref={matchHref} rankHref={rankHref} />
            </div>
          </div>

          <div className="hidden gap-6 border-l border-slate-700/50 pl-6 md:flex">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">当前总分</p>
              <p className="text-3xl font-black text-blue-400">{formatNumber(activeSnapshot?.overallScore, 1)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">赛区分</p>
              <p className="text-3xl font-black text-violet-400">{formatNumber(activeSnapshot?.relativeScore, 1)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">赛事胜率</p>
              <p className="text-3xl font-black text-emerald-400">{formatPercent(activeSnapshot?.winRatePct, 1)}</p>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'rank' ? (
        rankData ? (
          <PlayerRankView data={rankData} />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
            当前还没有同步到这名选手的 Rank 数据，请先接入账号映射后再查看。
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="mb-5 text-lg font-bold text-white">当前状态摘要</h3>
                <div className="grid grid-cols-2 gap-3">
                  {buildSummaryItems(activeSnapshot).map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="text-xs font-bold text-slate-500">{item.label}</div>
                      <div className="mt-1 text-lg font-black text-slate-100">{item.value}</div>
                    </div>
                  ))}
                </div>
                {labels.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {labels.map((label) => (
                      <span key={label} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${resolveBadgeClass(label)}`}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="mb-5 text-lg font-bold text-white">同步状态</h3>
                <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${coverage.badgeClass}`}>{coverage.label}</span>
                    <span className="text-sm text-slate-300">{coverage.detail}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="text-xs font-bold text-slate-500">最近同步</div>
                      <div className="mt-1 text-sm font-bold text-slate-100">{formatDateTime(activeSnapshot?.syncedAt)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="text-xs font-bold text-slate-500">来源更新时间</div>
                      <div className="mt-1 text-sm font-bold text-slate-100">{formatDateTime((snapshotExtra as any).externalUpdatedAt || activeSnapshot?.updatedAt)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="text-xs font-bold text-slate-500">数据来源</div>
                      <div className="mt-1 text-sm font-bold text-slate-100">{activeSnapshot?.source || '--'}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="text-xs font-bold text-slate-500">覆盖状态</div>
                      <div className="mt-1 text-sm font-bold text-slate-100">{activeSnapshot?.overallScore !== null && activeSnapshot?.overallScore !== undefined ? '状态算法已接入' : '仅赛事统计已接入'}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="text-xs font-bold text-slate-500">映射队伍 / 位置</div>
                      <div className="mt-1 text-sm font-bold text-slate-100">{activeSnapshot?.mappedTeamName || '--'} / {activeSnapshot?.mappedRole || '--'}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="text-xs font-bold text-slate-500">样本 / 映射可信</div>
                      <div className="mt-1 text-sm font-bold text-slate-100">{activeSnapshot?.sampleGames ?? '--'} 场 / {formatNumber(activeSnapshot?.mappingConfidence, 1)}</div>
                    </div>
                  </div>
                  {activeSnapshot?.sourceUrl ? (
                    <div className="text-sm text-slate-300">
                      来源链接：<a href={activeSnapshot.sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2">打开原始来源</a>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="mb-5 text-lg font-bold text-white">赛事快照</h3>
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {snapshotCards.map((item) => (
                    <Link
                      key={item.sourceKey}
                      href={`/players/${canonicalPlayer.id}?snapshot=${encodeURIComponent(item.sourceKey)}`}
                      className={`block rounded-xl border px-4 py-3 transition-all ${activeSnapshot?.sourceKey === item.sourceKey ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-100">{item.tournamentName}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.source} · {item.games} 场 · {formatPercent(item.winRatePct, 1)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-violet-300">赛区分 {formatNumber(item.relativeScore, 1)}</div>
                          <div className="text-xs text-slate-500">更新 {format(new Date(item.updatedAt), 'MM-dd HH:mm')}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {snapshotCards.length === 0 ? <div className="text-sm text-slate-500">当前还没有同步到选手快照数据。</div> : null}
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="mb-5 text-lg font-bold text-white">常用英雄</h3>
                <div className="space-y-3">
                  {topHeroes.length === 0 ? (
                    <div className="text-sm text-slate-500">当前没有可展示的英雄记录。</div>
                  ) : (
                    topHeroes.map(([hero, stats]) => (
                      <div key={hero} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
                            <ChampionImage name={hero} className="h-full w-full" fallbackContent={<div className="flex h-full w-full items-center justify-center text-xs text-slate-500">{hero.slice(0, 1)}</div>} />
                          </div>
                          <div>
                            <div className="font-bold text-slate-100">{hero}</div>
                            <div className="text-xs text-slate-500">{stats.games} 场</div>
                          </div>
                        </div>
                        <div className="text-right text-sm font-bold text-emerald-300">{formatPercent((stats.wins / stats.games) * 100, 0)}</div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-white">完整统计数据</h3>
                  <div className="text-sm text-slate-400">来源：{activeSnapshot?.source || '未同步'}{activeSnapshot?.mappedTeamName ? ` · 映射 ${activeSnapshot.mappedTeamName}` : ''}</div>
                </div>
                {activeSnapshot ? (
                  <div className="mt-5 space-y-6">
                    {buildMetricGroups(activeSnapshot).map((group) => (
                      <div key={group.title}>
                        <h4 className="mb-3 text-sm font-bold text-slate-300">{group.title}</h4>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {group.items.map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
                              <div className="text-xs font-bold text-slate-500">{label}</div>
                              <div className="mt-1 text-base font-bold text-slate-100">{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-slate-500">当前还没有同步到可展示的快照数据。</div>
                )}
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="mb-4 text-lg font-bold text-white">状态说明</h3>
                <div className="space-y-3 text-sm text-slate-300">
                  {insights.length > 0 ? (
                    insights.map((item, index) => (
                      <div key={`${item}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">{item}</div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3 text-slate-500">当前没有额外说明，建议结合比赛记录一起查看。</div>
                  )}
                </div>
              </section>

              <PlayerMatchHistory player={canonicalPlayer} initialHistory={matchHistory} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
            <div>页面内的“当前状态算法”来自 BP 项目同步的选手状态快照；“比赛记录”仍然保留原有对局明细，方便你交叉核对。</div>
            <div className="mt-2">如果某名选手暂时没有快照，一般表示该赛区或该赛事尚未完成同步，不代表这名选手没有历史比赛。</div>
          </div>
        </>
      )}
    </div>
  );
}

