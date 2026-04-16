import { prisma } from '@/lib/db';

type RiotAccountDto = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

type RiotSummonerDto = {
  id?: string;
  puuid: string;
  summonerLevel: number;
};

type RiotLeagueEntryDto = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

type RiotMatchParticipantDto = {
  puuid: string;
  win: boolean;
  championName?: string;
  teamPosition?: string;
  individualPosition?: string;
  lane?: string;
  role?: string;
};

type RiotMatchDto = {
  metadata: {
    matchId: string;
  };
  info: {
    gameCreation?: number;
    gameDuration?: number;
    gameEndTimestamp?: number;
    participants: RiotMatchParticipantDto[];
  };
};

type SyncAccountResult = {
  accountId: string;
  playerId: string;
  accountName: string;
  status: 'synced' | 'skipped' | 'failed';
  message: string;
  failureCategory?: 'not_found' | 'invalid_mapping' | 'rate_limit' | 'network' | 'timeout' | 'unknown' | null;
  httpStatus?: number | null;
};

type SyncSummaryResult = {
  success: boolean;
  provider: 'riot';
  attempted: number;
  synced: number;
  skipped: number;
  failed: number;
  touchedPlayerIds: string[];
  results: SyncAccountResult[];
};

const PLATFORM_TO_REGION_GROUP: Record<string, string> = {
  BR1: 'AMERICAS',
  LA1: 'AMERICAS',
  LA2: 'AMERICAS',
  NA1: 'AMERICAS',
  EUN1: 'EUROPE',
  EUW1: 'EUROPE',
  RU: 'EUROPE',
  TR1: 'EUROPE',
  JP1: 'ASIA',
  KR: 'ASIA',
  OC1: 'SEA',
  PH2: 'SEA',
  SG2: 'SEA',
  TH2: 'SEA',
  TW2: 'SEA',
  VN2: 'SEA',
};

const ACTIVE_SYNC_STATUSES = ['ACTIVE', 'SUSPECT'];
const RANK_QUEUE = 'RANKED_SOLO_5x5';
const MATCH_QUEUE = 420;
const MATCH_FETCH_COUNT = 5;
const LOOKBACK_DAYS = 14;
const REQUEST_INTERVAL_MS = 1300;
const MAX_RETRY_ATTEMPTS = 4;

let nextAllowedRequestAt = 0;

class RiotApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RiotApiError';
    this.status = status;
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePlatform(value: string | null | undefined) {
  return String(value || 'KR').trim().toUpperCase() || 'KR';
}

function normalizeRegionGroup(value: string | null | undefined, platform: string) {
  const explicit = String(value || '').trim().toUpperCase();
  if (explicit) return explicit;
  return PLATFORM_TO_REGION_GROUP[platform] || 'ASIA';
}

function isManualPuuid(value: string | null | undefined) {
  return String(value || '').startsWith('manual:');
}

function buildAccountName(input: { gameName: string; tagLine?: string | null }) {
  return input.tagLine ? `${input.gameName}#${input.tagLine}` : input.gameName;
}

function resolveSyncLimit(limit?: number) {
  if (!Number.isFinite(limit)) return 25;
  if (Number(limit) <= 0) return undefined;
  return Number(limit);
}

function getSyncPriority(account: {
  isActiveCandidate: boolean;
  isPrimary: boolean;
  confidence: number | null;
  lastMatchAt: Date | null;
  summonerId: string | null;
  puuid: string;
  updatedAt: Date;
}) {
  const hasResolvedIdentity = Boolean(account.summonerId) || !isManualPuuid(account.puuid);
  const hasLiveSignal = Boolean(account.lastMatchAt);

  return [
    hasLiveSignal ? 0 : 500000,
    hasResolvedIdentity ? 0 : 250000,
    account.isActiveCandidate ? 100000 : 0,
    account.isPrimary ? 50000 : 0,
    toNumber(account.confidence) * 1000,
    account.updatedAt ? new Date(account.updatedAt).getTime() / 1000000000 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function normalizeIdentityText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\u4e00-\u9fa5]+/g, '');
}

function normalizeSyncRole(value: string | null | undefined) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SUPPORT' || normalized === 'SUP') return 'SUP';
  if (normalized === 'JUNGLE' || normalized === 'JUG' || normalized === 'JUN') return 'JUN';
  if (normalized === 'BOTTOM' || normalized === 'BOT' || normalized === 'ADC') return 'ADC';
  if (normalized === 'MIDDLE' || normalized === 'MID') return 'MID';
  if (normalized === 'TOP') return 'TOP';
  return normalized || 'OTHER';
}

