import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { getSystemConfig } from '@/lib/config-service';
import { buildEventMetaRowsFromMatches, buildEventMetaRowsFromSnapshots } from '@/lib/event-meta';
import { ALL_EVENT_OPTION, buildConfiguredEventBundles } from '@/lib/event-option-mapping';
import { normalizeLeagueBucket, normalizeRole } from '@/lib/player-snapshot';
import { getCurrentSeasonRankEffectiveScope } from '@/lib/rank-effective-pool';

export type RankModuleSortKey =
  | 'activityScore'
  | 'leaguePoints'
  | 'rankTier'
  | 'winRate14d'
  | 'confidence'
  | 'lastGameAt';

export type RankActivityOption = 'ALL' | 'HOT' | 'ACTIVE' | 'NORMAL' | 'LOW';
export type RankAccountStatusOption = 'ALL' | 'VERIFIED' | 'SUSPECT' | 'PRIMARY_ONLY';
export type RankViewMode = 'summary' | 'rank';

export type RankModuleSearchParams = {
  view?: string;
  year?: string;
  tournament?: string;
  search?: string;
  region?: string;
  role?: string;
  activity?: string;
  accountStatus?: string;
  rankSort?: string;
  rankOrder?: string;
  debug?: boolean;
};

type RankChampion = {
  championName: string;
  games?: number;
  winRate?: number;
};

export type RankLeaderboardRowData = {
  id: string;
  playerId: string;
  region: string;
  playerName: string;
  teamName: string;
  teamShortName: string;
  teamLogo: string | null;
  role: string;
  photo: string | null;
  currentTier: string;
  currentRank: string;
  leaguePoints: number | null;
  games7d: number;
  games14d: number;
  winRate14d: number | null;
  activityLabel: string;
  activityScore: number;
  topChampions: RankChampion[];
  accountCount: number;
  confidenceLabel: string;
  confidenceScore: number;
  primaryAccountSummary: string;
  lastGameAt: Date | null;
  lastGameLabel: string;
  detailUrl: string;
  displayAccountName: string;
  displayPlatform: string;
  isRankCovered: boolean;
  pendingAccountCount: number;
};

export type RankModulePageData = {
  activeView: RankViewMode;
  selectedRegion: string;
  selectedYear: string;
  selectedTournament: string;
  selectedRole: string;
  selectedActivity: RankActivityOption;
  selectedAccountStatus: RankAccountStatusOption;
  selectedSortKey: RankModuleSortKey;
  selectedOrder: 'asc' | 'desc';
  searchText: string;
  regionOptions: Array<{ value: string; label: string }>;
  roleOptions: Array<{ value: string; label: string }>;
  activityOptions: Array<{ value: RankActivityOption; label: string }>;
  accountStatusOptions: Array<{ value: RankAccountStatusOption; label: string }>;
  sortOptions: Array<{ value: RankModuleSortKey; label: string }>;
  yearsByRegion: Record<string, string[]>;
  tournamentsByRegionYear: Record<string, string[]>;
  overview: {
    rankSyncedAt: Date | null;
    currentPlayerCount: number;
    rankCoveredPlayerCount: number;
    highActivityPlayerCount: number;
    avgGames7d: number;
    masterPlusPlayerCount: number;
  };
  highlights: {
    mostActivePlayer: RankLeaderboardRowData | null;
    highestLpPlayer: RankLeaderboardRowData | null;
    fastestRisingPlayer: RankLeaderboardRowData | null;
    coldestPlayer: RankLeaderboardRowData | null;
    pendingAccountCount: number;
  };
  rows: RankLeaderboardRowData[];
  debug?: Record<string, unknown>;
};

export type PlayerRankAccountCardData = {
  id: string;
  accountName: string;
  platform: string;
  regionGroup: string;
  status: string;
  source: string;
  confidence: number;
  isPrimary: boolean;
  isActiveCandidate: boolean;
  leaguePoints: number | null;
  currentTier: string;
  currentRank: string;
  games7d: number;
  games14d: number;
  winRate14d: number | null;
  lastGameAt: Date | null;
  lastGameLabel: string;
  tags: string[];
};

export type PlayerRankViewData = {
  playerId: string;
  playerName: string;
  teamName: string;
  teamShortName: string | null;
  role: string;
  photo: string | null;
  summary: {
    currentTier: string;
    currentRank: string;
    leaguePoints: number | null;
    activityLabel: string;
    activityScore: number;
    games7d: number;
    games14d: number;
    winRate14d: number | null;
    accountCount: number;
  };
  currentAccount: {
    accountName: string;
    platform: string;
    regionGroup: string;
    lastGameAt: Date | null;
    lastGameLabel: string;
    tags: string[];
  } | null;
  sync: {
    lastSyncedAt: Date | null;
    sourceLabel: string;
    confidenceLabel: string;
    confidenceScore: number;
    verificationLabel: string;
  };
  overview: Array<{ label: string; value: string; subValue?: string }>;
  accounts: PlayerRankAccountCardData[];
  recentState: {
    topChampions: RankChampion[];
    topPositions: Array<{ position: string; games: number }>;
    activityLabel: string;
    activityScore: number;
    trendLabel: string;
    trendScore: number;
  };
  trends: {
    lpPoints: Array<{ label: string; value: number }>;
    games7d: number;
    games14d: number;
    winRate14d: number | null;
  };
  meta: {
    sourceLabel: string;
    confidenceLabel: string;
    lastVerifiedAt: Date | null;
    notes: string[];
  };
};

const UI_ROLE_LABEL: Record<string, string> = {
  ALL: '全部',
  TOP: '上单',
  JUN: '打野',
  MID: '中单',
  ADC: 'ADC',
  SUP: '辅助',
  OTHER: '其他',
};

const UI_REGION_LABEL: Record<string, string> = {
  LPL: 'LPL',
  LCK: 'LCK',
  OTHER: '其他',
  WORLDS: '国际赛事',
};

const UI_ACTIVITY_OPTIONS: Array<{ value: RankActivityOption; label: string }> = [
  { value: 'ALL', label: '全部活跃度' },
  { value: 'HOT', label: '火热' },
  { value: 'ACTIVE', label: '活跃' },
  { value: 'NORMAL', label: '一般' },
  { value: 'LOW', label: '低活跃' },
];

const UI_ACCOUNT_STATUS_OPTIONS: Array<{ value: RankAccountStatusOption; label: string }> = [
  { value: 'ALL', label: '全部账号状态' },
  { value: 'VERIFIED', label: '已确认' },
  { value: 'SUSPECT', label: '自动补齐' },
  { value: 'PRIMARY_ONLY', label: '仅主账号' },
];

const UI_SORT_OPTIONS: Array<{ value: RankModuleSortKey; label: string }> = [
  { value: 'activityScore', label: '活跃度' },
  { value: 'leaguePoints', label: 'LP' },
  { value: 'rankTier', label: '当前段位' },
  { value: 'winRate14d', label: '近14天胜率' },
  { value: 'confidence', label: '可信度' },
  { value: 'lastGameAt', label: '最近活跃' },
];

