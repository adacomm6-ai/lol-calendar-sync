import { buildRankDiscoveryNameVariants } from '@/lib/rank-discovery-name-variants';

const SCOREGG_PLAYER_INDEX_URL = 'https://www.scoregg.com/data/pro';
const SCOREGG_API_URL = 'https://www.scoregg.com/services/api_url.php';
const SCOREGG_FETCH_TIMEOUT_MS = 10000;
const SCOREGG_PAGE_LIMIT = 40;
const SCOREGG_PAGE_SIZE = 5;
const SCOREGG_CACHE_TTL_MS = 30 * 60 * 1000;

type ScoreggPlayerAccountRow = {
  playerID?: string | number;
  player_name?: string | null;
  team_short_name?: string | null;
  services_ide?: string | null;
  game_nickname?: string | null;
  sum_id?: string | null;
  account_id?: string | null;
  area_name?: string | null;
};

type ScoreggTeamGroup = {
  teamID?: string | number;
  short_name?: string | null;
  player?: ScoreggPlayerAccountRow[] | null;
};

export type DiscoveredScoreggRankAccount = {
  sourceUrl: string;
  platformLabel: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string | null;
  summonerId: string | null;
  note: string;
};

let cache:
  | {
      expiresAt: number;
      groups: ScoreggTeamGroup[];
    }
  | null = null;

function normalizeIdentityText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\u4e00-\u9fa5]+/g, '');
}

function normalizePlayerCandidates(playerName: string) {
  return buildRankDiscoveryNameVariants(playerName, [], {
    includeSearchAliases: false,
    includeDeepSearchAliases: false,
  }).map((item) => normalizeIdentityText(item));
}

function normalizeTeamCandidates(values?: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      (values || [])
        .map((item) => normalizeIdentityText(item))
        .filter(Boolean),
    ),
  );
}

function resolvePlatform(serviceIde: string | null | undefined) {
  const normalized = String(serviceIde || '').trim().toUpperCase();
  if (normalized !== 'KR') return null;

  return {
    platformLabel: 'KR',
    platform: 'KR',
    regionGroup: 'ASIA',
  };
}

function buildSourceUrl(account: ScoreggPlayerAccountRow) {
  const serviceIde = String(account.services_ide || '').trim().toLowerCase();
  const accountId = String(account.account_id || '').trim();
  if (serviceIde && accountId) {
    return `https://www.scoregg.com/ds/${serviceIde}/${accountId}`;
  }
  return SCOREGG_PLAYER_INDEX_URL;
}

async function fetchScoreggApi(params: Record<string, string | number>) {
  const response = await fetch(SCOREGG_API_URL, {
    method: 'POST',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json,text/plain,*/*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: SCOREGG_PLAYER_INDEX_URL,
    },
    body: new URLSearchParams(
      Object.entries({
        api_path: '/services/gamingDatabase/professional_player_account.php',
        method: 'post',
        platform: 'web',
        api_version: '9.9.9',
        language_id: '1',
        ...params,
      }).map(([key, value]) => [key, String(value)]),
    ).toString(),
    signal: AbortSignal.timeout(SCOREGG_FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`ScoreGG request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    code?: string | number;
    message?: string;
    data?: ScoreggTeamGroup[];
  };

  if (String(payload?.code || '') !== '200') {
    throw new Error(payload?.message || 'ScoreGG returned non-200 code');
  }

  return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchAllScoreggGroups() {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.groups;
  }

  const groups: ScoreggTeamGroup[] = [];

  for (let page = 1; page <= SCOREGG_PAGE_LIMIT; page += 1) {
    const pageData = await fetchScoreggApi({
      limit: SCOREGG_PAGE_SIZE,
      team_id: '',
      search: '',
      page,
    });

    if (pageData.length === 0) break;
    groups.push(...pageData);
    if (pageData.length < SCOREGG_PAGE_SIZE) break;
  }

  cache = {
    expiresAt: Date.now() + SCOREGG_CACHE_TTL_MS,
    groups,
  };

  return groups;
}

export async function discoverProRankAccountsFromScoregg(
  playerName: string,
  options?: {
    teamCandidates?: Array<string | null | undefined>;
  },
) {
  const normalizedCandidates = normalizePlayerCandidates(playerName).filter(Boolean);
  const normalizedTeamCandidates = normalizeTeamCandidates(options?.teamCandidates);
  const groups = await fetchAllScoreggGroups();
  const accounts: DiscoveredScoreggRankAccount[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const account of group.player || []) {
      const normalizedPlayerName = normalizeIdentityText(account.player_name);
      if (!normalizedPlayerName) continue;
      if (!normalizedCandidates.some((candidate) => candidate === normalizedPlayerName)) continue;
      if (normalizedTeamCandidates.length > 0) {
        const normalizedAccountTeam = normalizeIdentityText(account.team_short_name || group.short_name);
        if (normalizedAccountTeam && !normalizedTeamCandidates.includes(normalizedAccountTeam)) {
          continue;
        }
      }

      const mapped = resolvePlatform(account.services_ide);
      const gameName = String(account.game_nickname || '').trim();
      const summonerId = String(account.sum_id || '').trim() || null;
      if (!mapped || !gameName || !summonerId) continue;

      const dedupeKey = `${mapped.platform}::${normalizeIdentityText(gameName)}::${summonerId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      accounts.push({
        sourceUrl: buildSourceUrl(account),
        platformLabel: mapped.platformLabel,
        platform: mapped.platform,
        regionGroup: mapped.regionGroup,
        gameName,
        tagLine: null,
        summonerId,
        note: `ScoreGG 自动发现：${mapped.platformLabel} / ${gameName}（summonerId）`,
      });
    }
  }

  return {
    success: accounts.length > 0,
    source: 'SCOREGG' as const,
    sourceUrl: SCOREGG_PLAYER_INDEX_URL,
    accounts,
    error: accounts.length > 0 ? null : 'No ScoreGG professional player accounts found',
  };
}