function buildSyncPlayerIdentityKey(input: {
  playerName?: string | null;
  role?: string | null;
  region?: string | null;
}) {
  return [
    normalizeIdentityText(input.region),
    normalizeIdentityText(input.playerName),
    normalizeSyncRole(input.role),
  ].join('::');
}

function getRankTierWeight(tier: string | null | undefined, rank: string | null | undefined) {
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

function getActivityLabel(score: number) {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Active';
  if (score >= 35) return 'Normal';
  if (score > 0) return 'Low';
  return 'Dormant';
}

function classifySyncError(error: unknown): {
  status: 'skipped' | 'failed';
  failureCategory: SyncAccountResult['failureCategory'];
  httpStatus: number | null;
  message: string;
} {
  if (error instanceof RiotApiError) {
    if (error.status === 404) {
      return {
        status: 'skipped',
        failureCategory: 'not_found',
        httpStatus: 404,
        message: error.message,
      };
    }
    if (error.status === 429) {
      return {
        status: 'failed',
        failureCategory: 'rate_limit',
        httpStatus: 429,
        message: error.message,
      };
    }
    return {
      status: 'failed',
      failureCategory: 'invalid_mapping',
      httpStatus: error.status,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown Riot sync error';
  const lower = message.toLowerCase();
  if (lower.includes('abort') || lower.includes('timeout')) {
    return {
      status: 'failed',
      failureCategory: 'timeout',
      httpStatus: null,
      message,
    };
  }
  if (
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('socket') ||
    lower.includes('econn') ||
    lower.includes('enotfound')
  ) {
    return {
      status: 'failed',
      failureCategory: 'network',
      httpStatus: null,
      message,
    };
  }

  return {
    status: 'failed',
    failureCategory: 'unknown',
    httpStatus: null,
    message,
  };
}

function mapPosition(raw: string | undefined) {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return 'UNKNOWN';
  if (value === 'UTILITY' || value === 'SUPPORT') return 'SUP';
  if (value === 'BOTTOM') return 'ADC';
  if (value === 'JUNGLE') return 'JUG';
  if (value === 'MIDDLE') return 'MID';
  if (value === 'TOP') return 'TOP';
  return value;
}

function getGameEndAt(match: RiotMatchDto) {
  if (match.info.gameEndTimestamp) {
    return new Date(match.info.gameEndTimestamp);
  }

  const creation = toNumber(match.info.gameCreation);
  const durationSeconds = toNumber(match.info.gameDuration);
  if (creation > 0 && durationSeconds > 0) {
    return new Date(creation + durationSeconds * 1000);
  }

  return null;
}

async function riotRequest<T>(
  host: string,
  path: string,
  apiKey: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const url = `https://${host}.api.riotgames.com${path}${params.toString() ? `?${params.toString()}` : ''}`;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    const now = Date.now();
    const waitMs = Math.max(nextAllowedRequestAt - now, 0);
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Riot-Token': apiKey,
      },
      cache: 'no-store',
    });
    nextAllowedRequestAt = Date.now() + REQUEST_INTERVAL_MS;

    if (response.ok) {
      return (await response.json()) as T;
    }

    const body = await response.text().catch(() => '');
    if (response.status === 429 && attempt < MAX_RETRY_ATTEMPTS) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = Number(retryAfterHeader);
      const fallbackWaitMs = attempt * 15000;
      const retryWaitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : fallbackWaitMs;
      nextAllowedRequestAt = Math.max(nextAllowedRequestAt, Date.now() + retryWaitMs);
      await sleep(retryWaitMs);
      continue;
    }

    throw new RiotApiError(response.status, `Riot API ${response.status} ${path}: ${body || response.statusText}`);
  }

  throw new RiotApiError(429, `Riot API exhausted retries for ${path}`);
}

async function ensureAlias(accountId: string, aliasValue: string) {
  const trimmed = aliasValue.trim();
  if (!trimmed) return;

  const existing = await prisma.playerRankAccountAlias.findFirst({
    where: {
      accountId,
      aliasType: 'GAME_NAME',
      aliasValue: trimmed,
    },
    select: { id: true },
  });

  if (existing) return;

  await prisma.playerRankAccountAlias.create({
    data: {
      accountId,
      aliasType: 'GAME_NAME',
      aliasValue: trimmed,
      source: 'RIOT',
      confidence: 1,
    },
  });
}