const UNRANKED_LABEL = '未上榜';
const NO_LINKED_ACCOUNT_LABEL = '未绑定可展示的 Rank 账号';
const NO_RECENT_GAMES_LABEL = '暂无近期对局';

function formatUiActivityLabel(score: number, fallback?: string | null) {
  const value = String(fallback || '').trim();
  if (['Hot', 'Active', 'Normal', 'Low', 'No data', '火热', '活跃', '一般', '沉寂', '无数据', '低活跃'].includes(value)) {
    if (value === 'Hot') return '火热';
    if (value === 'Active') return '活跃';
    if (value === 'Normal') return '一般';
    if (value === 'Low') return '低活跃';
    if (value === 'No data') return '无数据';
    return value;
  }
  if (score >= 80) return '火热';
  if (score >= 60) return '活跃';
  if (score >= 35) return '一般';
  if (score > 0) return '低活跃';
  return '无数据';
}

function formatUiConfidenceLabel(score: number) {
  if (score >= 0.85) return '高';
  if (score >= 0.7) return '中高';
  if (score >= 0.55) return '中';
  if (score > 0) return '自动补齐';
  return '未知';
}

function formatUiVerificationLabel(score: number, suspectCount: number) {
  if (suspectCount > 0 && score < 0.85) return '系统自动补齐';
  if (score >= 0.85) return '已确认';
  if (score >= 0.55) return '建议复核';
  return '待校验';
}

function formatUiLastGameLabel(value: Date | null) {
  if (!value) return '暂无近期对局';
  const diffMs = Date.now() - value.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < dayMs) return '今天';
  const days = Math.floor(diffMs / dayMs);
  if (days <= 1) return '昨天';
  return `${days} 天前`;
}

function formatUiTrendLabel(score: number) {
  if (score >= 20) return '最近3天明显上升';
  if (score >= 5) return '最近3天小幅上升';
  if (score <= -20) return '最近3天明显下滑';
  if (score <= -5) return '最近3天小幅下滑';
  return '最近3天基本持平';
}

function formatUiPrimaryAccountSummary(accountName: string, platform: string, lastGameLabel: string) {
  if (!accountName) return '未绑定可展示的 Rank 账号';
  return `主号：${accountName} / ${platform || '--'} / 最近活跃：${lastGameLabel}`;
}

function formatUiRankText(tier: string | null | undefined, rank: string | null | undefined) {
  const safeTier = String(tier || '').trim();
  const safeRank = String(rank || '').trim();
  return [safeTier, safeRank].filter(Boolean).join(' ') || '未上榜';
}

function resolveRankText(tier: string | null | undefined, rank: string | null | undefined) {
  return formatUiRankText(tier, rank);
}

function matchesUiActivityFilter(label: string, filter: RankActivityOption) {
  if (filter === 'ALL') return true;
  if (filter === 'HOT') return label === '火热';
  if (filter === 'ACTIVE') return label === '活跃';
  if (filter === 'NORMAL') return label === '一般';
  if (filter === 'LOW') return ['低活跃', '无数据', '沉寂'].includes(label);
  return true;
}
function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRankIdentityText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\u4e00-\u9fa5]+/g, '');
}

function isPlaceholderPlayerName(value: string) {
  const trimmed = String(value || '').trim();
  return /^[A-Z]\d{1,2}$/i.test(trimmed);
}

function getActivityLabel(score: number, fallback?: string | null) {
  return formatUiActivityLabel(score, fallback);
}

function getConfidenceLabel(score: number) {
  return formatUiConfidenceLabel(score);
}

function getVerificationLabel(score: number, suspectCount: number) {
  return formatUiVerificationLabel(score, suspectCount);
}

function getRankTierWeight(tier: string, rank: string) {
  const tierUpper = String(tier || '').toUpperCase();
  const rankUpper = String(rank || '').toUpperCase();
  const tierOrder: Record<string, number> = {
    CHALLENGER: 9,
    GRANDMASTER: 8,
    MASTER: 7,
    DIAMOND: 6,
    EMERALD: 5,
    PLATINUM: 4,
    GOLD: 3,
    SILVER: 2,
    BRONZE: 1,
    IRON: 0,
    UNRANKED: -1,
  };
  const divisionOrder: Record<string, number> = {
    I: 4,
    II: 3,
    III: 2,
    IV: 1,
  };

  return (tierOrder[tierUpper] ?? -2) * 10 + (divisionOrder[rankUpper] ?? 0);
}

function formatLastGameLabel(value: Date | null) {
  if (!value) return '暂无近期对局';
  const now = Date.now();
  const diffMs = now - value.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < dayMs) return '今天';
  const days = Math.floor(diffMs / dayMs);
  if (days <= 1) return '昨天';
  return `${days} 天前`;
}

function parseChampionSummary(value: string | null | undefined): RankChampion[] {
  const rows = parseJsonArray<any>(value);
  return rows
    .map((item) => {
      if (typeof item === 'string') return { championName: item };
      return {
        championName: String(item?.championName || item?.name || item?.champion || '').trim(),
        games: toNullableNumber(item?.games) ?? undefined,
        winRate: toNullableNumber(item?.winRate) ?? undefined,
      };
    })
    .filter((item) => item.championName.length > 0)
    .slice(0, 3);
}

function parsePositionSummary(value: string | null | undefined) {
  const rows = parseJsonArray<any>(value);
  return rows
    .map((item) => ({
      position: String(item?.position || item?.role || '').trim(),
      games: toNumber(item?.games),
    }))
    .filter((item) => item.position.length > 0 && item.games > 0)
    .slice(0, 5);
}

function buildAccountName(account: { gameName: string; tagLine: string | null }) {
  return account.tagLine ? `${account.gameName}#${account.tagLine}` : account.gameName;
}

function isPlaceholderRankAccountLike(account: {
  gameName?: string | null;
  tagLine?: string | null;
  puuid?: string | null;
  notes?: string | null;
}) {
  const gameName = String(account?.gameName || '').trim();
  const tagLine = String(account?.tagLine || '').trim();
  const puuid = String(account?.puuid || '').trim();
  const notes = String(account?.notes || '').trim();

  if (!tagLine) return true;
  if (gameName === '待确认映射' || gameName === '自动补齐映射') return true;
  if (puuid.startsWith('manual:') && (notes.includes('自动占位') || gameName.includes('待确认') || gameName.includes('自动补齐'))) return true;
  return false;
}

function isPlaceholderDisplayAccountName(accountName: string) {
  const value = String(accountName || '').trim();
  if (!value) return true;
  return value === '待确认映射' || value.includes('待确认映射') || value === '自动补齐映射' || value.includes('自动补齐映射');
}

function deriveRankText(tier: string | null | undefined, rank: string | null | undefined) {
  return formatUiRankText(tier, rank);
}

function deriveTrendLabel(score: number) {
  return formatUiTrendLabel(score);
}

function matchesActivityFilter(label: string, filter: RankActivityOption) {
  return matchesUiActivityFilter(label, filter);
}
function buildPrimaryAccountSummary(accountName: string, platform: string, lastGameLabel: string) {
  if (!accountName) return '未绑定可展示的 Rank 账号';
  return `主号：${accountName} / ${platform || '--'} / 最近活跃：${lastGameLabel}`;
}

async function buildEventOptions(params: {
  region?: string;
  year?: string;
}) {
  const config = await getSystemConfig();
  const [snapshotMeta, matchMeta] = await Promise.all([
    prisma.playerStatSnapshot.findMany({
      select: {
        league: true,
        seasonYear: true,
        tournamentName: true,
        games: true,
        syncedAt: true,
        updatedAt: true,
      },
      orderBy: [{ syncedAt: 'desc' }, { league: 'asc' }, { seasonYear: 'desc' }, { tournamentName: 'asc' }],
    }),
    prisma.match.findMany({
      select: {
        tournament: true,
        startTime: true,
        teamA: { select: { region: true } },
        teamB: { select: { region: true } },
      },
      where: {
        tournament: { not: '' },
      },
      orderBy: [{ startTime: 'desc' }, { updatedAt: 'desc' }],
    }),
  ]);

  const eventMeta = [
    ...buildEventMetaRowsFromSnapshots(snapshotMeta),
    ...buildEventMetaRowsFromMatches(matchMeta),
  ];

  const configuredRegions = (config.regions || []).map((item) => normalizeLeagueBucket(item.id, item.name)).filter(Boolean);
  const availableRegions = Array.from(
    new Set([
      ...configuredRegions,
      ...eventMeta.map((row) => normalizeLeagueBucket(row.league, row.tournamentName)).filter(Boolean),
      'LPL',
      'LCK',
      'OTHER',
      'WORLDS',
    ]),
  ).filter((value) => value !== 'MAJOR3');

  const requestedRegion = normalizeLeagueBucket(params.region || config.defaultRegion || availableRegions[0] || 'LPL');
  const selectedRegion = availableRegions.includes(requestedRegion) ? requestedRegion : (availableRegions[0] || 'LPL');
  const regionMeta = eventMeta.filter((row) => normalizeLeagueBucket(row.league, row.tournamentName) === selectedRegion);

  const yearsByRegionMap = new Map<string, string[]>();
  for (const regionId of availableRegions) {
    const years = Array.from(
      new Set(
        eventMeta
          .filter((row) => normalizeLeagueBucket(row.league, row.tournamentName) === regionId)
          .map((row) => String(row.seasonYear || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => b.localeCompare(a));
    yearsByRegionMap.set(regionId, years);
  }

  const availableYears = yearsByRegionMap.get(selectedRegion) || [];
  const requestedYear = String(params.year || '').trim();
  const selectedYear = availableYears.includes(requestedYear)
    ? requestedYear
    : String(config.defaultYear && availableYears.includes(config.defaultYear) ? config.defaultYear : (availableYears[0] || new Date().getFullYear())).trim();

  const selectedYearRows = regionMeta
    .filter((row) => String(row.seasonYear || '').trim() === selectedYear)
    .map((row) => ({
      ...row,
      syncedAtMs: Number(row.syncedAtMs || 0),
    }));

  const bundles = buildConfiguredEventBundles(selectedYearRows, config.splits, selectedRegion);
  const tournamentsByRegionYear: Record<string, string[]> = {};

  for (const regionId of availableRegions) {
    const years = yearsByRegionMap.get(regionId) || [];
    for (const year of years) {
      const rows = eventMeta
        .filter((row) => normalizeLeagueBucket(row.league, row.tournamentName) === regionId && String(row.seasonYear || '').trim() === year)
        .map((row) => ({
          ...row,
          syncedAtMs: Number(row.syncedAtMs || 0),
        }));
      tournamentsByRegionYear[`${regionId}::${year}`] = [
        ALL_EVENT_OPTION,
        ...Array.from(new Set(buildConfiguredEventBundles(rows, config.splits, regionId).map((bundle) => bundle.display))),
      ];
    }
  }

  const sourceLabels: string[] = [];
  const confidenceScore = 0;
  const player = { rankAccounts: [] as Array<{ lastVerifiedAt?: Date | null }> };
  const accountCards: Array<{ status: string }> = [];

  return {
    availableRegions,
    selectedRegion,
    selectedYear,
    bundles,
    yearsByRegion: Object.fromEntries(Array.from(yearsByRegionMap.entries())),
    tournamentsByRegionYear,
    latestSyncedAt: snapshotMeta[0]?.syncedAt || null,
    meta: {
      sourceLabel: sourceLabels.length > 0 ? sourceLabels.join(' / ') : '未接入',
      confidenceLabel: formatUiConfidenceLabel(confidenceScore),
      lastVerifiedAt: toDate(player.rankAccounts.find((item) => item.lastVerifiedAt)?.lastVerifiedAt),
      notes: [
        '数据优先来自 Riot API，外部渠道只作为辅助校验参考。',
        '一名选手可绑定多个账号，前台默认优先展示主账号或当前活跃账号。',
        formatUiVerificationLabel(confidenceScore, accountCards.filter((item) => item.status.toUpperCase() === 'SUSPECT').length),
      ],
    },
  };
}

function mapRankRow(player: any): RankLeaderboardRowData {
  const cache = player.rankProfileCache && toNumber(player.rankProfileCache.accountCount) > 0 ? player.rankProfileCache : null;
  const realAccounts = player.rankAccounts.filter((account: any) => !isPlaceholderRankAccountLike(account));
  const preferredAccounts = realAccounts.length > 0 ? realAccounts : player.rankAccounts;
  const activeAccountIds = new Set(preferredAccounts.map((account: any) => account.id));
  const liveSummaries = player.rankRecentSummaries.filter((summary: any) => activeAccountIds.has(summary.accountId));
  const liveSnapshots = player.rankSnapshots.filter((snapshot: any) => activeAccountIds.has(snapshot.accountId));
  const cacheDisplayAccount =
    cache?.displayAccount && !isPlaceholderRankAccountLike(cache.displayAccount)
      ? cache.displayAccount
      : cache?.activeAccount && !isPlaceholderRankAccountLike(cache.activeAccount)
        ? cache.activeAccount
        : cache?.primaryAccount && !isPlaceholderRankAccountLike(cache.primaryAccount)
          ? cache.primaryAccount
          : null;
  const displayAccount = cacheDisplayAccount || preferredAccounts[0] || player.rankAccounts[0] || null;
  const latestSnapshot = liveSnapshots[0] || null;
  const displaySummary = liveSummaries.find((summary: any) => summary.accountId === displayAccount?.id) || liveSummaries[0] || null;
  const hasRealAccount = realAccounts.length > 0;
  const confidenceScore = hasRealAccount
    ? toNumber(cache?.confidenceScore ?? displayAccount?.confidence ?? 0)
    : Math.min(0.15, toNumber(cache?.confidenceScore ?? displayAccount?.confidence ?? 0.15) || 0.15);
  const activityScore = toNumber(cache?.activityScore ?? displaySummary?.activityScore ?? 0);
  const activityLabel = formatUiActivityLabel(activityScore, cache?.activityLabel ?? displaySummary?.activityLabel ?? null);
  const currentTier = String(cache?.displayTier || latestSnapshot?.tier || '').trim() || '未上榜';
  const currentRank = String(cache?.displayRank || latestSnapshot?.rank || '').trim();
  const safeCurrentTier = currentTier && currentTier !== '未上榜' ? currentTier : '未上榜';
  const leaguePoints = toNullableNumber(cache?.displayLeaguePoints ?? latestSnapshot?.leaguePoints);
  const lastGameAt = toDate(cache?.lastGameAt || displaySummary?.lastGameAt || displayAccount?.lastMatchAt);
  const accountName = displayAccount ? buildAccountName(displayAccount) : '';
  const platform = displayAccount?.platform || '--';
  const pendingAccountCount = player.rankAccounts.filter((account: any) => {
    const status = String(account.status || '').toUpperCase();
    return status === 'SUSPECT' || isPlaceholderRankAccountLike(account);
  }).length;

  return {
    id: player.id,
    playerId: player.id,
    region: player.team?.region || '',
    playerName: player.name,
    teamName: player.team?.name || '',
    teamShortName: player.team?.shortName || player.team?.name || '',
    teamLogo: player.team?.logo || null,
    role: player.role,
    photo: player.photo,
    currentTier: safeCurrentTier,
    currentRank,
    leaguePoints,
    games7d: toNumber(cache?.games7d ?? displaySummary?.games7d),
    games14d: toNumber(cache?.games14d ?? displaySummary?.games14d),
    winRate14d: toNullableNumber(cache?.winRate14d ?? displaySummary?.winRate14d),
    activityLabel,
    activityScore,
    topChampions: parseChampionSummary(cache?.topChampionsJson ?? displaySummary?.topChampionsJson),
    accountCount: preferredAccounts.length,
    confidenceLabel: formatUiConfidenceLabel(confidenceScore),
    confidenceScore,
    primaryAccountSummary: formatUiPrimaryAccountSummary(accountName, platform, formatUiLastGameLabel(lastGameAt)),
    lastGameAt,
    lastGameLabel: formatUiLastGameLabel(lastGameAt),
    detailUrl: `/players/${player.id}?tab=rank`,
    displayAccountName: accountName,
    displayPlatform: platform,
    isRankCovered: preferredAccounts.length > 0 || Boolean(cache && !isPlaceholderDisplayAccountName(String(cache.displayGameName || ''))),
    pendingAccountCount,
  };
}

function normalizeRankRoleKey(role: string) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'SUPPORT' || value === 'SUP') return 'SUP';
  if (value === 'JUNGLE' || value === 'JUN') return 'JUN';
  if (value === 'BOTTOM' || value === 'BOT' || value === 'ADC') return 'ADC';
  if (value === 'MIDDLE' || value === 'MID') return 'MID';
  if (value === 'TOP') return 'TOP';
  return value || 'OTHER';
}

function buildRankIdentityKey(input: {
  region?: string | null;
  playerName: string;
  teamName?: string | null;
  teamShortName?: string | null;
  role?: string | null;
}) {
  const regionKey = normalizeRankIdentityText(input.region || '');
  return [
    regionKey,
    normalizeRankIdentityText(input.playerName || ''),
    normalizeRankRoleKey(String(input.role || '')),
    regionKey ? '' : normalizeRankIdentityText(input.teamShortName || input.teamName || ''),
  ].join('::');
}

function buildRankRowIdentityKey(row: RankLeaderboardRowData) {
  return buildRankIdentityKey(row);
}

function rankPlayerSourceQualityScore(player: any) {
  const cache = player.rankProfileCache;
  const latestSnapshot = player.rankSnapshots?.[0] || null;
  const latestSummary = player.rankRecentSummaries?.[0] || null;
  const activeAccountCount = Array.isArray(player.rankAccounts) ? player.rankAccounts.length : 0;
  const realAccountCount = Array.isArray(player.rankAccounts)
    ? player.rankAccounts.filter((account: any) => !isPlaceholderRankAccountLike(account)).length
    : 0;
  const placeholderAccountCount = Math.max(0, activeAccountCount - realAccountCount);
  const hasRealAccounts = realAccountCount > 0;
  const hasAnyAccounts = activeAccountCount > 0;

  return [
    hasRealAccounts ? 150000 : hasAnyAccounts ? 10000 : 0,
    realAccountCount * 8000,
    -placeholderAccountCount * 1500,
    hasRealAccounts ? toNumber(cache?.games7d ?? latestSummary?.games7d) * 100 : 0,
    hasRealAccounts
      ? Math.max(0, getRankTierWeight(cache?.displayTier || latestSnapshot?.tier || '', cache?.displayRank || latestSnapshot?.rank || '')) * 100
      : 0,
    hasRealAccounts ? toNumber(cache?.displayLeaguePoints ?? latestSnapshot?.leaguePoints) : 0,
    hasRealAccounts && latestSummary?.updatedAt ? new Date(latestSummary.updatedAt).getTime() / 1000000000 : 0,
    hasRealAccounts && latestSnapshot?.snapshotAt ? new Date(latestSnapshot.snapshotAt).getTime() / 1000000000 : 0,
    cache && !hasRealAccounts ? -50000 : 0,
    player.updatedAt ? new Date(player.updatedAt).getTime() / 1000000000 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function collapseDuplicatePlayers<T extends {
  id: string;
  name: string;
  role?: string | null;
  team?: { name?: string | null; shortName?: string | null; region?: string | null };
}>(players: T[]) {
  const grouped = new Map<string, T[]>();

  for (const player of players) {
    const key = buildRankIdentityKey({
      region: player.team?.region,
      playerName: player.name,
      teamName: player.team?.name,
      teamShortName: player.team?.shortName,
      role: player.role,
    });
    const list = grouped.get(key) || [];
    list.push(player);
    grouped.set(key, list);
  }

  return Array.from(grouped.values()).map((group) => {
    if (group.length === 1) return group[0];
    return group
      .slice()
      .sort((left, right) => rankPlayerSourceQualityScore(right) - rankPlayerSourceQualityScore(left))[0];
  });
}

function rankRowQualityScore(row: RankLeaderboardRowData) {
  return [
    row.isRankCovered ? 100000 : 0,
    isPlaceholderDisplayAccountName(row.displayAccountName) ? -25000 : 25000,
    row.accountCount * 1000,
    row.activityScore * 100,
    (row.leaguePoints ?? -1),
    row.confidenceScore * 10,
    -row.pendingAccountCount * 500,
  ].reduce((sum, value) => sum + value, 0);
}

function mergeDuplicateRankRows(rows: RankLeaderboardRowData[]) {
  const grouped = new Map<string, RankLeaderboardRowData[]>();

  for (const row of rows) {
    const key = buildRankRowIdentityKey(row);
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }

  return Array.from(grouped.values()).map((group) => {
    if (group.length === 1) return group[0];

    const sorted = group
      .slice()
      .sort((left, right) => rankRowQualityScore(right) - rankRowQualityScore(left));
    const best = sorted[0];
    const withCoverage = sorted.filter((row) => row.isRankCovered);
    const withRealDisplay = sorted.filter((row) => !isPlaceholderDisplayAccountName(row.displayAccountName));
    const preferredRows = withRealDisplay.length > 0 ? withRealDisplay : withCoverage.length > 0 ? withCoverage : sorted;
    const preferredLead = preferredRows[0] || best;
    const championMap = new Map<string, RankChampion>();

    for (const row of sorted) {
      for (const champion of row.topChampions) {
        const existing = championMap.get(champion.championName);
        if (!existing || (champion.games ?? 0) > (existing.games ?? 0)) {
          championMap.set(champion.championName, champion);
        }
      }
    }

    const mergedTopChampions = Array.from(championMap.values())
      .sort((left, right) => (right.games ?? 0) - (left.games ?? 0))
      .slice(0, 3);
    const preferredPrimarySummary =
      preferredRows.find(
        (row) =>
          row.primaryAccountSummary &&
          !isPlaceholderDisplayAccountName(row.displayAccountName),
      )?.primaryAccountSummary || preferredLead.primaryAccountSummary;
    const preferredRankRow =
      preferredRows.find((row) => row.currentTier && ![UNRANKED_LABEL, 'UNRANKED'].includes(row.currentTier)) ||
      preferredLead;
    const preferredLeaguePointsRow = preferredRows.find((row) => row.leaguePoints !== null) || preferredLead;
    const preferredRecentRow = preferredRows.find((row) => row.lastGameAt) || preferredLead;

    const mergedRow: RankLeaderboardRowData = {
      ...best,
      teamName: sorted.find((row) => row.teamName.length > best.teamName.length)?.teamName || best.teamName,
      teamLogo: sorted.find((row) => row.teamLogo)?.teamLogo || best.teamLogo,
      role: normalizeRankRoleKey(best.role),
      accountCount: Math.max(...sorted.map((row) => row.accountCount)),
      confidenceScore: Math.max(...sorted.map((row) => row.confidenceScore)),
      confidenceLabel: sorted
        .slice()
        .sort((left, right) => right.confidenceScore - left.confidenceScore)[0]?.confidenceLabel || best.confidenceLabel,
      pendingAccountCount: Math.max(...preferredRows.map((row) => row.pendingAccountCount)),
      games7d: Math.max(...sorted.map((row) => row.games7d)),
      games14d: Math.max(...sorted.map((row) => row.games14d)),
      winRate14d:
        sorted.find((row) => row.winRate14d !== null)?.winRate14d ??
        best.winRate14d,
      activityScore: Math.max(...sorted.map((row) => row.activityScore)),
      activityLabel:
        sorted
          .slice()
          .sort((left, right) => right.activityScore - left.activityScore)[0]?.activityLabel || best.activityLabel,
      topChampions: mergedTopChampions.length > 0 ? mergedTopChampions : best.topChampions,
      isRankCovered: preferredRows.some((row) => row.isRankCovered),
      primaryAccountSummary:
        withCoverage.find((row) => row.primaryAccountSummary && !row.primaryAccountSummary.includes(NO_LINKED_ACCOUNT_LABEL))?.primaryAccountSummary ||
        best.primaryAccountSummary,
      detailUrl: preferredLead.detailUrl,
      playerId: preferredLead.playerId,
      id: preferredLead.id,
      displayAccountName: preferredLead.displayAccountName,
      displayPlatform: preferredLead.displayPlatform,
      currentTier:
        withCoverage.find((row) => row.currentTier !== UNRANKED_LABEL)?.currentTier ||
        best.currentTier,
      currentRank:
        withCoverage.find((row) => row.currentTier !== UNRANKED_LABEL)?.currentRank ||
        best.currentRank,
      leaguePoints:
        withCoverage.find((row) => row.leaguePoints !== null)?.leaguePoints ??
        best.leaguePoints,
      lastGameAt:
        withCoverage.find((row) => row.lastGameAt)?.lastGameAt ||
        best.lastGameAt,
      lastGameLabel:
        withCoverage.find((row) => row.lastGameAt)?.lastGameLabel ||
        best.lastGameLabel,
    };
    mergedRow.primaryAccountSummary = preferredPrimarySummary;
    mergedRow.currentTier = preferredRankRow.currentTier;
    mergedRow.currentRank = preferredRankRow.currentRank;
    mergedRow.leaguePoints = preferredLeaguePointsRow.leaguePoints;
    mergedRow.lastGameAt = preferredRecentRow.lastGameAt;
    mergedRow.lastGameLabel = preferredRecentRow.lastGameLabel;
    return mergedRow;
  });
}

function sortRankRows(rows: RankLeaderboardRowData[], sortKey: RankModuleSortKey, order: 'asc' | 'desc') {
  const factor = order === 'asc' ? 1 : -1;
  const resolveValue = (row: RankLeaderboardRowData) => {
    switch (sortKey) {
      case 'leaguePoints':
        return row.leaguePoints ?? -1;
      case 'rankTier':
        return getRankTierWeight(row.currentTier, row.currentRank);
      case 'winRate14d':
        return row.winRate14d ?? -1;
      case 'confidence':
        return row.confidenceScore;
      case 'lastGameAt':
        return row.lastGameAt ? row.lastGameAt.getTime() : 0;
      case 'activityScore':
      default:
        return row.activityScore;
    }
  };

  return rows.slice().sort((left, right) => {
    const diff = resolveValue(left) - resolveValue(right);
    if (diff !== 0) return diff * factor;
    return left.playerName.localeCompare(right.playerName);
  });
}

export async function getRankModulePageData(params: RankModuleSearchParams): Promise<RankModulePageData> {
  const activeView: RankViewMode = params.view === 'rank' ? 'rank' : 'summary';
  const {
    availableRegions,
    selectedRegion: baseSelectedRegion,
    selectedYear,
    bundles,
    yearsByRegion,
    tournamentsByRegionYear,
    latestSyncedAt,
  } = await buildEventOptions({
    region: params.region,
    year: params.year,
  });
  const hasExplicitRegion = Boolean(String(params.region || '').trim());
  const rankPreferredRegion =
    !hasExplicitRegion && activeView === 'rank'
      ? await prisma.playerRankAccount.findFirst({
          where: {
            status: {
              not: 'ARCHIVED',
            },
          },
          orderBy: [{ updatedAt: 'desc' }],
          select: {
            player: {
              select: {
                team: {
                  select: {
                    region: true,
                  },
                },
              },
            },
          },
        })
      : null;
  const selectedRegion = normalizeLeagueBucket(rankPreferredRegion?.player.team.region || baseSelectedRegion || 'LPL');

  const selectedTournament = String(params.tournament || '').trim();
  const resolvedTournament = selectedTournament && bundles.some((bundle) => bundle.display === selectedTournament)
    ? selectedTournament
    : ALL_EVENT_OPTION;
  const selectedTournamentAliases = resolvedTournament === ALL_EVENT_OPTION
    ? null
    : bundles.find((bundle) => bundle.display === resolvedTournament)?.matchAliases || [];

  const selectedRole = normalizeRole(params.role || 'ALL');
  const selectedActivity = (UI_ACTIVITY_OPTIONS.find((item) => item.value === params.activity)?.value || 'ALL') as RankActivityOption;
  const selectedAccountStatus = (UI_ACCOUNT_STATUS_OPTIONS.find((item) => item.value === params.accountStatus)?.value || 'ALL') as RankAccountStatusOption;
  const selectedSortKey = (UI_SORT_OPTIONS.find((item) => item.value === params.rankSort)?.value || 'activityScore') as RankModuleSortKey;
  const selectedOrder: 'asc' | 'desc' = params.rankOrder === 'asc' ? 'asc' : 'desc';
  const searchText = String(params.search || '').trim();
  const searchKeyword = normalizeSearch(searchText);

  const scopedSnapshots = await prisma.playerStatSnapshot.findMany({
    select: {
      playerId: true,
      league: true,
      tournamentName: true,
      seasonYear: true,
    },
    where: {
      seasonYear: selectedYear,
      ...(selectedTournamentAliases === null
        ? {}
        : selectedTournamentAliases.length > 0
          ? { tournamentName: { in: selectedTournamentAliases } }
          : { tournamentName: '__NO_MATCH__' }),
    },
  });

  const scopedSnapshotPlayerIds = new Set(
    scopedSnapshots
      .filter((row) => normalizeLeagueBucket(row.league, row.tournamentName) === selectedRegion)
      .map((row) => row.playerId),
  );
  const scopedPlayerIds = Array.from(scopedSnapshotPlayerIds).filter((value): value is string => Boolean(value));

  const playerWhere: Prisma.PlayerWhereInput = {
    ...(selectedRole !== 'ALL' ? { role: selectedRole } : {}),
    ...(selectedRegion === 'OTHER' || selectedRegion === 'WORLDS'
      ? {}
      : {
          team: {
            region: selectedRegion,
          },
        }),
  };

  const players = await prisma.player.findMany({
    where: playerWhere,
    include: {
      team: true,
      rankProfileCache: {
        include: {
          primaryAccount: true,
          activeAccount: true,
          displayAccount: true,
        },
      },
      rankAccounts: {
        where: {
          status: {
            not: 'ARCHIVED',
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { lastMatchAt: 'desc' }],
      },
      rankRecentSummaries: {
        include: {
          account: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      },
      rankSnapshots: {
        orderBy: [{ snapshotAt: 'desc' }],
        take: 5,
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
  });
  const latestRegionYear = yearsByRegion[selectedRegion]?.[0] || selectedYear;
  const effectiveScope =
    activeView === 'rank' &&
    ['LPL', 'LCK'].includes(selectedRegion) &&
    resolvedTournament === ALL_EVENT_OPTION &&
    selectedYear === latestRegionYear
      ? await getCurrentSeasonRankEffectiveScope({ regions: [selectedRegion] })
      : null;
  const effectiveScopedIdentityKeys = new Set(effectiveScope?.scopedIdentityKeys || []);

  const scopedIdentityKeys = new Set(
    effectiveScopedIdentityKeys.size > 0
      ? Array.from(effectiveScopedIdentityKeys)
      : players
          .filter((player) => scopedSnapshotPlayerIds.has(player.id))
          .map((player) =>
            buildRankIdentityKey({
              region: player.team?.region,
              playerName: player.name,
              role: player.role,
            }),
          ),
  );

  const scopedPlayers =
    scopedIdentityKeys.size > 0
      ? players.filter((player) =>
          scopedIdentityKeys.has(
            buildRankIdentityKey({
              region: player.team?.region,
              playerName: player.name,
              role: player.role,
            }),
          ),
        )
      : players;

  const dedupedPlayers = collapseDuplicatePlayers(scopedPlayers);

  const baseRows = mergeDuplicateRankRows(
    dedupedPlayers
    .map(mapRankRow)
    .filter((row) => !isPlaceholderPlayerName(row.playerName))
    .filter((row) => {
      if (!searchKeyword) return true;
      return [row.playerName, row.teamName, row.teamShortName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchKeyword));
    })
    .filter((row) => matchesUiActivityFilter(row.activityLabel, selectedActivity))
    .filter((row) => {
      if (selectedAccountStatus === 'ALL') return true;
      if (selectedAccountStatus === 'VERIFIED') return row.confidenceScore >= 0.85;
      if (selectedAccountStatus === 'SUSPECT') return row.pendingAccountCount > 0 || row.confidenceScore < 0.7;
      if (selectedAccountStatus === 'PRIMARY_ONLY') return row.accountCount <= 1;
      return true;
    }),
  );

  const rows = sortRankRows(baseRows, selectedSortKey, selectedOrder);
  const coveredRows = rows.filter((row) => row.isRankCovered && row.accountCount > 0);
  const highlightRows = coveredRows.length > 0 ? coveredRows : rows;
  const avgGames7d = coveredRows.length > 0
    ? Number((coveredRows.reduce((sum, row) => sum + row.games7d, 0) / coveredRows.length).toFixed(1))
    : 0;
  const masterPlusPlayerCount = coveredRows.filter((row) => getRankTierWeight(row.currentTier, row.currentRank) >= getRankTierWeight('MASTER', '')).length;
  const highActivityPlayerCount = coveredRows.filter((row) => ['火热', '活跃'].includes(row.activityLabel)).length;
  const latestRankSyncedAt = players
    .map((player) => toDate(player.rankProfileCache?.lastSyncedAt || player.rankRecentSummaries[0]?.updatedAt || player.rankSnapshots[0]?.snapshotAt))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0] || latestSyncedAt;

  const fastestRisingPlayer = highlightRows
    .slice()
    .sort((left, right) => {
      const leftScore = left.games7d * 2 + (left.winRate14d ?? 0);
      const rightScore = right.games7d * 2 + (right.winRate14d ?? 0);
      return rightScore - leftScore;
    })[0] || null;

  const coldestPlayer = highlightRows
    .slice()
    .sort((left, right) => {
      const leftScore = left.activityScore + (left.lastGameAt ? left.lastGameAt.getTime() / 100000000 : 0);
      const rightScore = right.activityScore + (right.lastGameAt ? right.lastGameAt.getTime() / 100000000 : 0);
      return leftScore - rightScore;
    })[0] || null;

  return {
    activeView,
    selectedRegion,
    selectedYear,
    selectedTournament: resolvedTournament,
    selectedRole,
    selectedActivity,
    selectedAccountStatus,
    selectedSortKey,
    selectedOrder,
    searchText,
    regionOptions: availableRegions.map((item) => ({ value: item, label: UI_REGION_LABEL[item] || item })),
    roleOptions: ['ALL', 'TOP', 'JUN', 'MID', 'ADC', 'SUP'].map((value) => ({ value, label: UI_ROLE_LABEL[value] || value })),
    activityOptions: UI_ACTIVITY_OPTIONS,
    accountStatusOptions: UI_ACCOUNT_STATUS_OPTIONS,
    sortOptions: UI_SORT_OPTIONS,
    yearsByRegion,
    tournamentsByRegionYear,
    overview: {
      rankSyncedAt: latestRankSyncedAt,
      currentPlayerCount: rows.length,
      rankCoveredPlayerCount: coveredRows.length,
      highActivityPlayerCount,
      avgGames7d,
      masterPlusPlayerCount,
    },
    highlights: {
      mostActivePlayer: highlightRows.slice().sort((left, right) => right.games7d - left.games7d)[0] || null,
      highestLpPlayer: highlightRows.slice().sort((left, right) => (right.leaguePoints ?? -1) - (left.leaguePoints ?? -1))[0] || null,
      fastestRisingPlayer,
      coldestPlayer,
      pendingAccountCount: rows.reduce((sum, row) => sum + row.pendingAccountCount, 0),
    },
    rows,
    debug: params.debug
      ? {
          selectedRegion,
          selectedYear,
          resolvedTournament,
          latestRegionYear,
          playersCount: players.length,
          scopedSnapshotPlayerIdsCount: scopedSnapshotPlayerIds.size,
          effectiveScopedIdentityKeysCount: effectiveScopedIdentityKeys.size,
          scopedIdentityKeysCount: scopedIdentityKeys.size,
          scopedPlayersCount: scopedPlayers.length,
          dedupedPlayersCount: dedupedPlayers.length,
          baseRowsCount: baseRows.length,
          rowsCount: rows.length,
        }
      : undefined,
  };
}

export async function getPlayerRankViewData(playerId: string): Promise<PlayerRankViewData | null> {
  const rankInclude = {
    team: true,
    rankProfileCache: {
      include: {
        primaryAccount: true,
        activeAccount: true,
        displayAccount: true,
      },
    },
    rankAccounts: {
      include: {
        aliases: true,
      },
      where: {
        status: {
          not: 'ARCHIVED',
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { isActiveCandidate: 'desc' }, { lastMatchAt: 'desc' }],
    },
    rankRecentSummaries: {
      include: {
        account: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
    },
    rankSnapshots: {
      include: {
        account: true,
      },
      orderBy: [{ snapshotAt: 'desc' }],
      take: 32,
    },
  } satisfies Prisma.PlayerInclude;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: rankInclude,
  });

  if (!player) return null;

  const identityKey = buildRankIdentityKey({
    region: player.team.region,
    playerName: player.name,
    teamName: player.team.name,
    teamShortName: player.team.shortName,
    role: player.role,
  });

  const hasRankData = (candidate: typeof player) => Boolean(candidate.rankProfileCache) || candidate.rankAccounts.length > 0;
  const scoreRankSource = (candidate: typeof player) => {
    return (hasRankData(candidate) ? 1000 : 0)
      + candidate.rankAccounts.length * 100
      + (candidate.rankProfileCache ? 50 : 0)
      + candidate.rankRecentSummaries.length * 10
      + candidate.rankSnapshots.length;
  };

  let rankSourcePlayer = player;
  if (!hasRankData(player)) {
    const siblingPlayers = await prisma.player.findMany({
      where: {
        id: { not: player.id },
        name: player.name,
        team: {
          region: player.team.region,
        },
      },
      include: rankInclude,
    });

    const siblingMatch = siblingPlayers
      .filter((candidate) => buildRankIdentityKey({
        region: candidate.team.region,
        playerName: candidate.name,
        teamName: candidate.team.name,
        teamShortName: candidate.team.shortName,
        role: candidate.role,
      }) === identityKey)
      .sort((left, right) => scoreRankSource(right) - scoreRankSource(left))[0];

    if (siblingMatch && hasRankData(siblingMatch)) {
      rankSourcePlayer = siblingMatch;
    }
  }

  const cache = rankSourcePlayer.rankProfileCache;
  const liveAccountIds = new Set(rankSourcePlayer.rankAccounts.map((account) => account.id));
  const liveSummaries = rankSourcePlayer.rankRecentSummaries.filter((summary) => liveAccountIds.has(summary.accountId));
  const liveSnapshots = rankSourcePlayer.rankSnapshots.filter((snapshot) => liveAccountIds.has(snapshot.accountId));
  const currentAccount = cache?.displayAccount || cache?.activeAccount || cache?.primaryAccount || rankSourcePlayer.rankAccounts[0] || null;
  const currentSummary = liveSummaries.find((summary) => summary.accountId === currentAccount?.id) || liveSummaries[0] || null;
  const currentSnapshots = currentAccount
    ? liveSnapshots.filter((item) => item.accountId === currentAccount.id)
    : liveSnapshots;
  const latestSnapshot = currentSnapshots[0] || liveSnapshots[0] || null;
  const confidenceScore = toNumber(cache?.confidenceScore ?? currentAccount?.confidence ?? 0);
  const activityScore = toNumber(cache?.activityScore ?? currentSummary?.activityScore ?? 0);
  const activityLabel = formatUiActivityLabel(activityScore, cache?.activityLabel ?? currentSummary?.activityLabel ?? null);
  const trendScore = toNumber(cache?.trendScore ?? currentSummary?.trendScore ?? 0);
  const sourceLabels = Array.from(new Set(rankSourcePlayer.rankAccounts.map((account) => account.source).filter(Boolean)));
  const suspectCount = rankSourcePlayer.rankAccounts.filter((item) => String(item.status || '').toUpperCase() === 'SUSPECT').length;
  const reusedSibling = rankSourcePlayer.id !== player.id;

  const accountCards = rankSourcePlayer.rankAccounts.map((account) => {
    const summary = liveSummaries.find((item) => item.accountId === account.id) || null;
    const snapshot = liveSnapshots.find((item) => item.accountId === account.id) || null;
    const tags = [
      account.isPrimary ? '主账号' : '',
      account.isActiveCandidate ? '当前活跃' : '',
      String(account.status || '').toUpperCase() === 'SUSPECT' ? '自动补齐' : '',
      !account.isPrimary && !account.isActiveCandidate && String(account.status || '').toUpperCase() === 'ACTIVE' ? '副号' : '',
    ].filter(Boolean);
    return {
      id: account.id,
      accountName: buildAccountName(account),
      platform: account.platform,
      regionGroup: account.regionGroup || '--',
      status: account.status,
      source: account.source,
      confidence: toNumber(account.confidence),
      isPrimary: account.isPrimary,
      isActiveCandidate: account.isActiveCandidate,
      leaguePoints: toNullableNumber(snapshot?.leaguePoints),
      currentTier: String(snapshot?.tier || '').trim() || '未上榜',
      currentRank: String(snapshot?.rank || '').trim(),
      games7d: toNumber(summary?.games7d),
      games14d: toNumber(summary?.games14d),
      winRate14d: toNullableNumber(summary?.winRate14d),
      lastGameAt: toDate(summary?.lastGameAt || account.lastMatchAt),
      lastGameLabel: formatUiLastGameLabel(toDate(summary?.lastGameAt || account.lastMatchAt)),
      tags,
    };
  });

  const topChampions = parseChampionSummary(cache?.topChampionsJson ?? currentSummary?.topChampionsJson);
  const topPositions = parsePositionSummary(currentSummary?.topPositionsJson);
  const lpPoints = currentSnapshots
    .slice(0, 8)
    .reverse()
    .map((item, index) => ({
      label: item.snapshotAt ? new Date(item.snapshotAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : `#${index + 1}`,
      value: toNumber(item.leaguePoints),
    }));

  const overviewRows = [
    {
      label: '当前 Rank',
      value: `${resolveRankText(cache?.displayTier || latestSnapshot?.tier, cache?.displayRank || latestSnapshot?.rank)}${toNullableNumber(cache?.displayLeaguePoints ?? latestSnapshot?.leaguePoints) !== null ? ` / ${toNumber(cache?.displayLeaguePoints ?? latestSnapshot?.leaguePoints)}LP` : ''}` ,
      subValue: currentAccount ? `${currentAccount.platform} / ${buildAccountName(currentAccount)}` : '当前没有展示账号',
    },
    {
      label: '近 7 天排位',
      value: `${toNumber(cache?.games7d ?? currentSummary?.games7d)} 局`,
      subValue: `活跃度：${activityLabel}` ,
    },
    {
      label: '近 14 天胜率',
      value: toNullableNumber(cache?.winRate14d ?? currentSummary?.winRate14d) !== null ? `${toNumber(cache?.winRate14d ?? currentSummary?.winRate14d).toFixed(1)}%` : '--',
      subValue: `总账号数：${rankSourcePlayer.rankAccounts.length}` ,
    },
    {
      label: '最近同步',
      value: toDate(cache?.lastSyncedAt || currentSummary?.updatedAt || latestSnapshot?.snapshotAt)?.toLocaleString('zh-CN', { hour12: false }) || '--',
      subValue: currentAccount ? `最近活跃：${formatLastGameLabel(toDate(currentSummary?.lastGameAt || currentAccount.lastMatchAt))}` : '暂无近期对局',
    },
  ];

  return {
    playerId: player.id,
    playerName: player.name,
    teamName: player.team.name,
    teamShortName: player.team.shortName,
    role: player.role,
    photo: player.photo,
    summary: {
      currentTier: String(cache?.displayTier || latestSnapshot?.tier || '').trim() || '未上榜',
      currentRank: String(cache?.displayRank || latestSnapshot?.rank || '').trim(),
      leaguePoints: toNullableNumber(cache?.displayLeaguePoints ?? latestSnapshot?.leaguePoints),
      activityLabel,
      activityScore,
      games7d: toNumber(cache?.games7d ?? currentSummary?.games7d),
      games14d: toNumber(cache?.games14d ?? currentSummary?.games14d),
      winRate14d: toNullableNumber(cache?.winRate14d ?? currentSummary?.winRate14d),
      accountCount: rankSourcePlayer.rankAccounts.length,
    },
    legacyCurrentAccount: currentAccount ? {
      accountName: buildAccountName(currentAccount),
      platform: currentAccount.platform,
      regionGroup: currentAccount.regionGroup || '--',
      lastGameAt: toDate(currentSummary?.lastGameAt || currentAccount.lastMatchAt),
      lastGameLabel: formatUiLastGameLabel(toDate(currentSummary?.lastGameAt || currentAccount.lastMatchAt)),
      tags: [currentAccount.isPrimary ? '主账号' : '', currentAccount.isActiveCandidate ? '当前活跃' : ''].filter(Boolean),
    } : null,
    currentAccount: currentAccount ? {
      accountName: buildAccountName(currentAccount),
      platform: currentAccount.platform,
      regionGroup: currentAccount.regionGroup || '--',
      lastGameAt: toDate(currentSummary?.lastGameAt || currentAccount.lastMatchAt),
      lastGameLabel: formatUiLastGameLabel(toDate(currentSummary?.lastGameAt || currentAccount.lastMatchAt)),
      tags: [currentAccount.isPrimary ? '主账号' : '', currentAccount.isActiveCandidate ? '当前活跃' : ''].filter(Boolean),
    } : null,
    legacySync: {
      lastSyncedAt: toDate(cache?.lastSyncedAt || currentSummary?.updatedAt || latestSnapshot?.snapshotAt),
      sourceLabel: sourceLabels.length > 0 ? sourceLabels.join(' / ') : '未接入',
      confidenceLabel: formatUiConfidenceLabel(confidenceScore),
      confidenceScore,
      verificationLabel: formatUiVerificationLabel(confidenceScore, suspectCount),
    },
    sync: {
      lastSyncedAt: toDate(cache?.lastSyncedAt || currentSummary?.updatedAt || latestSnapshot?.snapshotAt),
      sourceLabel: sourceLabels.length > 0 ? sourceLabels.join(' / ') : '未接入',
      confidenceLabel: formatUiConfidenceLabel(confidenceScore),
      confidenceScore,
      verificationLabel: formatUiVerificationLabel(confidenceScore, suspectCount),
    },
    legacyOverview: overviewRows,
    overview: overviewRows,
    accounts: accountCards,
    recentState: {
      topChampions,
      topPositions,
      activityLabel,
      activityScore,
      legacyTrendLabel: formatUiTrendLabel(trendScore),
      trendLabel: formatUiTrendLabel(trendScore),
      trendScore,
    },
    trends: {
      lpPoints,
      games7d: toNumber(cache?.games7d ?? currentSummary?.games7d),
      games14d: toNumber(cache?.games14d ?? currentSummary?.games14d),
      winRate14d: toNullableNumber(cache?.winRate14d ?? currentSummary?.winRate14d),
    },
    legacyMeta: {
      sourceLabel: sourceLabels.length > 0 ? sourceLabels.join(' / ') : '未接入',
      confidenceLabel: getConfidenceLabel(confidenceScore),
      lastVerifiedAt: toDate(rankSourcePlayer.rankAccounts.find((item) => item.lastVerifiedAt)?.lastVerifiedAt),
      notes: [
        '数据优先来自 Riot API，外部渠道只作为辅助校验参考。',
        '一名选手可绑定多个账号，前台默认优先展示主账号或当前活跃账号。',
        getVerificationLabel(confidenceScore, suspectCount),
        ...(reusedSibling ? ['当前页面复用了同队同名同位置选手的 Rank 数据归并结果。'] : []),
      ],
    },
    meta: {
      sourceLabel: sourceLabels.length > 0 ? sourceLabels.join(' / ') : '未接入',
      confidenceLabel: formatUiConfidenceLabel(confidenceScore),
      lastVerifiedAt: toDate(rankSourcePlayer.rankAccounts.find((item) => item.lastVerifiedAt)?.lastVerifiedAt),
      notes: [
        '数据优先来自 Riot API，外部渠道只作为辅助校验参考。',
        '一名选手可绑定多个账号，前台默认优先展示主账号或当前活跃账号。',
        formatUiVerificationLabel(confidenceScore, suspectCount),
        ...(reusedSibling ? ['当前页面复用了同队同名同位置选手的 Rank 数据归并结果。'] : []),
      ],
    },
  } as PlayerRankViewData;
}