async function resolveRiotAccount(
  account: {
    id: string;
    gameName: string;
    tagLine: string | null;
    puuid: string;
    summonerId?: string | null;
    platform: string;
    regionGroup: string | null;
  },
  apiKey: string,
) {
  const platform = normalizePlatform(account.platform);
  const regionGroup = normalizeRegionGroup(account.regionGroup, platform);
  const regionalHost = regionGroup.toLowerCase();

  if (account.puuid && !isManualPuuid(account.puuid)) {
    try {
      const byPuuid = await riotRequest<RiotAccountDto>(
        regionalHost,
        `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(account.puuid)}`,
        apiKey,
      );

      return {
        regionGroup,
        account: byPuuid,
      };
    } catch (error) {
      if (!(error instanceof RiotApiError) || error.status !== 404) {
        throw error;
      }
    }
  }

  if (account.summonerId) {
    const summoner = await riotRequest<RiotSummonerDto>(
      platform.toLowerCase(),
      `/lol/summoner/v4/summoners/${encodeURIComponent(account.summonerId)}`,
      apiKey,
    );
    const byPuuid = await riotRequest<RiotAccountDto>(
      regionalHost,
      `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(summoner.puuid)}`,
      apiKey,
    );

    return {
      regionGroup,
      account: byPuuid,
    };
  }

  if (!account.gameName || !account.tagLine) {
    throw new Error('Missing tagLine, summonerId, or valid puuid for Riot account lookup');
  }

  const byRiotId = await riotRequest<RiotAccountDto>(
    regionalHost,
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`,
    apiKey,
  );

  return {
    regionGroup,
    account: byRiotId,
  };
}

async function fetchSummoner(platform: string, puuid: string, apiKey: string) {
  return riotRequest<RiotSummonerDto>(
    platform.toLowerCase(),
    `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
    apiKey,
  );
}

async function fetchSoloQueueEntryByPuuid(platform: string, puuid: string, apiKey: string) {
  const entries = await riotRequest<RiotLeagueEntryDto[]>(
    platform.toLowerCase(),
    `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    apiKey,
  );

  return entries.find((entry) => entry.queueType === RANK_QUEUE) || null;
}

async function fetchRecentMatches(regionGroup: string, puuid: string, apiKey: string) {
  const now = Date.now();
  const startTime = Math.floor((now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000);
  const regionalHost = regionGroup.toLowerCase();
  const ids = await riotRequest<string[]>(
    regionalHost,
    `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`,
    apiKey,
    {
      queue: MATCH_QUEUE,
      startTime,
      start: 0,
      count: MATCH_FETCH_COUNT,
    },
  );

  const settledIds = ids.slice(0, MATCH_FETCH_COUNT);
  const matches: RiotMatchDto[] = [];
  for (const matchId of settledIds) {
    matches.push(
      await riotRequest<RiotMatchDto>(
        regionalHost,
        `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
        apiKey,
      ),
    );
  }

  return matches;
}

function buildRecentSummary(matches: RiotMatchDto[], puuid: string) {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const championMap = new Map<string, { games: number; wins: number }>();
  const positionMap = new Map<string, number>();
  const activeDays = new Set<string>();

  let games3d = 0;
  let games7d = 0;
  let games14d = 0;
  let wins7d = 0;
  let losses7d = 0;
  let wins14d = 0;
  let losses14d = 0;
  let lastGameAt: Date | null = null;

  const sortedMatches = matches
    .map((match) => {
      const participant = match.info.participants.find((item) => item.puuid === puuid);
      const endedAt = getGameEndAt(match);
      return { match, participant, endedAt };
    })
    .filter((item): item is { match: RiotMatchDto; participant: RiotMatchParticipantDto; endedAt: Date } => Boolean(item.participant && item.endedAt))
    .sort((left, right) => right.endedAt.getTime() - left.endedAt.getTime());

  for (const item of sortedMatches) {
    const diff = now - item.endedAt.getTime();
    if (diff > fourteenDaysMs) continue;

    games14d += 1;
    if (item.participant.win) wins14d += 1;
    else losses14d += 1;

    if (!lastGameAt || item.endedAt > lastGameAt) lastGameAt = item.endedAt;
    activeDays.add(item.endedAt.toISOString().slice(0, 10));

    const championName = String(item.participant.championName || '').trim();
    if (championName) {
      const current = championMap.get(championName) || { games: 0, wins: 0 };
      current.games += 1;
      current.wins += item.participant.win ? 1 : 0;
      championMap.set(championName, current);
    }

    const position = mapPosition(
      item.participant.teamPosition || item.participant.individualPosition || item.participant.lane || item.participant.role,
    );
    positionMap.set(position, (positionMap.get(position) || 0) + 1);

    if (diff <= sevenDaysMs) {
      games7d += 1;
      if (item.participant.win) wins7d += 1;
      else losses7d += 1;
    }

    if (diff <= threeDaysMs) {
      games3d += 1;
    }
  }

  const winRate7d = games7d > 0 ? (wins7d / games7d) * 100 : null;
  const winRate14d = games14d > 0 ? (wins14d / games14d) * 100 : null;
  const topChampions = Array.from(championMap.entries())
    .map(([championName, data]) => ({
      championName,
      games: data.games,
      winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
    }))
    .sort((left, right) => right.games - left.games)
    .slice(0, 5);
  const topPositions = Array.from(positionMap.entries())
    .map(([position, games]) => ({ position, games }))
    .sort((left, right) => right.games - left.games)
    .slice(0, 5);

  const recencyScore = !lastGameAt ? 0 : now - lastGameAt.getTime() <= 2 * 24 * 60 * 60 * 1000 ? 20 : now - lastGameAt.getTime() <= sevenDaysMs ? 10 : 4;
  const consistencyScore = Math.min(activeDays.size * 3, 15);
  const activityScore = clamp(Math.min(games3d * 12, 35) + Math.min(games7d * 4, 30) + recencyScore + consistencyScore, 0, 100);

  const recent7Baseline = winRate7d ?? 50;
  const rankFormBase = clamp((recent7Baseline - 50) * 1.3 + games7d * 1.5 + games14d * 0.5, 0, 100);
  const firstHalf = sortedMatches.slice(Math.ceil(sortedMatches.length / 2));
  const secondHalf = sortedMatches.slice(0, Math.floor(sortedMatches.length / 2));
  const firstHalfRate = firstHalf.length > 0 ? (firstHalf.filter((item) => item.participant.win).length / firstHalf.length) * 100 : 50;
  const secondHalfRate = secondHalf.length > 0 ? (secondHalf.filter((item) => item.participant.win).length / secondHalf.length) * 100 : firstHalfRate;
  const trendScore = clamp(secondHalfRate - firstHalfRate, -100, 100);

  return {
    games3d,
    games7d,
    games14d,
    wins7d,
    losses7d,
    winRate7d,
    wins14d,
    losses14d,
    winRate14d,
    lastGameAt,
    topChampionsJson: JSON.stringify(topChampions),
    topPositionsJson: JSON.stringify(topPositions),
    activityScore,
    activityLabel: getActivityLabel(activityScore),
    formScore: rankFormBase,
    trendScore,
  };
}

async function upsertRecentSummary(input: {
  playerId: string;
  teamId: string | null;
  accountId: string;
  summary: ReturnType<typeof buildRecentSummary>;
}) {
  const existing = await prisma.playerRankRecentSummary.findFirst({
    where: { accountId: input.accountId },
    orderBy: [{ updatedAt: 'desc' }],
    select: { id: true },
  });

  const data = {
    playerId: input.playerId,
    teamId: input.teamId,
    accountId: input.accountId,
    games3d: input.summary.games3d,
    games7d: input.summary.games7d,
    games14d: input.summary.games14d,
    wins7d: input.summary.wins7d,
    losses7d: input.summary.losses7d,
    winRate7d: input.summary.winRate7d,
    wins14d: input.summary.wins14d,
    losses14d: input.summary.losses14d,
    winRate14d: input.summary.winRate14d,
    lastGameAt: input.summary.lastGameAt,
    topChampionsJson: input.summary.topChampionsJson,
    topPositionsJson: input.summary.topPositionsJson,
    activityScore: input.summary.activityScore,
    activityLabel: input.summary.activityLabel,
    formScore: input.summary.formScore,
    trendScore: input.summary.trendScore,
    sourceUpdatedAt: new Date(),
  };

  if (existing) {
    await prisma.playerRankRecentSummary.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.playerRankRecentSummary.create({ data });
}

async function createSnapshot(input: {
  playerId: string;
  accountId: string;
  queueType?: string;
  entry: RiotLeagueEntryDto | null;
}) {
  const wins = toNumber(input.entry?.wins);
  const losses = toNumber(input.entry?.losses);
  const totalGames = wins + losses;

  await prisma.playerRankSnapshot.create({
    data: {
      playerId: input.playerId,
      accountId: input.accountId,
      queueType: input.queueType || RANK_QUEUE,
      tier: input.entry?.tier || 'UNRANKED',
      rank: input.entry?.rank || '',
      leaguePoints: input.entry?.leaguePoints ?? 0,
      wins,
      losses,
      winRate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
      snapshotAt: new Date(),
    },
  });
}

async function syncSingleAccount(
  account: {
    id: string;
    playerId: string;
    teamId: string | null;
    platform: string;
    regionGroup: string | null;
    gameName: string;
    tagLine: string | null;
    summonerId: string | null;
    summonerLevel: number | null;
    puuid: string;
    status: string;
    isPrimary: boolean;
    isActiveCandidate: boolean;
    notes: string | null;
    player: {
      name: string;
      role: string | null;
      team: {
        region: string | null;
        shortName: string | null;
        name: string | null;
      } | null;
    };
  },
  apiKey: string,
) {
  const oldAccountName = buildAccountName(account);
  const platform = normalizePlatform(account.platform);
  const resolvedRegionGroup = normalizeRegionGroup(account.regionGroup, platform);

  const resolved = await resolveRiotAccount(account, apiKey);
  const riotSummoner = await fetchSummoner(platform, resolved.account.puuid, apiKey);
  const riotEntry = await fetchSoloQueueEntryByPuuid(platform, resolved.account.puuid, apiKey).catch((error) => {
    if (error instanceof RiotApiError && error.status === 404) return null;
    throw error;
  });
  const recentMatches = await fetchRecentMatches(resolved.regionGroup, resolved.account.puuid, apiKey).catch((error) => {
    if (error instanceof RiotApiError && error.status === 404) return [];
    throw error;
  });
  const recentSummary = buildRecentSummary(recentMatches, resolved.account.puuid);

  const newAccountName = buildAccountName(resolved.account);
  if (oldAccountName !== newAccountName) {
    await ensureAlias(account.id, oldAccountName);
  }

  const conflictingAccount = await prisma.playerRankAccount.findFirst({
    where: {
      puuid: resolved.account.puuid,
      id: {
        not: account.id,
      },
    },
    include: {
      player: {
        include: {
          team: true,
        },
      },
    },
  });

  let targetAccountId = account.id;
  const touchedPlayerIds = new Set<string>([account.playerId]);
  if (conflictingAccount) {
    const currentIdentity = buildSyncPlayerIdentityKey({
      playerName: account.player.name,
      role: account.player.role,
      region: account.player.team?.region,
    });
    const conflictingIdentity = buildSyncPlayerIdentityKey({
      playerName: conflictingAccount.player.name,
      role: conflictingAccount.player.role,
      region: conflictingAccount.player.team?.region,
    });
    const samePlayerGroup = conflictingAccount.playerId === account.playerId || currentIdentity === conflictingIdentity;

    if (!samePlayerGroup) {
      throw new Error(
        `PUUID collision detected between ${buildAccountName(account)} and ${buildAccountName(conflictingAccount)} (${resolved.account.puuid})`,
      );
    }

    if (account.isPrimary) {
      await prisma.playerRankAccount.updateMany({
        where: {
          playerId: account.playerId,
          id: {
            not: conflictingAccount.id,
          },
        },
        data: {
          isPrimary: false,
        },
      });
    }

    if (account.isActiveCandidate) {
      await prisma.playerRankAccount.updateMany({
        where: {
          playerId: account.playerId,
          id: {
            not: conflictingAccount.id,
          },
        },
        data: {
          isActiveCandidate: false,
        },
      });
    }

    await ensureAlias(conflictingAccount.id, oldAccountName);
    await prisma.playerRankAccount.update({
      where: { id: conflictingAccount.id },
      data: {
        playerId: account.playerId,
        teamId: account.teamId,
        platform,
        regionGroup: resolvedRegionGroup,
        gameName: resolved.account.gameName,
        tagLine: resolved.account.tagLine,
        puuid: resolved.account.puuid,
        summonerId: riotSummoner.id,
        summonerLevel: riotSummoner.summonerLevel,
        status: 'ACTIVE',
        isPrimary: conflictingAccount.isPrimary || account.isPrimary,
        isActiveCandidate: conflictingAccount.isActiveCandidate || account.isActiveCandidate,
        notes: [conflictingAccount.notes, account.notes].filter(Boolean).join('\n') || null,
        lastSeenAt: new Date(),
        lastMatchAt: recentSummary.lastGameAt,
      },
    });

    await prisma.playerRankAccount.update({
      where: { id: account.id },
      data: {
        status: 'ARCHIVED',
        isPrimary: false,
        isActiveCandidate: false,
        notes: [account.notes, `Merged into ${conflictingAccount.id} by Riot sync (${resolved.account.puuid})`]
          .filter(Boolean)
          .join('\n'),
      },
    });

    targetAccountId = conflictingAccount.id;
    touchedPlayerIds.add(conflictingAccount.playerId);
  } else {
    await prisma.playerRankAccount.update({
      where: { id: account.id },
      data: {
        platform,
        regionGroup: resolvedRegionGroup,
        gameName: resolved.account.gameName,
        tagLine: resolved.account.tagLine,
        puuid: resolved.account.puuid,
        summonerId: riotSummoner.id,
        summonerLevel: riotSummoner.summonerLevel,
        lastSeenAt: new Date(),
        lastMatchAt: recentSummary.lastGameAt,
      },
    });
  }

  await createSnapshot({
    playerId: account.playerId,
    accountId: targetAccountId,
    entry: riotEntry,
  });

  await upsertRecentSummary({
    playerId: account.playerId,
    teamId: account.teamId,
    accountId: targetAccountId,
    summary: recentSummary,
  });

  return {
    accountName: newAccountName,
    recentSummary,
    rankWeight: getRankTierWeight(riotEntry?.tier, riotEntry?.rank),
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

export async function syncRankAccountsViaRiot(options?: {
  limit?: number;
  playerId?: string;
  playerIds?: string[];
}): Promise<SyncSummaryResult> {
  const apiKey = String(process.env.RIOT_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('RIOT_API_KEY is not configured');
  }

  const resolvedLimit = resolveSyncLimit(options?.limit);

  const accounts = await prisma.playerRankAccount.findMany({
    where: {
      status: {
        in: ACTIVE_SYNC_STATUSES,
      },
      ...(options?.playerId
        ? { playerId: options.playerId }
        : Array.isArray(options?.playerIds) && options.playerIds.length > 0
          ? {
              playerId: {
                in: options.playerIds,
              },
            }
          : {}),
    },
    include: {
      player: {
        include: {
          team: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  const scopedAccounts = options?.playerId || (options?.playerIds && options.playerIds.length > 0)
    ? accounts
    : accounts
        .slice()
        .sort((left, right) => getSyncPriority(right) - getSyncPriority(left))
        .slice(0, resolvedLimit);

  const results: SyncAccountResult[] = [];
  const touchedPlayerIds = new Set<string>();

  for (const account of scopedAccounts) {
    try {
      const hasResolvableIdentity =
        Boolean(account.tagLine) || Boolean(account.summonerId) || !isManualPuuid(account.puuid);
      const shouldSkip = !account.gameName || !hasResolvableIdentity;
      if (shouldSkip) {
        results.push({
          accountId: account.id,
          playerId: account.playerId,
          accountName: buildAccountName(account),
          status: 'skipped',
          message: 'Missing tagLine, summonerId, or Riot-resolvable puuid; manual mapping needs more data.',
        });
        continue;
      }

      const synced = await syncSingleAccount(account, apiKey);
      synced.touchedPlayerIds.forEach((playerId) => touchedPlayerIds.add(playerId));
      results.push({
        accountId: account.id,
        playerId: account.playerId,
        accountName: synced.accountName,
        status: 'synced',
        message: `Synced live Riot data (${synced.recentSummary.games7d} games in 7d).`,
      });
    } catch (error) {
      const classified = classifySyncError(error);
      results.push({
        accountId: account.id,
        playerId: account.playerId,
        accountName: buildAccountName(account),
        status: classified.status,
        message: classified.message,
        failureCategory: classified.failureCategory,
        httpStatus: classified.httpStatus,
      });
    }
  }

  return {
    success: true,
    provider: 'riot',
    attempted: scopedAccounts.length,
    synced: results.filter((item) => item.status === 'synced').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
    failed: results.filter((item) => item.status === 'failed').length,
    touchedPlayerIds: Array.from(touchedPlayerIds),
    results,
  };
}
