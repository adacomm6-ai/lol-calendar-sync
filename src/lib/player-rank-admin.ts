import { prisma } from '@/lib/db';
import { findKnownProRankSeeds, KNOWN_PRO_RANK_SEEDS, type KnownProRankSeed } from '@/lib/known-pro-rank-seeds';
import { Prisma } from '@prisma/client';
import { discoverLeaguepediaRankAccounts } from '@/lib/leaguepedia-rank-discovery';
import { discoverProRankAccountsFromOpgg } from '@/lib/opgg-rank-discovery';
import { discoverProRankAccountsFromDpm, discoverProRankAccountsFromDpmUrl } from '@/lib/pro-rank-discovery';
import { discoverProRankAccountsFromScoregg } from '@/lib/scoregg-rank-discovery';
import {
  discoverProRankAccountsFromTrackingThePros,
  discoverProRankAccountsFromTrackingTheProsUrl,
} from '@/lib/trackingthepros-rank-discovery';
import { normalizeLeagueBucket } from '@/lib/player-snapshot';
import {
  clearCurrentSeasonRankEffectiveScopeCache,
  filterPlayersByCurrentSeasonRankEffectiveScope,
  getCurrentSeasonRankEffectiveScope,
  type CurrentSeasonRankEffectiveScope,
} from '@/lib/rank-effective-pool';
import { normalizeRankTextIfNeeded, sanitizeRankTextDeep } from '@/lib/rank-text-normalizer';
import { syncRankAccountsViaRiot } from '@/lib/riot-rank-provider';
import { getTeamAliasCandidates } from '@/lib/team-alias';
import { buildRankDiscoveryNameVariants } from '@/lib/rank-discovery-name-variants';

type RankSyncHistoryStatus = 'SUCCESS' | 'FAILED';

type RankSyncHistoryEntry = {
  id: string;
  trigger: 'manual' | 'cron';
  status: RankSyncHistoryStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  refreshedPlayers: number;
  failedPlayers: number;
  riotAttempted: number;
  riotSynced: number;
  autoImportedCreated: number;
  autoImportedUpdated: number;
  note: string;
  error?: string | null;
};

type RankSyncFailureCategory = 'not_found' | 'invalid_mapping' | 'rate_limit' | 'network' | 'timeout' | 'unknown';

type RankSyncFailureState = {
  accountId: string;
  playerId: string;
  accountName: string;
  failureCategory: RankSyncFailureCategory;
  consecutiveFailures: number;
  totalFailures: number;
  lastMessage: string;
  lastHttpStatus: number | null;
  lastFailedAt: string;
};

const RANK_SYNC_HISTORY_LIMIT = 12;
const RANK_SYNC_FAILURE_ARCHIVE_THRESHOLD = 3;
const RANK_SYNC_FAILURE_DOWNGRADE_THRESHOLD = 2;

function getRankSyncHistoryPath() {
  const projectRoot = process.cwd();
  return path.join(projectRoot, 'data', 'rank-sync-history.json');
}

function getRankSyncFailureStatePath() {
  const projectRoot = process.cwd();
  return path.join(projectRoot, 'data', 'rank-sync-failures.json');
}

async function readRankSyncHistory(): Promise<RankSyncHistoryEntry[]> {
  try {
    const filePath = getRankSyncHistoryPath();
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return Array.isArray(parsed) ? sanitizeRankTextDeep(parsed) : [];
  } catch {
    return [];
  }
}

async function writeRankSyncHistory(entries: RankSyncHistoryEntry[]) {
  const filePath = getRankSyncHistoryPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(sanitizeRankTextDeep(entries.slice(0, RANK_SYNC_HISTORY_LIMIT)), null, 2),
    'utf8',
  );
}

export async function exportRankSyncHistory() {
  return await readRankSyncHistory();
}

export async function clearRankSyncHistory() {
  await writeRankSyncHistory([]);
}

export async function recordRankSyncHistory(entry: RankSyncHistoryEntry) {
  const current = await readRankSyncHistory();
  current.unshift(entry);
  await writeRankSyncHistory(current);
}

export async function getRecentRankSyncHistory(limit = 6) {
  const entries = await readRankSyncHistory();
  return entries.slice(0, Math.max(1, limit));
}

async function readRankSyncFailureState(): Promise<Record<string, RankSyncFailureState>> {
  try {
    const filePath = getRankSyncFailureStatePath();
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return parsed && typeof parsed === 'object' ? sanitizeRankTextDeep(parsed) : {};
  } catch {
    return {};
  }
}

async function writeRankSyncFailureState(state: Record<string, RankSyncFailureState>) {
  const filePath = getRankSyncFailureStatePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(sanitizeRankTextDeep(state), null, 2), 'utf8');
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? []);
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeUnicodeText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\u4e00-\u9fa5]+/g, '');
}

function mergeDistinctNoteText(...parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const part of parts) {
    const text = normalizeRankTextIfNeeded(String(part || '')).replace(/\r/g, '\n');
    if (!text.trim()) continue;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const normalizedKey = trimmed.replace(/\s+/g, ' ');
      if (seen.has(normalizedKey)) continue;
      seen.add(normalizedKey);
      lines.push(trimmed);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildRankAccountIdentityKey(input: {
  platform?: string | null;
  gameName?: string | null;
  tagLine?: string | null;
}) {
  return [
    String(input.platform || 'KR').trim().toUpperCase(),
    normalizeUnicodeText(String(input.gameName || '')),
    normalizeUnicodeText(String(input.tagLine || '')),
  ].join('::');
}

function buildManualPuuid(input: {
  playerId: string;
  platform: string;
  gameName: string;
  tagLine?: string | null;
}) {
  const namePart = normalizeText(input.gameName || 'manual');
  const tagPart = normalizeText(input.tagLine || 'na');
  const platformPart = normalizeText(input.platform || 'global');
  return `manual:${input.playerId}:${platformPart}:${namePart}:${tagPart}`;
}

function resolveActivityLabel(score: number, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;
  if (score >= 80) return '火热';
  if (score >= 60) return '活跃';
  if (score >= 35) return '一般';
  if (score > 0) return '沉寂';
  return '无数据';
}

function resolveConfidenceLabel(score: number) {
  if (score >= 0.85) return '高';
  if (score >= 0.7) return '中高';
  if (score >= 0.55) return '中';
  if (score > 0) return '待确认';
  return '未知';
}

function resolveVerificationLabel(score: number, status: string) {
  if (status === 'ARCHIVED') return '已归档';
  if (status === 'SUSPECT') return '自动补齐';
  if (score >= 0.85) return '已确认';
  if (score >= 0.55) return '建议复核';
  return '未校验';
}

function isPlaceholderRankAccountName(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  return (
    !normalized ||
    normalized === '待确认映射' ||
    normalized === '自动补齐映射' ||
    /^\?+$/.test(normalized)
  );
}

function isManualPuuid(value: string | null | undefined) {
  return String(value || '').startsWith('manual:');
}

function supportsImmediateRankPromotion(input: {
  tagLine?: string | null;
  puuid?: string | null;
}) {
  const normalizedTagLine = String(input.tagLine || '').trim();
  if (normalizedTagLine) return true;

  const normalizedPuuid = String(input.puuid || '').trim();
  return Boolean(normalizedPuuid) && !isManualPuuid(normalizedPuuid);
}

function isPuuidUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes('puuid')
  );
}

function getActivityLabel(score: number, fallback?: string | null) {
  return resolveActivityLabel(score, fallback);
}

function getConfidenceLabel(score: number) {
  return resolveConfidenceLabel(score);
}

function getVerificationLabel(score: number, status: string) {
  return resolveVerificationLabel(score, status);
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

function pickDisplayAccount(accounts: any[], summaries: any[], snapshots: any[]) {
  const scoreAccount = (account: any) => {
    const summary = summaries.find((item) => item.accountId === account.id);
    const snapshot = snapshots.find((item) => item.accountId === account.id);
    let score = 0;
    score += account.isPrimary ? 1000 : 0;
    score += account.isActiveCandidate ? 500 : 0;
    score += toNumber(summary?.games7d) * 10;
    score += toNumber(summary?.activityScore);
    score += toNumber(snapshot?.leaguePoints);
    score += Math.max(0, getRankTierWeight(snapshot?.tier || '', snapshot?.rank || '')) * 100;
    score += account.status === 'ACTIVE' ? 20 : 0;
    score += account.status === 'SUSPECT' ? -100 : 0;
    return score;
  };

  return accounts.slice().sort((left, right) => scoreAccount(right) - scoreAccount(left))[0] || null;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '').replace(/[_-]+/g, '');
}

function detectDelimiter(line: string) {
  if (line.includes('\t')) return '\t';
  if (line.includes('|')) return '|';
  return ',';
}

function parseDelimitedLine(line: string, delimiter: string) {
  return line.split(delimiter).map((part) => part.trim());
}

function parseBooleanLike(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', '是', '对', 'active'].includes(normalized);
}

function buildHeaderMap(header: string[]) {
  const aliases: Record<string, string[]> = {
    playerId: ['playerid'],
    playerName: ['playername', 'player', 'name'],
    teamName: ['team', 'teamname'],
    platform: ['platform', 'server'],
    regionGroup: ['regiongroup', 'region', 'group'],
    gameName: ['gamename', 'account', 'accountname'],
    tagLine: ['tag', 'tagline'],
    puuid: ['puuid'],
    summonerId: ['summonerid', 'summoner'],
    source: ['source'],
    status: ['status'],
    confidence: ['confidence'],
    isPrimary: ['isprimary', 'primary'],
    isActiveCandidate: ['isactivecandidate', 'active'],
    notes: ['notes', 'remark'],
  };

  const normalizedHeader = header.map(normalizeHeader);
  const mapping: Record<string, number> = {};

  for (const [field, aliasList] of Object.entries(aliases)) {
    const matchedIndex = normalizedHeader.findIndex((item) => aliasList.includes(item));
    if (matchedIndex >= 0) mapping[field] = matchedIndex;
  }

  return mapping;
}
function splitAccountName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { gameName: '', tagLine: '' };
  const [gameName, tagLine] = trimmed.split('#');
  return { gameName: gameName?.trim() || '', tagLine: tagLine?.trim() || '' };
}

const AUTO_IMPORT_REGIONS = ['LPL', 'LCK'] as const;
const AUTO_IMPORT_PLATFORM_PRIORITY = [
  'KR',
  'JP1',
  'TW2',
  'VN2',
  'TH2',
  'SG2',
  'PH2',
  'NA1',
  'EUW1',
  'EUN1',
  'BR1',
  'LA1',
  'LA2',
  'OC1',
  'TR1',
  'RU',
] as const;

function isPlaceholderPlayerName(value: string) {
  const trimmed = String(value || '').trim();
  return /^[A-Z]\d{1,2}$/i.test(trimmed);
}

function normalizePlayerGroupRole(role: string) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'SUPPORT' || value === 'SUP') return 'SUP';
  if (value === 'JUNGLE' || value === 'JUN') return 'JUN';
  if (value === 'BOTTOM' || value === 'BOT' || value === 'ADC') return 'ADC';
  if (value === 'MIDDLE' || value === 'MID') return 'MID';
  if (value === 'TOP') return 'TOP';
  return value || 'OTHER';
}

function getEquivalentAutoImportRoles(role: string) {
  const normalized = normalizePlayerGroupRole(role);
  if (normalized === 'SUP') return ['SUP', 'SUPPORT'];
  if (normalized === 'JUN') return ['JUN', 'JUNGLE'];
  if (normalized === 'ADC') return ['ADC', 'BOT', 'BOTTOM'];
  if (normalized === 'MID') return ['MID', 'MIDDLE'];
  if (normalized === 'TOP') return ['TOP'];

  const rawRole = String(role || '').trim().toUpperCase();
  return Array.from(new Set([rawRole, normalized].filter(Boolean)));
}

function buildAutoImportLoosePlayerKey(input: {
  region: string;
  playerName: string;
  role?: string | null;
  teamShortName?: string | null;
  teamName?: string | null;
}) {
  const normalizedPlayerName = normalizeUnicodeText(String(input.playerName || ''));
  const teamPrefixCandidates = Array.from(
    new Set(
      [...getTeamAliasCandidates(input.teamShortName), ...getTeamAliasCandidates(input.teamName)]
        .map((value) => normalizeUnicodeText(String(value || '')))
        .filter(Boolean),
    ),
  );

  let strippedPlayerName = normalizedPlayerName;
  for (const prefix of teamPrefixCandidates) {
    if (!prefix) continue;
    if (strippedPlayerName.length <= prefix.length + 1) continue;
    if (strippedPlayerName.startsWith(prefix)) {
      strippedPlayerName = strippedPlayerName.slice(prefix.length);
      break;
    }
  }

  return [
    String(input.region || '').trim().toUpperCase(),
    strippedPlayerName || normalizedPlayerName,
    normalizePlayerGroupRole(String(input.role || '')),
  ].join('::');
}

function getAutoImportPlayerKey(player: {
  name: string;
  role?: string | null;
  team: { region: string; shortName: string | null; name: string };
}) {
  return buildAutoImportLoosePlayerKey({
    region: player.team.region,
    playerName: player.name,
    role: player.role,
    teamShortName: player.team.shortName,
    teamName: player.team.name,
  });
}

function pushAutoImportSearchCandidate(target: Set<string>, value?: string | null) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return;
  if (isPlaceholderPlayerName(trimmed)) return;
  if (trimmed.length < 2) return;
  target.add(trimmed);
}

type AutoImportSearchPlan = {
  pageCandidates: string[];
  broadCandidates: string[];
  teamCandidates: string[];
  deepSearch: boolean;
};

function buildAutoImportSearchCandidates(input: {
  playerName: string;
  teamName?: string | null;
  teamShortName?: string | null;
  region?: string | null;
  seedPlayerName?: string | null;
  seedPlayerNames?: Array<string | null | undefined>;
  nameVariants?: Array<string | null | undefined>;
  deepSearch?: boolean;
}): AutoImportSearchPlan {
  const pageCandidates = new Set<string>();
  const broadCandidates = new Set<string>();
  const deepSearch = input.deepSearch === true;
  const basePlayerNames = Array.from(
    new Set(
      buildRankDiscoveryNameVariants(input.playerName, [
        input.seedPlayerName,
        ...(input.seedPlayerNames || []),
        ...(input.nameVariants || []),
      ], {
        includeSearchAliases: deepSearch,
        includeDeepSearchAliases: deepSearch,
      }),
    ),
  );

  for (const playerName of basePlayerNames) {
    const compactPlayerName = playerName.replace(/\s+/g, '');
    pushAutoImportSearchCandidate(pageCandidates, playerName);
    pushAutoImportSearchCandidate(pageCandidates, compactPlayerName);
    pushAutoImportSearchCandidate(broadCandidates, playerName);
    pushAutoImportSearchCandidate(broadCandidates, compactPlayerName);
  }

  const teamCandidates = Array.from(
    new Set([
      ...getTeamAliasCandidates(input.teamShortName),
      ...getTeamAliasCandidates(input.teamName),
      String(input.teamShortName || '').trim(),
      String(input.teamName || '').trim(),
    ].filter(Boolean)),
  );

  for (const teamCandidate of teamCandidates) {
    const compactTeamCandidate = String(teamCandidate).replace(/\s+/g, '');
    for (const playerName of basePlayerNames) {
      const compactPlayerName = playerName.replace(/\s+/g, '');
      pushAutoImportSearchCandidate(broadCandidates, `${teamCandidate} ${playerName}`);
      pushAutoImportSearchCandidate(broadCandidates, `${playerName} ${teamCandidate}`);
      pushAutoImportSearchCandidate(broadCandidates, `${compactTeamCandidate}${playerName}`);
      pushAutoImportSearchCandidate(broadCandidates, `${compactTeamCandidate}${compactPlayerName}`);
      pushAutoImportSearchCandidate(broadCandidates, `${compactPlayerName}${compactTeamCandidate}`);
      pushAutoImportSearchCandidate(broadCandidates, `${teamCandidate}${playerName}`);
      pushAutoImportSearchCandidate(broadCandidates, `${playerName}${teamCandidate}`);
    }
  }

  const orderedPageCandidates = Array.from(pageCandidates).slice(0, deepSearch ? 28 : 16);
  const orderedBroadCandidates = Array.from(
    new Set([...orderedPageCandidates, ...Array.from(broadCandidates)]),
  ).slice(0, deepSearch ? 56 : 28);

  return {
    pageCandidates: orderedPageCandidates,
    broadCandidates: orderedBroadCandidates,
    teamCandidates,
    deepSearch,
  };
}

type AutoImportSourceSummary = {
  key: string;
  label: string;
  queryCount: number;
  discoveredCount: number;
  usedCount: number;
  urls: string[];
  errors: string[];
};

function buildAutoImportSourceBreakdown(input: {
  searchPlan: AutoImportSearchPlan;
  candidateAccounts: AutoImportDiscoveredAccount[];
  discoveredAccounts: Awaited<ReturnType<typeof discoverAutoImportAccountsByQueries>>;
  sourceUrlAccounts: Awaited<ReturnType<typeof discoverAutoImportAccountsBySourceUrls>>;
}) {
  const buildSummary = (
    key: string,
    label: string,
    queryCount: number,
    accounts: AutoImportDiscoveredAccount[],
    errors: string[],
  ): AutoImportSourceSummary => {
    const normalizedKey = key.toUpperCase();
    const discovered = accounts.filter(
      (account) =>
        String(account.sourceHint || '')
          .split('|')
          .map((item) => item.trim().toUpperCase())
          .includes(normalizedKey),
    );
    const used = input.candidateAccounts.filter(
      (account) =>
        String(account.sourceHint || '')
          .split('|')
          .map((item) => item.trim().toUpperCase())
          .includes(normalizedKey),
    );
    const urls = Array.from(
      new Set(
        [...discovered, ...used]
          .map((account) => String(account.sourceUrl || '').trim())
          .filter(Boolean),
      ),
    );

    return {
      key,
      label,
      queryCount,
      discoveredCount: discovered.length,
      usedCount: used.length,
      urls,
      errors: Array.from(new Set(errors.filter(Boolean))),
    };
  };

  return [
    buildSummary(
      'DPM',
      'DPM',
      input.searchPlan.pageCandidates.length + input.sourceUrlAccounts.dpmAccounts.length,
      [...input.discoveredAccounts.dpmAccounts, ...input.sourceUrlAccounts.dpmAccounts],
      input.discoveredAccounts.errors.filter((error) => /dpm/i.test(error)),
    ),
    buildSummary(
      'TRACKING',
      'TrackingThePros',
      input.searchPlan.pageCandidates.length + input.sourceUrlAccounts.trackingAccounts.length,
      [...input.discoveredAccounts.trackingAccounts, ...input.sourceUrlAccounts.trackingAccounts],
      [...input.discoveredAccounts.errors, ...input.sourceUrlAccounts.errors].filter((error) => /tracking/i.test(error)),
    ),
    buildSummary(
      'OPGG',
      'OP.GG',
      input.searchPlan.broadCandidates.length,
      input.discoveredAccounts.opggAccounts,
      input.discoveredAccounts.errors.filter((error) => /op\.gg/i.test(error)),
    ),
    buildSummary(
      'LEAGUEPEDIA',
      'Leaguepedia',
      input.searchPlan.pageCandidates.length,
      input.discoveredAccounts.leaguepediaAccounts,
      input.discoveredAccounts.errors.filter((error) => /leaguepedia/i.test(error)),
    ),
    buildSummary(
      'SCOREGG',
      'ScoreGG',
      input.discoveredAccounts.queryCounts?.scoregg ?? input.searchPlan.pageCandidates.length,
      input.discoveredAccounts.scoreggAccounts,
      input.discoveredAccounts.errors.filter((error) => /scoregg/i.test(error)),
    ),
  ];
}

type AutoImportDiscoveredAccount = {
  sourceUrl?: string | null;
  platformLabel: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string | null;
  summonerId?: string | null;
  note?: string | null;
  sourceHint?: 'SEED' | 'OPGG' | 'DPM' | 'TRACKING' | 'LEAGUEPEDIA' | 'SCOREGG' | string | null;
};

function mapExistingEquivalentAccounts(
  players: Array<{
    rankAccounts: Array<{
      platform: string;
      regionGroup: string | null;
      gameName: string;
      tagLine: string | null;
      summonerId: string | null;
      notes: string | null;
      source: string | null;
      status: string | null;
    }>;
  }>,
) {
  return players.flatMap((player) =>
    (player.rankAccounts || [])
      .filter((account) => !isPlaceholderCoverageAccount(account))
      .filter((account) => {
        const notes = String(account.notes || '');
        const status = String(account.status || '').toUpperCase();
        if (status !== 'ARCHIVED') return true;
        return !/低质量自动发现账号|重复账号|Riot 404|not_found|无效映射/iu.test(notes);
      })
      .filter((account) => String(account.gameName || '').trim() && (String(account.tagLine || '').trim() || account.summonerId))
      .map((account) => ({
        sourceUrl: extractAutoImportSourceUrl(account.notes) || null,
        platformLabel: String(account.platform || '').trim().toUpperCase(),
        platform: String(account.platform || '').trim().toUpperCase(),
        regionGroup: String(account.regionGroup || '').trim().toUpperCase() || 'ASIA',
        gameName: String(account.gameName || '').trim(),
        tagLine: String(account.tagLine || '').trim() || null,
        summonerId: String(account.summonerId || '').trim() || null,
        note:
          [account.notes, String(account.status || '').toUpperCase() === 'ARCHIVED' ? '兄弟记录归档真号回流' : '兄弟记录已有账号']
            .filter(Boolean)
            .join('\n') || '兄弟记录已有账号',
        sourceHint: String(account.source || 'MANUAL').trim().toUpperCase() || 'MANUAL',
      })),
  );
}

async function discoverAutoImportAccountsByQueries(searchPlan: AutoImportSearchPlan) {
  const dpmAccounts: AutoImportDiscoveredAccount[] = [];
  const opggAccounts: AutoImportDiscoveredAccount[] = [];
  const trackingAccounts: AutoImportDiscoveredAccount[] = [];
  const leaguepediaAccounts: AutoImportDiscoveredAccount[] = [];
  const scoreggAccounts: AutoImportDiscoveredAccount[] = [];
  const errors: string[] = [];
  const sourceUrls = new Set<string>();
  const scoreggProcessedQueries = new Set<string>();

  for (const searchCandidate of searchPlan.pageCandidates) {
    const normalizedScoreggQuery = normalizeAutoImportLookup(searchCandidate).toLowerCase();
    const shouldQueryScoregg =
      Boolean(normalizedScoreggQuery) && !scoreggProcessedQueries.has(normalizedScoreggQuery);
    if (shouldQueryScoregg) {
      scoreggProcessedQueries.add(normalizedScoreggQuery);
    }

    const [dpm, tracking, scoregg] = await Promise.all([
      discoverProRankAccountsFromDpm(searchCandidate).catch(() => null),
      discoverProRankAccountsFromTrackingThePros(searchCandidate).catch(() => null),
      shouldQueryScoregg
        ? discoverProRankAccountsFromScoregg(searchCandidate, {
            teamCandidates: searchPlan.teamCandidates,
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (dpm?.success) {
      sourceUrls.add(dpm.sourceUrl || '');
      dpmAccounts.push(...dpm.accounts.map((account) => ({ ...account, sourceHint: 'DPM' as const })));
    } else if (dpm?.error) {
      errors.push(dpm.error);
    }

    if (tracking?.success) {
      sourceUrls.add(tracking.sourceUrl || '');
      trackingAccounts.push(...tracking.accounts.map((account) => ({ ...account, sourceHint: 'TRACKING' as const })));
    } else if (tracking?.error) {
      errors.push(tracking.error);
    }

    if (scoregg?.success) {
      sourceUrls.add(scoregg.sourceUrl || '');
      scoreggAccounts.push(...scoregg.accounts.map((account) => ({ ...account, sourceHint: 'SCOREGG' as const })));
    } else if (scoregg?.error) {
      errors.push(scoregg.error);
    }
  }

  for (const searchCandidate of searchPlan.broadCandidates) {
    const opgg = await discoverProRankAccountsFromOpgg(searchCandidate).catch(() => null);
    if (opgg?.success) {
      sourceUrls.add(opgg.sourceUrl || '');
      opggAccounts.push(...opgg.accounts.map((account) => ({ ...account, sourceHint: 'OPGG' as const })));
    } else if (opgg?.error) {
      errors.push(opgg.error);
    }
  }

  const preliminaryCandidates = pickPreferredAutoImportAccounts([
    ...scoreggAccounts,
    ...trackingAccounts,
    ...opggAccounts,
    ...dpmAccounts,
  ]);

  const shouldFetchLeaguepedia =
    preliminaryCandidates.length < 4 ||
    !preliminaryCandidates.some((account) => normalizeAutoImportPlatform(account.platform) === 'KR');

  if (shouldFetchLeaguepedia) {
    for (const searchCandidate of searchPlan.pageCandidates) {
      const leaguepedia = await discoverLeaguepediaRankAccounts(searchCandidate).catch(() => null);
      if (leaguepedia?.success) {
        sourceUrls.add(leaguepedia.sourceUrl || '');
        leaguepediaAccounts.push(
          ...leaguepedia.accounts.map((account) => ({ ...account, sourceHint: 'LEAGUEPEDIA' as const })),
        );
      } else if (leaguepedia?.error) {
        errors.push(leaguepedia.error);
      }

      const merged = pickPreferredAutoImportAccounts([
        ...scoreggAccounts,
        ...trackingAccounts,
        ...opggAccounts,
        ...dpmAccounts,
        ...leaguepediaAccounts,
      ]);
      const hasKr = merged.some((account) => normalizeAutoImportPlatform(account.platform) === 'KR');
      if (merged.length >= 6 && hasKr) break;
    }
  }

  return {
    dpmAccounts,
    opggAccounts,
    trackingAccounts,
    leaguepediaAccounts,
    scoreggAccounts,
    queryCounts: {
      scoregg: scoreggProcessedQueries.size,
    },
    errors: Array.from(new Set(errors.filter(Boolean))),
    sourceUrls: Array.from(sourceUrls).filter(Boolean),
  };
}

async function discoverAutoImportAccountsBySourceUrls(sourceUrls: Array<string | null | undefined>) {
  const dpmAccounts: AutoImportDiscoveredAccount[] = [];
  const trackingAccounts: AutoImportDiscoveredAccount[] = [];
  const errors: string[] = [];
  const discoveredSourceUrls = new Set<string>();
  const uniqueUrls = Array.from(new Set(sourceUrls.map((item) => String(item || '').trim()).filter(Boolean)));

  for (const sourceUrl of uniqueUrls) {
    if (sourceUrl.includes('dpm.lol')) {
      const dpm = await discoverProRankAccountsFromDpmUrl(sourceUrl).catch(() => null);
      if (dpm?.success) {
        discoveredSourceUrls.add(dpm.sourceUrl || sourceUrl);
        dpmAccounts.push(...dpm.accounts.map((account) => ({ ...account, sourceHint: 'DPM' as const })));
      } else if (dpm?.error) {
        errors.push(dpm.error);
      }
      continue;
    }

    if (sourceUrl.includes('trackingthepros.com')) {
      const tracking = await discoverProRankAccountsFromTrackingTheProsUrl(sourceUrl).catch(() => null);
      if (tracking?.success) {
        discoveredSourceUrls.add(tracking.sourceUrl || sourceUrl);
        trackingAccounts.push(...tracking.accounts.map((account) => ({ ...account, sourceHint: 'TRACKING' as const })));
      } else if (tracking?.error) {
        errors.push(tracking.error);
      }
    }
  }

  return {
    dpmAccounts,
    trackingAccounts,
    errors: Array.from(new Set(errors.filter(Boolean))),
    sourceUrls: Array.from(discoveredSourceUrls).filter(Boolean),
  };
}

function scoreAutoImportPlayer(
  player: {
    id: string;
    rankAccounts: Array<{ isPrimary: boolean; isActiveCandidate: boolean; confidence: number | null; status?: string | null }>;
    updatedAt: Date;
  },
  preferredPlayerId?: string,
) {
  const activeAccounts = player.rankAccounts.filter((account) => String(account.status || '').toUpperCase() !== 'ARCHIVED');
  return (
    (player.id === preferredPlayerId ? 100000 : 0) +
    activeAccounts.length * 100 +
    activeAccounts.filter((account) => account.isPrimary).length * 50 +
    activeAccounts.filter((account) => account.isActiveCandidate).length * 25 +
    activeAccounts.reduce((sum, account) => sum + toNumber(account.confidence) * 10, 0) +
    new Date(player.updatedAt).getTime() / 1000000000
  );
}

function getCurrentRealRankAccountCount(player: {
  rankAccounts: Array<{
    gameName?: string | null;
    tagLine?: string | null;
    puuid?: string | null;
    notes?: string | null;
    status?: string | null;
  }>;
}) {
  return (player.rankAccounts || []).filter((account) => !isPlaceholderCoverageAccount(account)).length;
}

function rankAutoImportPriorityBucket(realAccountCount: number) {
  if (realAccountCount === 1) return 0;
  if (realAccountCount === 0) return 1;
  return 2;
}

function pickCanonicalAutoImportPlayer<T extends {
  id: string;
  rankAccounts: Array<{ isPrimary: boolean; isActiveCandidate: boolean; confidence: number | null; status?: string | null }>;
  updatedAt: Date;
}>(players: T[], preferredPlayerId?: string) {
  const RECENCY_CANONICAL_THRESHOLD_MS = 5 * 60 * 1000;
  return players
    .slice()
    .sort((left, right) => {
      const updatedAtDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      if (Math.abs(updatedAtDiff) >= RECENCY_CANONICAL_THRESHOLD_MS) {
        return updatedAtDiff;
      }
      return scoreAutoImportPlayer(right, preferredPlayerId) - scoreAutoImportPlayer(left, preferredPlayerId);
    })[0];
}

function getAutoImportSourceWeight(sourceHint?: string | null) {
  const normalized = String(sourceHint || '').trim().toUpperCase();
  if (normalized === 'SEED') return 400;
  if (normalized === 'OPGG') return 350;
  if (normalized === 'DPM') return 320;
  if (normalized === 'LEAGUEPEDIA') return 220;
  return 120;
}

function buildAutoImportConfidence(platform: string, index: number, sourceHint?: string | null, sourceCount = 1) {
  const normalizedPlatform = String(platform || '').trim().toUpperCase();
  const sourceBonus = Math.min(0.08, Math.max(0, sourceCount - 1) * 0.03);
  const sourceFloor =
    String(sourceHint || '').trim().toUpperCase() === 'SEED'
      ? 0.92
      : String(sourceHint || '').trim().toUpperCase() === 'OPGG'
        ? 0.86
        : String(sourceHint || '').trim().toUpperCase() === 'DPM'
          ? 0.82
          : 0.72;

  const baseByIndex =
    normalizedPlatform === 'KR'
      ? [0.95, 0.92, 0.89, 0.86, 0.83, 0.8, 0.77, 0.74]
      : [0.86, 0.83, 0.8, 0.77, 0.74, 0.71, 0.68, 0.65];
  const fallbackBase = normalizedPlatform === 'KR' ? 0.72 : 0.62;
  const base = baseByIndex[index] ?? fallbackBase;
  return Number(Math.min(0.99, Math.max(sourceFloor, base + sourceBonus)).toFixed(2));
}

function normalizeAutoImportPlatform(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase();
}

function buildAutoImportAccountKey(input: {
  platform?: string | null;
  gameName?: string | null;
  tagLine?: string | null;
  summonerId?: string | null;
}) {
  const normalizedTagOrSummoner = input.tagLine
    ? normalizeUnicodeText(String(input.tagLine || ''))
    : `sid:${normalizeUnicodeText(String(input.summonerId || ''))}`;
  return [
    normalizeAutoImportPlatform(input.platform),
    normalizeUnicodeText(String(input.gameName || '')),
    normalizedTagOrSummoner,
  ].join('::');
}

const BLOCKED_AUTO_IMPORT_ACCOUNT_KEYS = new Set<string>([
  buildAutoImportAccountKey({ platform: 'KR', gameName: '엔피아', tagLine: '0107' }),
  buildAutoImportAccountKey({ platform: 'KR', gameName: '형석자동차12', tagLine: '8468' }),
  buildAutoImportAccountKey({ platform: 'KR', gameName: '樱吹雪Ycx', tagLine: 'Ycx' }),
  buildAutoImportAccountKey({ platform: 'KR', gameName: 'magickshield', tagLine: '킹콩킹콩d' }),
  buildAutoImportAccountKey({ platform: 'KR', gameName: '킹콩출현', tagLine: '킹콩킹콩' }),
  buildAutoImportAccountKey({ platform: 'BR1', gameName: 'Rio de Janeiro', tagLine: '브라질' }),
  buildAutoImportAccountKey({ platform: 'NA1', gameName: '안녕 캐나다', tagLine: '캐나다' }),
  buildAutoImportAccountKey({ platform: 'NA1', gameName: 'Pepe babo', tagLine: 'LYON' }),
]);

function isBlockedAutoImportAccount(input: {
  platform?: string | null;
  gameName?: string | null;
  tagLine?: string | null;
  summonerId?: string | null;
}) {
  return BLOCKED_AUTO_IMPORT_ACCOUNT_KEYS.has(
    buildAutoImportAccountKey({
      platform: normalizeAutoImportPlatform(input.platform),
      gameName: input.gameName,
      tagLine: input.tagLine,
      summonerId: input.summonerId,
    }),
  );
}

type LocalAutoImportAccount = {
  platformLabel: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string;
  sourceUrl?: string;
  note?: string;
};

const LOCAL_PRIORITY_AUTO_IMPORT_ACCOUNTS = new Map<string, LocalAutoImportAccount[]>([
  [
    'LPL::knight',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '이센스God',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
        note: '本地优先种子：OP.GG 职业榜确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'kk9qwq',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/knight',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'BR',
        platform: 'BR1',
        regionGroup: 'AMERICAS',
        gameName: 'gaotianliang',
        tagLine: 'is9',
        sourceUrl: 'https://www.trackingthepros.com/player/knight',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'qweqweqwr',
        tagLine: 'NA1',
        sourceUrl: 'https://www.trackingthepros.com/player/knight',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::xiaohao',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'xiaohao',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/summoners/kr/xiaohao-KR1',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '강아지좋아',
        tagLine: 'KR3',
        sourceUrl: 'https://www.trackingthepros.com/player/xiaohao',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'xiaoohao',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/xiaohao',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Dadadadududu',
        tagLine: 'cyndi',
        sourceUrl: 'https://www.trackingthepros.com/player/xiaohao',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::zdz',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Zdz',
        tagLine: '1203',
        sourceUrl: 'https://op.gg/lol/summoners/kr/Zdz-1203',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '다거짓이였어',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Zdz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '2891447165093696',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Zdz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'vghgff',
        tagLine: 'ADADC',
        sourceUrl: 'https://www.trackingthepros.com/player/Zdz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::photic',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'qiqi77',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
        note: '本地优先种子：OP.GG 职业榜确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '77010514del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Photic',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '젠레스존제로우',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Photic',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '95140221del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Photic',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::hongq',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'tfhto',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
        note: '本地优先种子：OP.GG 职业榜确认',
      },
      {
        platformLabel: 'BR',
        platform: 'BR1',
        regionGroup: 'AMERICAS',
        gameName: 'Doggokule',
        tagLine: '1234',
        sourceUrl: 'https://www.trackingthepros.com/player/HongQ',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::naiyou',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'naiyou qaq',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
        note: '本地优先种子：OP.GG 职业榜确认',
      },
    ],
  ],
  [
    'LPL::angel',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '아창란o식물',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
        note: '本地优先种子：OP.GG 职业榜确认',
      },
    ],
  ],
  [
    'LPL::369',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Xxqqq',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/369',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '78120855del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/369',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::monki',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'WangPiaoLiang',
        tagLine: '梦齐大魔王',
        sourceUrl: 'https://www.trackingthepros.com/player/Monki',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::bin',
    [
      {
        platformLabel: 'BR',
        platform: 'BR1',
        regionGroup: 'AMERICAS',
        gameName: 'chenzebin',
        tagLine: '5599',
        sourceUrl: 'https://www.trackingthepros.com/player/Bin',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'BLGBin ge',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Bin',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::elk',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '91051146del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Elk',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '95110216del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Elk',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::flandre',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '77060238del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Flandre',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '95310226del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Flandre',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::karis',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Karis',
        tagLine: 'KR4',
        sourceUrl: 'https://op.gg/lol/summoners/kr/Karis-KR4/ingame',
        note: '本地优先种子：OP.GG 职业标签确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '101512009del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Karis',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '신난 망고',
        tagLine: '0417',
        sourceUrl: 'https://www.trackingthepros.com/player/Karis',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::leave',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'leave',
        tagLine: '444',
        sourceUrl: 'https://op.gg/lol/summoners/kr/leave-444',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '敗北の少年',
        tagLine: '053',
        sourceUrl: 'https://www.trackingthepros.com/player/Leave',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'sonjin',
        tagLine: '1675',
        sourceUrl: 'https://www.trackingthepros.com/player/Leave',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::meiko',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '미나모토 치세',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Meiko',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '95270217del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Meiko',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '1773786del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Meiko',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::liangchen',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'LiangChen',
        tagLine: '0611',
        sourceUrl: 'https://op.gg/lol/summoners/kr/LiangChen-0611',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
    ],
  ],
  [
    'LPL::moham',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Moham',
        tagLine: 'OMG',
        sourceUrl: 'https://op.gg/lol/summoners/kr/Moham-OMG',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '张海超',
        tagLine: 'LPL',
        sourceUrl: 'https://www.trackingthepros.com/player/Moham',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'Red Moham',
        tagLine: 'hihi',
        sourceUrl: 'https://lol.fandom.com/wiki/Moham',
        note: '本地优先种子：Leaguepedia 公开 Soloqueue ID',
      },
    ],
  ],
  [
    'LPL::grizzly',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Grizzly',
        tagLine: 'KR3',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
        note: '本地优先种子：OP.GG 职业榜确认',
      },
    ],
  ],
  [
    'LPL::1xn',
    [
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'LNG 1xn',
        tagLine: 'GOAT',
        sourceUrl: 'https://op.gg/lol/summoners/euw/LNG%201xn-GOAT',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Xonxwaqdaswx',
        tagLine: '0451',
        sourceUrl: 'https://www.trackingthepros.com/player/1xn',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'gbb11',
        tagLine: 'wsdas',
        sourceUrl: 'https://www.trackingthepros.com/player/1xn',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::cube',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '일이삼사',
        tagLine: 'KR11',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
        note: '本地优先种子：OP.GG 职业榜文本确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'WE choukesi',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Cube',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::heng',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'H1ng',
        tagLine: 'Heng',
        sourceUrl: 'https://op.gg/lol/summoners/kr/H1ng-Heng',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'XiXi',
        tagLine: '716',
        sourceUrl: 'https://www.trackingthepros.com/player/Heng',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Belief',
        tagLine: '716',
        sourceUrl: 'https://www.trackingthepros.com/player/Heng',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::missing',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'mtrngrxsyl',
        tagLine: '6146',
        sourceUrl: 'https://www.trackingthepros.com/player/Missing',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Manycpyfjtjkyxf',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Missing',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '79461219del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Missing',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'msblmktmsmsy',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Missing',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::xun',
    [
      {
        platformLabel: 'BR',
        platform: 'BR1',
        regionGroup: 'AMERICAS',
        gameName: 'eewqoeowqeqwoo',
        tagLine: '2223',
        sourceUrl: 'https://www.trackingthepros.com/player/XUN',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '90051229del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/XUN',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '2639432731706400',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/XUN',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '2891444741678432',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/XUN',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '6784878',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/XUN',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::viper',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Blue',
        tagLine: 'KR33',
        sourceUrl: 'https://www.trackingthepros.com/player/Viper',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Bot01',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Viper',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'jkr9bcQujpLZPySS',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Viper',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'BR',
        platform: 'BR1',
        regionGroup: 'AMERICAS',
        gameName: 'Bomdia',
        tagLine: '0313',
        sourceUrl: 'https://www.trackingthepros.com/player/Viper',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Viscose',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Viper',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::jwei',
    [
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'jweithsro',
        tagLine: 'jwei',
        sourceUrl: 'https://op.gg/lol/summoners/euw/jweithsro-jwei',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'haiyaoduojiu',
        tagLine: '1111',
        sourceUrl: 'https://www.trackingthepros.com/player/Jwei',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::about',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '네 주인님',
        tagLine: '5508',
        sourceUrl: 'https://www.trackingthepros.com/player/About',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::creme',
    [
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'cinema',
        tagLine: '6800',
        sourceUrl: 'https://www.trackingthepros.com/player/Creme',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::croco',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'qetadgzcb135',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Croc',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::tarzan',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'jgggggg',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Tarzan',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::shanks',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '98133485del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Shanks',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::parukia',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'qwerqwerqw',
        tagLine: 'KR1',
        sourceUrl: 'https://lol.fandom.com/wiki/Parukia',
        note: '本地优先种子：Leaguepedia 公开 Soloqueue ID',
      },
    ],
  ],
  [
    'LPL::zhuo',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'ovoowo',
        tagLine: '0213',
        sourceUrl: 'https://www.trackingthepros.com/player/Zhuo',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '2891447904060480',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Zhuo',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::tangyuan',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Bae Suzy',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Tangyuan',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '2782503080510496',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Tangyuan',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::hena',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '밤이싫어',
        tagLine: 'kr9',
        sourceUrl: 'https://www.trackingthepros.com/player/Hena',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'AD King',
        tagLine: 'LYON',
        sourceUrl: 'https://www.trackingthepros.com/player/Hena',
        note: '本地优先种子：TrackingThePros 隐藏 inactive 账号确认',
      },
    ],
  ],
  [
    'LPL::guwon',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '관 모',
        tagLine: 'KR2',
        sourceUrl: 'https://www.trackingthepros.com/player/Guwon',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::juhan',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Juhana',
        tagLine: 'IsYou',
        sourceUrl: 'https://www.trackingthepros.com/player/Juhan',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'Juhana',
        tagLine: 'GXP',
        sourceUrl: 'https://www.trackingthepros.com/player/Juhan',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::starry',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'May',
        tagLine: '0411',
        sourceUrl: 'https://www.trackingthepros.com/player/Starry',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::haichao',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '나 하이차오인데lpl최고미드다',
        tagLine: '7068',
        sourceUrl: 'https://www.trackingthepros.com/player/haichao',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::sheer',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '海牛阿福的勇士',
        tagLine: '666',
        sourceUrl: 'https://op.gg/lol/summoners/kr/%E6%B5%B7%E7%89%9B%E9%98%BF%E7%A6%8F%E7%9A%84%E5%8B%87%E5%A3%AB-666',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
    ],
  ],
  [
    'LPL::saber',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Sama',
        tagLine: 'KR2',
        sourceUrl: 'https://www.trackingthepros.com/player/Saber',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Aemeath',
        tagLine: '爱弥斯',
        sourceUrl: 'https://www.trackingthepros.com/player/Saber',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '부탁해',
        tagLine: 'KR20',
        sourceUrl: 'https://www.trackingthepros.com/player/Saber',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::shaoye',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Robin',
        tagLine: '星期日',
        sourceUrl: 'https://www.trackingthepros.com/player/Shaoye',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::ycx',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '改成归途有风',
        tagLine: 'yfcg',
        sourceUrl: 'https://www.trackingthepros.com/player/Ycx',
        note: '本地优先种子：历史保留真号',
      },
    ],
  ],
  [
    'LPL::jiaqi',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'wanan theworld',
        tagLine: 'xdbx1',
        sourceUrl: 'https://www.trackingthepros.com/player/JiaQi',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'lazy',
        tagLine: 'xxx',
        sourceUrl: 'https://trackingthepros.com/player/JiaQi',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '徘徊着的',
        tagLine: 'asdf',
        sourceUrl: 'https://trackingthepros.com/player/JiaQi',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::hoya',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '今日牛市',
        tagLine: '123',
        sourceUrl: 'https://www.trackingthepros.com/player/Hoya',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Firelights',
        tagLine: '윤용호',
        sourceUrl: 'https://www.trackingthepros.com/player/Hoya',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::junhao',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Shylie',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Junhao',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::junjia',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '78571134del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/JunJia',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'fragile',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/JunJia',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::feather',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Wiedergeburt',
        tagLine: '0801',
        sourceUrl: 'https://www.trackingthepros.com/player/Feather',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::care',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Carecare1',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Care',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Yondaime',
        tagLine: 'Luo',
        sourceUrl: 'https://www.trackingthepros.com/player/Care',
        note: '本地优先种子：TrackingThePros 隐藏 inactive 账号确认',
      },
    ],
  ],
  [
    'LPL::erha',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'qwerfdlp',
        tagLine: '23967',
        sourceUrl: 'https://dpm.lol/pro/Erha',
        note: '本地优先种子：DPM 公开页面确认',
      },
    ],
  ],
  [
    'LPL::soboro',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Vanana',
        tagLine: '0110',
        sourceUrl: 'https://www.trackingthepros.com/player/Soboro',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::zika',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '3255264157337088',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Zika',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::jiejie',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'felisa',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/JieJie',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '20751134del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/JieJie',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '95230219del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/JieJie',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '2639435278730592',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/JieJie',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'See u lceland',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/JieJie',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '2891445861918656',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/JieJie',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'Dan Xiao Gu 12',
        tagLine: 'NA1',
        sourceUrl: 'https://www.trackingthepros.com/player/JieJie',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::xiaohu',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'mashushu',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/xiaohu',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Swalla',
        tagLine: 'KR11',
        sourceUrl: 'https://www.trackingthepros.com/player/xiaohu',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LPL::re0',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '레무링',
        tagLine: 're0',
        sourceUrl: 'https://op.gg/lol/summoners/kr/%EB%A0%88%EB%AC%B4%EB%A7%81-re0',
        note: '本地优先种子：OP.GG 公开页面确认',
      },
    ],
  ],
  [
    'LPL::sasi',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Venus',
        tagLine: 'zypp',
        sourceUrl: 'https://www.trackingthepros.com/player/sasi',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::ucal',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '미드가우갈',
        tagLine: '가내현',
        sourceUrl: 'https://www.trackingthepros.com/player/Ucal',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::faker',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Deft',
        tagLine: '8366',
        sourceUrl: 'https://new.trackingthepros.com/player/Faker',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'wincg',
        tagLine: '84926',
        sourceUrl: 'https://www.trackingthepros.com/player/Faker',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'Neo Hide on bush',
        tagLine: 'NA1',
        sourceUrl: 'https://www.trackingthepros.com/player/Faker',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::oner',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'T1 Oner',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Oner',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'Thinking PLZ',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Oner',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'Wakanda f0rever',
        tagLine: 'NA1',
        sourceUrl: 'https://www.trackingthepros.com/player/Oner',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::doran',
    [
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'HO1WQYETAN',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Doran',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'F1F1F1F1',
        tagLine: 'NA1',
        sourceUrl: 'https://www.trackingthepros.com/player/Doran',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::chovy',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '맞짱깔류민석',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Chovy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'Shrimp Shark',
        tagLine: '43083',
        sourceUrl: 'https://www.trackingthepros.com/player/Chovy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'Jeremy Bernstein',
        tagLine: '95102',
        sourceUrl: 'https://www.trackingthepros.com/player/Chovy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::peyz',
    [
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'ABCDPEYZ',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Peyz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'qwewqrsad2w',
        tagLine: '11111',
        sourceUrl: 'https://www.trackingthepros.com/player/Peyz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::perfect',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'PerfecT',
        tagLine: '132',
        sourceUrl: 'https://www.trackingthepros.com/player/PerfecT',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::andil',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'KRX Joker',
        tagLine: 'A i',
        sourceUrl: 'https://www.trackingthepros.com/player/Andil',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::life',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '나는 고등학교에 가본 적이없어',
        tagLine: 'reze',
        sourceUrl: 'https://www.trackingthepros.com/player/Life',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Doinb',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Life',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::pyosik',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Soopsik',
        tagLine: 'KR2',
        sourceUrl: 'https://www.trackingthepros.com/player/Pyosik',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'i never glve up',
        tagLine: 'NA1',
        sourceUrl: 'https://www.trackingthepros.com/player/Pyosik',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::ghost',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '궁극의 고스트',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Ghost',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::namgung',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'BRO Namgung',
        tagLine: '1004',
        sourceUrl: 'https://www.trackingthepros.com/player/Namgung',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::gideon',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '초록이필요해',
        tagLine: 'KR3',
        sourceUrl: 'https://www.trackingthepros.com/player/GIDEON',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '초록이필요해',
        tagLine: 'KR2',
        sourceUrl: 'https://www.trackingthepros.com/player/GIDEON',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::roamer',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '당신 탓인 걸요',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Roamer',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'TLTLTL',
        tagLine: 'TLTL',
        sourceUrl: 'https://www.trackingthepros.com/player/Roamer',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::teddy',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Teddy',
        tagLine: 'sss',
        sourceUrl: 'https://www.trackingthepros.com/player/Teddy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'iVCTrw7RsfmvmIEw',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Teddy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '이브이',
        tagLine: '이 브',
        sourceUrl: 'https://www.trackingthepros.com/player/Teddy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'VV5tg4tMjMOjVKPv',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Teddy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'JlN SUNG Park',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Teddy',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::kingen',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '갯벌타워',
        tagLine: 'KR2',
        sourceUrl: 'https://www.trackingthepros.com/player/Kingen',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::lehends',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Always be crying',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Lehends',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::siwoo',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'TOPKING',
        tagLine: 'asd',
        sourceUrl: 'https://www.trackingthepros.com/player/Siwoo',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DK Siwoo',
        tagLine: 'siwoo',
        sourceUrl: 'https://www.trackingthepros.com/player/Siwoo',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::dudu',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '따봉 람머스',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/DuDu',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '100590781del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/DuDu',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'human is evil',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/DuDu',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::scout',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '미북이',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Scout',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'lazzl',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Scout',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '14March',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Scout',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'See u Iceland',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Scout',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Charlie2',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Scout',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::rich',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'FA Rich',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Rich',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '대머리도적',
        tagLine: '롤링썬더',
        sourceUrl: 'https://www.trackingthepros.com/player/Rich',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '100780808del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Rich',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '탑원거리',
        tagLine: 'KR123',
        sourceUrl: 'https://www.trackingthepros.com/player/Rich',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::willer',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'KRX Willer',
        tagLine: 'KRX',
        sourceUrl: 'https://www.trackingthepros.com/player/Willer',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '김정현',
        tagLine: 'Kjh1',
        sourceUrl: 'https://www.trackingthepros.com/player/Willer',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'White Whales',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Willer',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::duro',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Duro',
        tagLine: 'Gen',
        sourceUrl: 'https://www.trackingthepros.com/player/Duro',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::deokdam',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'deokdam',
        tagLine: '225',
        sourceUrl: 'https://trackingthepros.com/player/deokdam',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'NA',
        platform: 'NA1',
        regionGroup: 'AMERICAS',
        gameName: 'guest mode',
        tagLine: 'NA1',
        sourceUrl: 'https://trackingthepros.com/player/deokdam',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::aiming',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '아이린',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Aiming',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::showmaker',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DK ShowMaker',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/ShowMaker',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DWG KIA',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/ShowMaker',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::canyon',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'HUANG TONG DAYE',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Canyon',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'JUGKlNG',
        tagLine: 'kr',
        sourceUrl: 'https://www.trackingthepros.com/player/Canyon',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'BR',
        platform: 'BR1',
        regionGroup: 'AMERICAS',
        gameName: 'São Paulo',
        tagLine: '3628',
        sourceUrl: 'https://www.trackingthepros.com/player/Canyon',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '그어살',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Canyon',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'happy gαme',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Canyon',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::bdd',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '기찮게하지마',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Bdd',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '아구몬',
        tagLine: '0509',
        sourceUrl: 'https://www.trackingthepros.com/player/Bdd',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '8111597del',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Bdd',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '파피몬',
        tagLine: '1111',
        sourceUrl: 'https://www.trackingthepros.com/player/Bdd',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '412431234',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Bdd',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::clozer',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '클로짝',
        tagLine: '0727',
        sourceUrl: 'https://www.trackingthepros.com/player/Clozer',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::cuzz',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '독침붕',
        tagLine: '딱충이',
        sourceUrl: 'https://www.trackingthepros.com/player/Cuzz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Cuzz',
        tagLine: 'KR1',
        sourceUrl: 'https://www.trackingthepros.com/player/Cuzz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'EUW',
        platform: 'EUW1',
        regionGroup: 'EUROPE',
        gameName: 'Beube',
        tagLine: 'EUW',
        sourceUrl: 'https://www.trackingthepros.com/player/Cuzz',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::career',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '인간 병기',
        tagLine: '0829',
        sourceUrl: 'https://dpm.lol/%EC%9D%B8%EA%B0%84%20%EB%B3%91%EA%B8%B0-0829',
        note: '本地优先种子：DPM 公开页面确认',
      },
    ],
  ],
  [
    'LCK::peter',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '아름다운 나라',
        tagLine: 'K T',
        sourceUrl: 'https://www.trackingthepros.com/player/Peter',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::pollu',
    [
    ],
  ],
  [
    'LCK::sponge',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Not Bad',
        tagLine: 'KR2',
        sourceUrl: 'https://www.trackingthepros.com/player/Sponge',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'sgsdfhaaaew',
        tagLine: 'kr2',
        sourceUrl: 'https://www.trackingthepros.com/player/Sponge',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
  [
    'LCK::taeyoon',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '고수닭갈비',
        tagLine: '먹고싶다요',
        sourceUrl: 'https://dpm.lol/pro/Taeyoon',
        note: '本地优先种子：DPM 公开页面确认',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Airline',
        tagLine: 'A A',
        sourceUrl: 'https://dpm.lol/pro/Taeyoon',
        note: '本地优先种子：DPM 公开页面确认',
      },
    ],
  ],
  [
    'LCK::casting',
    [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Mela',
        tagLine: 'KR11',
        sourceUrl: 'https://www.trackingthepros.com/player/Casting',
        note: '本地优先种子：TrackingThePros 公开页面确认',
      },
    ],
  ],
]);

function getLocalPriorityAutoImportAccounts(input: { region: string; playerName: string }) {
  const key = `${String(input.region || '').trim().toUpperCase()}::${String(input.playerName || '').trim().toLowerCase()}`;
  return LOCAL_PRIORITY_AUTO_IMPORT_ACCOUNTS.get(key) || [];
}

function findFallbackKnownSeed(input: {
  region: string;
  teamShortName?: string | null;
  teamName?: string | null;
  playerName: string;
  role?: string | null;
}) {
  const normalizedRegion = String(input.region || '').trim().toUpperCase();
  const normalizedPlayerName = normalizeUnicodeText(String(input.playerName || ''));
  const normalizedRole = normalizePlayerGroupRole(String(input.role || ''));
  const normalizedTeamShortName = String(input.teamShortName || '').trim().toUpperCase();
  const normalizedTeamName = String(input.teamName || '').trim().toUpperCase();

  return (
    KNOWN_PRO_RANK_SEEDS.find((seed) => {
      if (String(seed.region || '').trim().toUpperCase() !== normalizedRegion) return false;
      if (normalizeUnicodeText(String(seed.playerName || '')) !== normalizedPlayerName) return false;

      const seedRole = normalizePlayerGroupRole(String(seed.role || ''));
      const seedTeam = String(seed.teamShortName || '').trim().toUpperCase();
      const teamMatches =
        !seedTeam || seedTeam === normalizedTeamShortName || seedTeam === normalizedTeamName;
      const roleMatches = !seedRole || seedRole === normalizedRole;

      return (teamMatches && roleMatches) || roleMatches || teamMatches;
    }) || null
  );
}

function findExactKnownSeedByName(input: {
  region: string;
  playerName: string;
}) {
  const normalizedRegion = String(input.region || '').trim().toUpperCase();
  const normalizedPlayerName = String(input.playerName || '').trim().toLowerCase();
  return (
    KNOWN_PRO_RANK_SEEDS.find(
      (seed) =>
        String(seed.region || '').trim().toUpperCase() === normalizedRegion &&
        String(seed.playerName || '').trim().toLowerCase() === normalizedPlayerName,
    ) || null
  );
}

function dedupeKnownSeedMatches(seeds: KnownProRankSeed[]) {
  return Array.from(
    seeds.reduce((map, seed) => {
      const key = [
        String(seed.region || '').trim().toUpperCase(),
        String(seed.teamShortName || '').trim().toUpperCase(),
        normalizeUnicodeText(String(seed.playerName || '')),
        normalizePlayerGroupRole(String(seed.role || '')),
      ].join('::');
      map.set(key, seed);
      return map;
    }, new Map<string, KnownProRankSeed>()),
  ).map(([, seed]) => seed);
}

function pickPreferredAutoImportAccounts<
  T extends {
    platform?: string | null;
    gameName?: string | null;
    tagLine?: string | null;
    summonerId?: string | null;
    sourceHint?: string | null;
    sourceUrl?: string | null;
    note?: string | null;
  },
>(accounts: T[], maxCount = 32) {
  const supportedPlatforms = new Set(AUTO_IMPORT_PLATFORM_PRIORITY);
  const deduped = Array.from(
    accounts.reduce((map, account) => {
      const platform = normalizeAutoImportPlatform(account.platform);
      if (!supportedPlatforms.has(platform as (typeof AUTO_IMPORT_PLATFORM_PRIORITY)[number])) return map;
      const hasResolvableIdentity = String(account.tagLine || '').trim() || String(account.summonerId || '').trim();
      if (!String(account.gameName || '').trim() || !hasResolvableIdentity) return map;
      if (isBlockedAutoImportAccount(account)) return map;
      const key = buildAutoImportAccountKey(account);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          ...account,
          sourceHint: account.sourceHint || null,
          sourceHints: account.sourceHint ? [String(account.sourceHint)] : [],
          sourceUrls: account.sourceUrl ? [String(account.sourceUrl)] : [],
          sourceCount: 1,
          note: account.note || null,
        });
        return map;
      }

      const mergedHints = Array.from(
        new Set(
          [existing.sourceHint, account.sourceHint]
            .filter(Boolean)
            .flatMap((value) => String(value).split('|').map((item) => item.trim()).filter(Boolean)),
        ),
      );
      const mergedUrls = Array.from(
        new Set([existing.sourceUrl, account.sourceUrl].filter(Boolean).map((value) => String(value))),
      );
      map.set(key, {
        ...existing,
        sourceHint: mergedHints.join('|') || existing.sourceHint || account.sourceHint || null,
        sourceUrl: mergedUrls[0] || existing.sourceUrl || account.sourceUrl || null,
        sourceHints: mergedHints,
        sourceUrls: mergedUrls,
        sourceCount: mergedHints.length > 0 ? mergedHints.length : Math.max(existing.sourceCount || 1, 1),
        note: [existing.note, account.note].filter(Boolean).join('\n'),
      } as T & {
        sourceHints: string[];
        sourceUrls: string[];
        sourceCount: number;
      });
      return map;
    }, new Map<string, T & { sourceHints?: string[]; sourceUrls?: string[]; sourceCount?: number }>()),
  ).map(([, account]) => account);

  const sorted = deduped.sort((left, right) => {
    const leftIndex = AUTO_IMPORT_PLATFORM_PRIORITY.indexOf(
      normalizeAutoImportPlatform(left.platform) as (typeof AUTO_IMPORT_PLATFORM_PRIORITY)[number],
    );
    const rightIndex = AUTO_IMPORT_PLATFORM_PRIORITY.indexOf(
      normalizeAutoImportPlatform(right.platform) as (typeof AUTO_IMPORT_PLATFORM_PRIORITY)[number],
    );
    const platformDiff = (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    if (platformDiff !== 0) return platformDiff;

    const sourceDiff =
      getAutoImportSourceWeight((right as { sourceHint?: string | null }).sourceHint) -
      getAutoImportSourceWeight((left as { sourceHint?: string | null }).sourceHint);
    if (sourceDiff !== 0) return sourceDiff;

    const evidenceDiff =
      Number((right as { sourceCount?: number }).sourceCount || 1) -
      Number((left as { sourceCount?: number }).sourceCount || 1);
    if (evidenceDiff !== 0) return evidenceDiff;

    return String(left.gameName || '').localeCompare(String(right.gameName || ''));
  });

  return sorted.slice(0, maxCount);
}

async function upsertAutoDiscoveredAccount(input: {
  playerId: string;
  teamId: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string | null;
  summonerId?: string | null;
  source: string;
  confidence: number;
  isPrimary: boolean;
  isActiveCandidate: boolean;
  notes: string;
  overwriteExisting?: boolean;
  equivalentPlayerIds?: string[];
}) {
  if (isBlockedAutoImportAccount(input)) {
    return { status: 'skipped' as const, accountId: null };
  }

  const identityKey = buildRankAccountIdentityKey({
    platform: input.platform,
    gameName: input.gameName,
    tagLine: input.tagLine,
  });

  const playerAccounts = await prisma.playerRankAccount.findMany({
    where: {
      playerId: input.playerId,
    },
    select: {
      id: true,
      platform: true,
      gameName: true,
      tagLine: true,
      summonerId: true,
      status: true,
      notes: true,
      confidence: true,
      isPrimary: true,
      isActiveCandidate: true,
    },
  });

  const existing = playerAccounts.find(
    (account) => buildRankAccountIdentityKey(account) === identityKey,
  );

  if (existing) {
    if (!input.overwriteExisting && existing.status !== 'ARCHIVED') {
      return { status: 'skipped' as const, accountId: existing.id };
    }

    const existingSupportsImmediatePromotion = supportsImmediateRankPromotion({
      tagLine: existing.tagLine,
    });
    const inputSupportsImmediatePromotion = supportsImmediateRankPromotion({
      tagLine: input.tagLine,
    });

    await updateRankAccount(existing.id, {
      platform: input.platform,
      regionGroup: input.regionGroup,
      gameName: input.gameName,
      tagLine: input.tagLine,
      summonerId: input.summonerId,
      source: input.source,
      status: 'ACTIVE',
      confidence: Math.max(toNumber(existing.confidence), input.confidence),
      notes: mergeDistinctNoteText(existing.notes, input.notes),
      isPrimary: (input.isPrimary && inputSupportsImmediatePromotion) || (existing.isPrimary && existingSupportsImmediatePromotion),
      isActiveCandidate:
        (input.isActiveCandidate && inputSupportsImmediatePromotion) ||
        (existing.isActiveCandidate && existingSupportsImmediatePromotion),
      lastVerifiedAt: new Date().toISOString(),
    });

    return {
      status: existing.status === 'ARCHIVED' ? ('revived' as const) : ('updated' as const),
      accountId: existing.id,
    };
  }

  const globalPlatformAccounts = await prisma.playerRankAccount.findMany({
    where: {
      platform: input.platform,
    },
    select: {
      id: true,
      playerId: true,
      teamId: true,
      platform: true,
      gameName: true,
      tagLine: true,
      summonerId: true,
      confidence: true,
      isPrimary: true,
      isActiveCandidate: true,
      notes: true,
      status: true,
    },
  });

  const globalExisting = globalPlatformAccounts.find((account) => buildRankAccountIdentityKey(account) === identityKey);

  if (globalExisting) {
    const equivalentPlayerIds = new Set((input.equivalentPlayerIds || []).filter(Boolean));
    const canReassignWithinGroup =
      globalExisting.playerId !== input.playerId &&
      equivalentPlayerIds.size > 0 &&
      equivalentPlayerIds.has(globalExisting.playerId);

    if (!canReassignWithinGroup) {
      return { status: 'skipped' as const, accountId: globalExisting.id };
    }

    if (input.isPrimary) {
      await prisma.playerRankAccount.updateMany({
        where: {
          playerId: input.playerId,
          id: {
            not: globalExisting.id,
          },
        },
        data: {
          isPrimary: false,
        },
      });
    }

    if (input.isActiveCandidate) {
      await prisma.playerRankAccount.updateMany({
        where: {
          playerId: input.playerId,
          id: {
            not: globalExisting.id,
          },
        },
        data: {
          isActiveCandidate: false,
        },
      });
    }

    const previousPlayerId = globalExisting.playerId;
    const globalExistingSupportsImmediatePromotion = supportsImmediateRankPromotion({
      tagLine: globalExisting.tagLine,
    });
    const inputSupportsImmediatePromotion = supportsImmediateRankPromotion({
      tagLine: input.tagLine,
    });
    await prisma.playerRankAccount.update({
      where: { id: globalExisting.id },
      data: {
        playerId: input.playerId,
        teamId: input.teamId,
        regionGroup: input.regionGroup,
        gameName: input.gameName,
        tagLine: input.tagLine,
        summonerId: input.summonerId || globalExisting.summonerId,
        source: input.source,
        status: 'ACTIVE',
        confidence: Math.max(toNumber(globalExisting.confidence), input.confidence),
        notes: mergeDistinctNoteText(globalExisting.notes, input.notes),
        isPrimary:
          (input.isPrimary && inputSupportsImmediatePromotion) ||
          (globalExisting.isPrimary && globalExistingSupportsImmediatePromotion),
        isActiveCandidate:
          (input.isActiveCandidate && inputSupportsImmediatePromotion) ||
          (globalExisting.isActiveCandidate && globalExistingSupportsImmediatePromotion),
        lastVerifiedAt: new Date(),
      },
    });

    if (previousPlayerId !== input.playerId) {
      await refreshRankProfilesByPlayerIds([previousPlayerId, input.playerId]);
    } else {
      await rebuildPlayerRankProfileCache(input.playerId);
    }

    return { status: 'reassigned' as const, accountId: globalExisting.id };
  }

  const created = await createRankAccount({
    playerId: input.playerId,
    platform: input.platform,
    regionGroup: input.regionGroup,
    gameName: input.gameName,
    tagLine: input.tagLine,
    summonerId: input.summonerId,
    source: input.source,
    status: 'ACTIVE',
    confidence: input.confidence,
    notes: input.notes,
    isPrimary: input.isPrimary,
    isActiveCandidate: input.isActiveCandidate,
  });

  return { status: 'created' as const, accountId: created.id };
}

async function getEquivalentPlayersForAutoImport(input: {
  playerId: string;
  playerName: string;
  role: string;
  teamName: string;
  teamShortName: string | null;
  region: string;
}) {
  const allCandidates = await prisma.player.findMany({
    where: {
      team: {
        region: input.region,
      },
      role: {
        in: getEquivalentAutoImportRoles(input.role),
      },
    },
    include: {
      team: true,
      rankAccounts: true,
    },
  });

  const targetKey = buildAutoImportLoosePlayerKey({
    region: input.region,
    playerName: input.playerName,
    role: input.role,
    teamShortName: input.teamShortName,
    teamName: input.teamName,
  });

  const siblings = allCandidates.filter((candidate) => getAutoImportPlayerKey(candidate) === targetKey);
  const scoped = siblings.length > 0 ? siblings : allCandidates.filter((candidate) => candidate.id === input.playerId);
  const canonical = pickCanonicalAutoImportPlayer(scoped, input.playerId);
  return {
    canonical: canonical || null,
    siblings: scoped,
    siblingIds: scoped.map((item) => item.id),
  };
}

export async function autoImportLeagueRankAccounts(options?: {
  regions?: string[];
  overwriteExisting?: boolean;
  limit?: number;
  forceRescan?: boolean;
  playerNames?: string[];
  effectiveScope?: CurrentSeasonRankEffectiveScope;
  deepSearch?: boolean;
}) {
  return autoImportLeagueRankAccountsCanonical(options);
}

  /*

  const targetRegions = (options?.regions?.length ? options.regions : [...AUTO_IMPORT_REGIONS]).map((item) =>
    String(item || '').trim().toUpperCase(),
  );

  const players = await prisma.player.findMany({
    where: {
      team: {
        region: {
          in: targetRegions,
        },
      },
      ...(options?.forceRescan
        ? {}
        : {
            OR: [
              { rankAccounts: { none: {} } },
              {
                rankAccounts: {
                  some: {
                    status: 'ARCHIVED',
                  },
                },
              },
            ],
          }),
    },
    include: {
      team: true,
      rankAccounts: {
        where: {
          status: {
            not: 'ARCHIVED',
          },
        },
      },
    },
    orderBy: [{ team: { region: 'asc' } }, { team: { shortName: 'asc' } }, { name: 'asc' }],
    take: options?.limit && options.limit > 0 ? options.limit : undefined,
  });

  const importablePlayers = players.filter((player) => !isPlaceholderPlayerName(player.name));

  const dedupedPlayers = Array.from(
    importablePlayers.reduce((map, player) => {
      const key = getAutoImportPlayerKey(player);
      const existing = map.get(key);
      if (!existing || scoreAutoImportPlayer(player, player.id) > scoreAutoImportPlayer(existing, player.id)) {
        map.set(key, player);
      }
      return map;
    }, new Map<string, (typeof players)[number]>()),
  ).map(([, player]) => player);

  const touchedPlayerIds = new Set<string>();

  const processPlayer = async (player: (typeof dedupedPlayers)[number]) => {
    try {
      const localPriorityAccounts = getLocalPriorityAutoImportAccounts({
        region: player.team.region,
        playerName: player.name,
      });
      const seeds = dedupeKnownSeedMatches(
        [
          ...findKnownProRankSeeds({
            region: player.team.region,
            teamShortName: player.team.shortName || player.team.name,
            playerName: player.name,
            role: player.role,
          }),
          findFallbackKnownSeed({
            region: player.team.region,
            teamShortName: player.team.shortName,
            teamName: player.team.name,
            playerName: player.name,
            role: player.role,
          }),
          findExactKnownSeedByName({
            region: player.team.region,
            playerName: player.name,
          }),
        ].filter((seed): seed is KnownProRankSeed => Boolean(seed)),
      );
      const seed = seeds[0] || null;
      const [dpm, opgg, tracking] = await Promise.all([
        discoverProRankAccountsFromDpm(player.name).catch(() => null),
        discoverProRankAccountsFromOpgg(player.name).catch(() => null),
        discoverProRankAccountsFromTrackingThePros(player.name).catch(() => null),
      ]);
      const seedAccounts = (seed?.accounts || []).map((account) => ({
        ...account,
        sourceHint: 'SEED' as const,
        note: account.note || `内置职业种子：${account.platformLabel} / ${account.gameName}#${account.tagLine}`,
      }));
      const localPriorityCandidateAccounts = [] as Array<(typeof seedAccounts)[number]>;
      const opggAccounts = (opgg?.success ? opgg.accounts : []).map((account) => ({
        ...account,
        sourceHint: 'OPGG' as const,
      }));
      const trackingAccounts = (tracking?.success ? tracking.accounts : []).map((account) => ({
        ...account,
        sourceHint: 'TRACKING' as const,
      }));
      const dpmAccounts = (dpm?.success ? dpm.accounts : []).map((account) => ({
        ...account,
        sourceHint: 'DPM' as const,
      }));
      const preliminaryCandidates = pickPreferredAutoImportAccounts([
        ...localPriorityCandidateAccounts,
        ...seedAccounts,
        ...trackingAccounts,
        ...opggAccounts,
        ...dpmAccounts,
      ]);
      const shouldFetchLeaguepedia =
        preliminaryCandidates.length < 3 ||
        !preliminaryCandidates.some((account) => normalizeAutoImportPlatform(account.platform) === 'KR');
      const leaguepedia = shouldFetchLeaguepedia
        ? await discoverLeaguepediaRankAccounts(player.name).catch(() => null)
        : null;
      const leaguepediaAccounts = (leaguepedia?.success ? leaguepedia.accounts : []).map((account) => ({
        ...account,
        sourceHint: 'LEAGUEPEDIA' as const,
      }));
      const mergedAccounts = [
        ...localPriorityCandidateAccounts,
        ...seedAccounts,
        ...trackingAccounts,
        ...opggAccounts,
        ...dpmAccounts,
        ...leaguepediaAccounts,
      ];
      const candidateAccounts = pickPreferredAutoImportAccounts(mergedAccounts);
      const usedSources = Array.from(new Set(candidateAccounts.map((account) => account.sourceHint).filter(Boolean)));
      const sourceLabel = usedSources.length > 1 ? 'MIXED' : usedSources[0] || 'MANUAL';
      const sourceUrl =
        candidateAccounts.find((account) => account.sourceUrl)?.sourceUrl ||
        seedAccounts[0]?.sourceUrl ||
        tracking?.sourceUrl ||
        opgg?.sourceUrl ||
        dpm?.sourceUrl ||
        leaguepedia?.sourceUrl ||
        null;

      const discovered =
        seed && seed.accounts.length > 0
          ? {
              source: 'DPM' as const,
              sourceUrl: seed.accounts[0]?.sourceUrl || null,
              accounts: seed.accounts.map((account) => ({
                ...account,
                note:
                  account.note ||
                  `内置职业种子：${account.platformLabel} / ${account.gameName}#${account.tagLine}`,
              })),
              error: null,
            }
          : dpm?.success && dpm.accounts.length > 0
            ? {
                source: 'DPM' as const,
                sourceUrl: dpm.sourceUrl,
                accounts: dpm.accounts,
                error: null,
              }
            : leaguepedia?.success && leaguepedia.accounts.length > 0
          ? {
              source: 'LEAGUEPEDIA' as const,
              sourceUrl: leaguepedia.sourceUrl,
              accounts: leaguepedia.accounts,
              error: null,
            }
            : null;

      const mergedAccounts = [...seedAccounts, ...dpmAccounts, ...leaguepediaAccounts];
      const candidateAccounts = pickPreferredAutoImportAccounts(mergedAccounts);
      const usedSources = Array.from(new Set(candidateAccounts.map((account) => account.sourceHint).filter(Boolean)));
      const sourceLabel = usedSources.length > 1 ? 'MIXED' : usedSources[0] || 'MANUAL';
      const sourceUrl =
        candidateAccounts.find((account) => account.sourceUrl)?.sourceUrl ||
        seedAccounts[0]?.sourceUrl ||
        dpm?.sourceUrl ||
        leaguepedia?.sourceUrl ||
        null;

      if (candidateAccounts.length === 0) {
        const errorSummary = Array.from(
          new Set(
            [...discoveredAccounts.errors, ...sourceUrlAccounts.errors]
              .map((item) => String(item || '').trim())
              .filter(Boolean),
          ),
        );
        return {
          playerId: player.id,
          playerName: player.name,
          teamName: player.team.shortName || player.team.name,
          region: player.team.region,
          status: 'not_found' as const,
          created: 0,
          updated: 0,
          skipped: 0,
          message:
            (discovered && discovered.accounts.length > 0
                ? '自动发现到了账号，但当前未命中可用于同步链路的受支持官方平台账号。'
              : '') ||
            leaguepedia?.error ||
            tracking?.error ||
            opgg?.error ||
            dpm?.error ||
            '未能从内置种子、TrackingThePros、OP.GG、Leaguepedia 或 DPM 自动发现该选手的 SoloQ 账号',
        };
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      const equivalentPlayers = await getEquivalentPlayersForAutoImport({
        playerId: player.id,
        playerName: player.name,
        role: player.role,
        teamName: player.team.name,
        teamShortName: player.team.shortName,
        region: player.team.region,
      });

      for (const sibling of equivalentPlayers) {
        const hasExistingPrimary = sibling.rankAccounts.some((account) => account.isPrimary);
        const hasExistingActive = sibling.rankAccounts.some((account) => account.isActiveCandidate);

        for (const [index, account] of candidateAccounts.entries()) {
          const importResult = await upsertAutoDiscoveredAccount({
            playerId: sibling.id,
            teamId: sibling.teamId,
            platform: account.platform,
            regionGroup: account.regionGroup,
            gameName: account.gameName,
            tagLine: account.tagLine,
            source: discovered.source === 'LEAGUEPEDIA' ? 'MIXED' : 'DPM',
            confidence: buildAutoImportConfidence(account.platformLabel, index),
            isPrimary: !hasExistingPrimary && index === 0,
            isActiveCandidate: !hasExistingActive && (account.platformLabel === 'KR' || index === 0),
            notes: `${discovered.source} 自动发现：${account.sourceUrl}`,
            overwriteExisting: options?.overwriteExisting,
          });

          if (importResult.status === 'created') created += 1;
          if (importResult.status === 'updated' || importResult.status === 'reassigned' || importResult.status === 'revived') updated += 1;
          if (importResult.status === 'skipped') skipped += 1;
        }

        touchedPlayerIds.add(sibling.id);
      }

      return {
        playerId: player.id,
        playerName: player.name,
        teamName: player.team.shortName || player.team.name,
        region: player.team.region,
        status: created > 0 ? ('created' as const) : updated > 0 ? ('updated' as const) : ('skipped' as const),
        created,
        updated,
        skipped,
        message: `自动发现 ${candidateAccounts.length} 个 KR 账号，新增 ${created} 个，更新 ${updated} 个，跳过 ${skipped} 个`,
      };
    } catch (error) {
      return {
        playerId: player.id,
        playerName: player.name,
        teamName: player.team.shortName || player.team.name,
        region: player.team.region,
        status: 'error' as const,
        created: 0,
        updated: 0,
        skipped: 0,
        message: error instanceof Error ? error.message : '自动发现时发生未知错误',
      };
    }
  };

  const results: Awaited<ReturnType<typeof processPlayer>>[] = [];
  const batchSize = Math.max(1, Math.min(4, Number(process.env.RANK_AUTO_IMPORT_BATCH_SIZE || 1) || 1));

  for (let index = 0; index < dedupedPlayers.length; index += batchSize) {
    const batch = dedupedPlayers.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((player) => processPlayer(player)));
    results.push(...batchResults);
  }

  return {
    success: true,
    provider: 'seed+tracking+scoregg+dpm+opgg+leaguepedia',
    regions: targetRegions,
    attemptedPlayers: limitedPlayers.length,
    created: results.reduce((total, item) => total + item.created, 0),
    updated: results.reduce((total, item) => total + item.updated, 0),
    skipped: results.reduce((total, item) => total + item.skipped, 0),
    notFound: results.filter((item) => item.status === 'not_found').length,
    failed: results.filter((item) => item.status === 'error').length,
    touchedPlayerIds: Array.from(touchedPlayerIds),
    results,
  };
}

*/
async function autoImportLeagueRankAccountsCanonical(options?: {
  regions?: string[];
  overwriteExisting?: boolean;
  limit?: number;
  forceRescan?: boolean;
  effectiveScope?: CurrentSeasonRankEffectiveScope;
  playerNames?: string[];
  deepSearch?: boolean;
}) {
  const targetRegions = (options?.regions?.length ? options.regions : [...AUTO_IMPORT_REGIONS]).map((item) =>
    String(item || '').trim().toUpperCase(),
  );
  const effectiveScope =
    options?.effectiveScope || (await getCurrentSeasonRankEffectiveScope({ regions: targetRegions }));

  const archivedPlayerIds = options?.forceRescan
    ? new Set<string>()
    : new Set(
        (
          await prisma.playerRankAccount.findMany({
            where: {
              status: 'ARCHIVED',
              player: {
                team: {
                  region: {
                    in: targetRegions,
                  },
                },
              },
            },
            select: {
              playerId: true,
            },
          })
        ).map((item) => item.playerId),
      );
  const targetPlayerNames = new Set(
    (options?.playerNames || []).map((item) => normalizeUnicodeText(String(item || ''))).filter(Boolean),
  );
  const scopedPreferredPlayerIds =
    targetPlayerNames.size === 0 && (effectiveScope.preferredPlayerIds || []).length > 0
      ? effectiveScope.preferredPlayerIds
      : [];

  const players = await prisma.player.findMany({
    where: {
      ...(scopedPreferredPlayerIds.length > 0
        ? {
            id: {
              in: scopedPreferredPlayerIds,
            },
          }
        : {
            team: {
              region: {
                in: targetRegions,
              },
            },
          }),
    },
    select: {
      id: true,
      name: true,
      role: true,
      teamId: true,
      updatedAt: true,
      team: {
        select: {
          id: true,
          name: true,
          shortName: true,
          region: true,
        },
      },
      rankAccounts: {
        where: {
          status: {
            not: 'ARCHIVED',
          },
        },
        select: {
          id: true,
          platform: true,
          regionGroup: true,
          gameName: true,
          tagLine: true,
          puuid: true,
          summonerId: true,
          source: true,
          notes: true,
          isPrimary: true,
          isActiveCandidate: true,
          confidence: true,
          status: true,
          updatedAt: true,
          lastVerifiedAt: true,
          lastSeenAt: true,
        },
      },
    },
    orderBy: [{ team: { region: 'asc' } }, { team: { shortName: 'asc' } }, { name: 'asc' }],
  });

  const rescanCandidates = options?.forceRescan
    ? players
    : players.filter((player) => player.rankAccounts.length === 0 || archivedPlayerIds.has(player.id));
  const scopedPlayers = filterPlayersByCurrentSeasonRankEffectiveScope(rescanCandidates, effectiveScope);
  const explicitlyRequestedPlayers =
    targetPlayerNames.size === 0
      ? []
      : rescanCandidates.filter(
          (player) =>
            !isPlaceholderPlayerName(player.name) && targetPlayerNames.has(normalizeUnicodeText(player.name)),
        );
  const importablePlayers = Array.from(
    new Map(
      [...scopedPlayers, ...explicitlyRequestedPlayers]
        .filter((player) => !isPlaceholderPlayerName(player.name))
        .filter((player) => targetPlayerNames.size === 0 || targetPlayerNames.has(normalizeUnicodeText(player.name)))
        .map((player) => [player.id, player]),
    ).values(),
  );

  const dedupedPlayers = Array.from(
    importablePlayers.reduce((map, player) => {
      const key = getAutoImportPlayerKey(player);
      const existing = map.get(key);
      if (!existing || scoreAutoImportPlayer(player, player.id) > scoreAutoImportPlayer(existing, player.id)) {
        map.set(key, player);
      }
      return map;
    }, new Map<string, (typeof players)[number]>()),
  ).map(([, player]) => player);
  const realAccountStatsByIdentity = importablePlayers.reduce((map, player) => {
    const key = getAutoImportPlayerKey(player);
    const existing = map.get(key) || { realAccountCount: 0, siblingCount: 0 };
    existing.realAccountCount += getCurrentRealRankAccountCount(player);
    existing.siblingCount += 1;
    map.set(key, existing);
    return map;
  }, new Map<string, { realAccountCount: number; siblingCount: number }>());
  const prioritizedPlayers = dedupedPlayers
    .slice()
    .sort((left, right) => {
      const leftStats = realAccountStatsByIdentity.get(getAutoImportPlayerKey(left)) || {
        realAccountCount: getCurrentRealRankAccountCount(left),
        siblingCount: 1,
      };
      const rightStats = realAccountStatsByIdentity.get(getAutoImportPlayerKey(right)) || {
        realAccountCount: getCurrentRealRankAccountCount(right),
        siblingCount: 1,
      };
      const bucketDiff =
        rankAutoImportPriorityBucket(leftStats.realAccountCount) - rankAutoImportPriorityBucket(rightStats.realAccountCount);
      if (bucketDiff !== 0) return bucketDiff;
      if (leftStats.realAccountCount !== rightStats.realAccountCount) {
        return leftStats.realAccountCount - rightStats.realAccountCount;
      }
      if (leftStats.siblingCount !== rightStats.siblingCount) {
        return rightStats.siblingCount - leftStats.siblingCount;
      }
      return scoreAutoImportPlayer(right, right.id) - scoreAutoImportPlayer(left, left.id);
    });
  const limitedPlayers =
    options?.limit && options.limit > 0 ? prioritizedPlayers.slice(0, Number(options.limit)) : prioritizedPlayers;

  const touchedPlayerIds = new Set<string>();

  const processPlayer = async (player: (typeof dedupedPlayers)[number]) => {
    try {
      const localPriorityAccounts = getLocalPriorityAutoImportAccounts({
        region: player.team.region,
        playerName: player.name,
      });
      const seeds = dedupeKnownSeedMatches(
        [
          ...findKnownProRankSeeds({
            region: player.team.region,
            teamShortName: player.team.shortName || player.team.name,
            playerName: player.name,
            role: player.role,
          }),
          findFallbackKnownSeed({
            region: player.team.region,
            teamShortName: player.team.shortName,
            teamName: player.team.name,
            playerName: player.name,
            role: player.role,
          }),
          findExactKnownSeedByName({
            region: player.team.region,
            playerName: player.name,
          }),
        ].filter((seed): seed is KnownProRankSeed => Boolean(seed)),
      );
      const seed = seeds[0] || null;
      const equivalentPlayers = await getEquivalentPlayersForAutoImport({
        playerId: player.id,
        playerName: player.name,
        role: player.role,
        teamName: player.team.name,
        teamShortName: player.team.shortName,
        region: player.team.region,
      });

      const canonicalPlayer = equivalentPlayers.canonical;
      if (!canonicalPlayer) {
        return {
          playerId: player.id,
          playerName: player.name,
          teamName: player.team.shortName || player.team.name,
          region: player.team.region,
          status: 'error' as const,
          created: 0,
          updated: 0,
          skipped: 0,
          message: '未找到可用于自动导入的规范选手记录',
        };
      }

      const siblingNameVariants = Array.from(
        new Set(
          equivalentPlayers.siblings
            .map((sibling) => String(sibling.name || '').trim())
            .filter(Boolean),
        ),
      );
      const searchPlan = buildAutoImportSearchCandidates({
        playerName: player.name,
        teamName: player.team.name,
        teamShortName: player.team.shortName,
        region: player.team.region,
        seedPlayerName: seed?.playerName,
        seedPlayerNames: seeds.map((item) => item.playerName),
        nameVariants: siblingNameVariants,
        deepSearch: options?.deepSearch,
      });
      const seedAccounts = seeds.flatMap((matchedSeed) =>
        (matchedSeed.accounts || []).map((account) => ({
          ...account,
          summonerId: null,
          sourceHint: 'SEED' as const,
          note: account.note || `内置职业种子：${account.platformLabel} / ${account.gameName}#${account.tagLine}`,
        })),
      );
      const localPriorityCandidateAccounts = localPriorityAccounts.map((account) => ({
        ...account,
        summonerId: null,
        sourceHint: 'SEED' as const,
        note: account.note || `本地优先自动导入：${account.platformLabel} / ${account.gameName}#${account.tagLine}`,
      }));
      const equivalentExistingAccounts = mapExistingEquivalentAccounts(equivalentPlayers.siblings);
      const directSourceSeedUrls = [
        ...seeds.flatMap((matchedSeed) => (matchedSeed.accounts || []).map((account) => account.sourceUrl)),
        ...localPriorityAccounts.map((account) => account.sourceUrl),
        ...equivalentExistingAccounts.map((account) => account.sourceUrl),
      ];
      const [discoveredAccounts, sourceUrlAccounts] = await Promise.all([
        discoverAutoImportAccountsByQueries(searchPlan),
        discoverAutoImportAccountsBySourceUrls(directSourceSeedUrls),
      ]);

      const mergedAccounts = [
        ...seedAccounts,
        ...localPriorityCandidateAccounts,
        ...equivalentExistingAccounts,
        ...sourceUrlAccounts.trackingAccounts,
        ...sourceUrlAccounts.dpmAccounts,
        ...discoveredAccounts.scoreggAccounts,
        ...discoveredAccounts.trackingAccounts,
        ...discoveredAccounts.opggAccounts,
        ...discoveredAccounts.dpmAccounts,
        ...discoveredAccounts.leaguepediaAccounts,
      ];
      const candidateAccounts = pickPreferredAutoImportAccounts(mergedAccounts);
      const sourceBreakdown = buildAutoImportSourceBreakdown({
        searchPlan,
        candidateAccounts,
        discoveredAccounts,
        sourceUrlAccounts,
      });
      const usedSources = Array.from(
        new Set(
          candidateAccounts
            .flatMap((account) =>
              String(account.sourceHint || 'MANUAL')
                .split('|')
                .map((item) => item.trim())
                .filter(Boolean),
            ),
        ),
      );
      const sourceLabel = usedSources.length > 1 ? 'MIXED' : usedSources[0] || 'MANUAL';
      const sourceUrl =
        candidateAccounts.find((account) => account.sourceUrl)?.sourceUrl ||
        discoveredAccounts.sourceUrls[0] ||
        seed?.accounts[0]?.sourceUrl ||
        null;

      if (candidateAccounts.length === 0) {
        const errorSummary = Array.from(
          new Set(
            [...discoveredAccounts.errors, ...sourceUrlAccounts.errors]
              .map((item) => String(item || '').trim())
              .filter(Boolean),
          ),
        );
        return {
          playerId: player.id,
          playerName: player.name,
          teamName: player.team.shortName || player.team.name,
          region: player.team.region,
          status: 'not_found' as const,
          created: 0,
          updated: 0,
          skipped: 0,
          sourceBreakdown,
          message:
            (mergedAccounts.length > 0
              ? '自动发现到了账号，但未找到可用于当前同步链路的有效官方平台账号。'
              : '') ||
            (errorSummary.length > 0 ? `公开源未命中：${errorSummary.join('；')}` : '') ||
            '未能从内置种子、TrackingThePros、ScoreGG、OP.GG、Leaguepedia 或 DPM 自动发现该选手的 SoloQ 账号',
        };
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      const hasExistingPrimary = canonicalPlayer.rankAccounts.some((account) => account.isPrimary);
      const hasExistingActive = canonicalPlayer.rankAccounts.some((account) => account.isActiveCandidate);

      for (const [index, account] of candidateAccounts.entries()) {
        const supportsImmediatePromotion = supportsImmediateRankPromotion({
          tagLine: account.tagLine,
        });
        const importResult = await upsertAutoDiscoveredAccount({
          playerId: canonicalPlayer.id,
          teamId: canonicalPlayer.teamId,
          platform: account.platform,
          regionGroup: account.regionGroup,
          gameName: account.gameName,
          tagLine: account.tagLine,
          summonerId: account.summonerId,
          source: sourceLabel,
          confidence: buildAutoImportConfidence(
            account.platformLabel,
            index,
            account.sourceHint,
            String(account.sourceHint || '')
              .split('|')
              .map((item) => item.trim())
              .filter(Boolean).length || 1,
          ),
          isPrimary: supportsImmediatePromotion && !hasExistingPrimary && index === 0,
          isActiveCandidate:
            supportsImmediatePromotion && !hasExistingActive && (account.platformLabel === 'KR' || index === 0),
          notes: `${sourceLabel} 自动发现：${account.sourceUrl || sourceUrl || '无来源链接'}\n保留主号/小号候选，用于持续同步和后续自动提级。`,
          overwriteExisting: options?.overwriteExisting,
          equivalentPlayerIds: equivalentPlayers.siblingIds,
        });

        if (importResult.status === 'created') created += 1;
        if (importResult.status === 'updated' || importResult.status === 'reassigned' || importResult.status === 'revived') updated += 1;
        if (importResult.status === 'skipped') skipped += 1;
      }

      equivalentPlayers.siblingIds.forEach((id) => touchedPlayerIds.add(id));

        return {
          playerId: player.id,
          playerName: player.name,
          teamName: player.team.shortName || player.team.name,
          region: player.team.region,
          status: created > 0 ? ('created' as const) : updated > 0 ? ('updated' as const) : ('skipped' as const),
          created,
          updated,
          skipped,
          sourceBreakdown,
          message: `自动发现 ${candidateAccounts.length} 个候选账号（页面检索 ${searchPlan.pageCandidates.length} 个，广义检索 ${searchPlan.broadCandidates.length} 个，来源：${sourceLabel}${searchPlan.deepSearch ? '，专项深挖已启用' : ''}），新增 ${created} 个，更新 ${updated} 个，跳过 ${skipped} 个。`,
        };
      } catch (error) {
        return {
          playerId: player.id,
          playerName: player.name,
        teamName: player.team.shortName || player.team.name,
        region: player.team.region,
          status: 'error' as const,
          created: 0,
          updated: 0,
          skipped: 0,
          sourceBreakdown: [],
          message: error instanceof Error ? error.message : '自动发现时发生未知错误',
        };
      }
  };

  const results: Awaited<ReturnType<typeof processPlayer>>[] = [];
  const batchSize = options?.deepSearch ? 1 : 12;

  for (let index = 0; index < limitedPlayers.length; index += batchSize) {
    const batch = limitedPlayers.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((player) => processPlayer(player)));
    results.push(...batchResults);
  }

  return {
    success: true,
    provider: 'seed+tracking+scoregg+dpm+opgg+leaguepedia',
    regions: targetRegions,
    attemptedPlayers: limitedPlayers.length,
    created: results.reduce((total, item) => total + item.created, 0),
    updated: results.reduce((total, item) => total + item.updated, 0),
    skipped: results.reduce((total, item) => total + item.skipped, 0),
    notFound: results.filter((item) => item.status === 'not_found').length,
    failed: results.filter((item) => item.status === 'error').length,
    touchedPlayerIds: Array.from(touchedPlayerIds),
    results,
  };
}

export function getRankSyncProviderStatus() {
  const statuses = [
    {
      key: 'riot',
      label: 'Riot API',
      ready: Boolean(process.env.RIOT_API_KEY),
      detail: process.env.RIOT_API_KEY ? '已检测到 RIOT_API_KEY，可执行实时同步' : '缺少 RIOT_API_KEY，无法执行实时同步',
    },
    {
      key: 'dpm',
      label: '账号自动发现',
      ready: true,
      detail: '优先使用内置种子、TrackingThePros、ScoreGG 旧版职业账号库、DPM 与 OP.GG，Leaguepedia 仅作为严格兜底来源，自动发现 LPL/LCK 选手 SoloQ 账号',
    },
    {
      key: 'cron',
      label: 'Cron Secret',
      ready: Boolean(process.env.CRON_SECRET),
      detail: process.env.CRON_SECRET ? '已配置 CRON_SECRET，可执行定时同步任务' : '缺少 CRON_SECRET，无法安全执行定时同步任务',
    },
  ];

  return {
    statuses,
    readyCount: statuses.filter((item) => item.ready).length,
    totalCount: statuses.length,
    overallReady: statuses.every((item) => item.ready),
  };
}

export async function rebuildPlayerRankProfileCache(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      team: true,
      rankAccounts: {
        where: {
          status: {
            not: 'ARCHIVED',
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { isActiveCandidate: 'desc' }, { lastMatchAt: 'desc' }],
      },
      rankRecentSummaries: {
        orderBy: [{ updatedAt: 'desc' }],
      },
      rankSnapshots: {
        orderBy: [{ snapshotAt: 'desc' }],
      },
    },
  });

  if (!player) {
    return { success: false, error: 'Player not found' } as const;
  }

  const accounts = player.rankAccounts;
  const activeAccountIds = new Set(accounts.map((item) => item.id));
  const summaries = player.rankRecentSummaries.filter((item) => activeAccountIds.has(item.accountId));
  const snapshots = player.rankSnapshots.filter((item) => activeAccountIds.has(item.accountId));
  const primaryAccount = accounts.find((item) => item.isPrimary) || accounts[0] || null;
  const activeAccount = accounts.find((item) => item.isActiveCandidate) || null;
  const displayAccount = pickDisplayAccount(accounts, summaries, snapshots);
  const displaySummary = summaries.find((item) => item.accountId === displayAccount?.id) || summaries[0] || null;
  const displaySnapshot = snapshots.find((item) => item.accountId === displayAccount?.id) || snapshots[0] || null;

  const confidenceScore = Math.max(
    toNumber(displayAccount?.confidence),
    accounts.length > 0 ? accounts.reduce((max, item) => Math.max(max, toNumber(item.confidence)), 0) : 0,
  );
  const activityScore = toNumber(displaySummary?.activityScore);
  const games7d = toNumber(displaySummary?.games7d);
  const games14d = toNumber(displaySummary?.games14d);
  const verifiedCount = accounts.filter((item) => toNumber(item.confidence) >= 0.85 && item.status !== 'SUSPECT').length;
  const suspectCount = accounts.filter((item) => item.status === 'SUSPECT').length;
  const sourceLabels = Array.from(new Set(accounts.map((item) => item.source).filter(Boolean)));

  const cache = await prisma.playerRankProfileCache.upsert({
    where: { playerId },
    create: {
      playerId,
      teamId: player.teamId,
      primaryAccountId: primaryAccount?.id,
      activeAccountId: activeAccount?.id,
      displayAccountId: displayAccount?.id,
      displayTier: displaySnapshot?.tier || 'UNRANKED',
      displayRank: displaySnapshot?.rank || '',
      displayLeaguePoints: toNumber(displaySnapshot?.leaguePoints),
      displayWins: toNumber(displaySnapshot?.wins),
      displayLosses: toNumber(displaySnapshot?.losses),
      displayWinRate: toNumber(displaySnapshot?.winRate),
      games7d,
      games14d,
      winRate14d: toNumber(displaySummary?.winRate14d),
      accountCount: accounts.length,
      verifiedAccountCount: verifiedCount,
      suspectAccountCount: suspectCount,
      activityLabel: resolveActivityLabel(activityScore, displaySummary?.activityLabel),
      activityScore,
      formScore: toNumber(displaySummary?.formScore),
      trendScore: toNumber(displaySummary?.trendScore),
      confidenceScore,
      topChampionsJson: displaySummary?.topChampionsJson || stringifyJson([]),
      lastGameAt: toDate(displaySummary?.lastGameAt || displayAccount?.lastMatchAt),
      lastSyncedAt: new Date(),
      confidenceLabel: resolveConfidenceLabel(confidenceScore),
      notes: sourceLabels.join(' / ') || null,
    },
    update: {
      teamId: player.teamId,
      primaryAccountId: primaryAccount?.id,
      activeAccountId: activeAccount?.id,
      displayAccountId: displayAccount?.id,
      displayTier: displaySnapshot?.tier || 'UNRANKED',
      displayRank: displaySnapshot?.rank || '',
      displayLeaguePoints: toNumber(displaySnapshot?.leaguePoints),
      displayWins: toNumber(displaySnapshot?.wins),
      displayLosses: toNumber(displaySnapshot?.losses),
      displayWinRate: toNumber(displaySnapshot?.winRate),
      games7d,
      games14d,
      winRate14d: toNumber(displaySummary?.winRate14d),
      accountCount: accounts.length,
      verifiedAccountCount: verifiedCount,
      suspectAccountCount: suspectCount,
      activityLabel: resolveActivityLabel(activityScore, displaySummary?.activityLabel),
      activityScore,
      formScore: toNumber(displaySummary?.formScore),
      trendScore: toNumber(displaySummary?.trendScore),
      confidenceScore,
      topChampionsJson: displaySummary?.topChampionsJson || stringifyJson([]),
      lastGameAt: toDate(displaySummary?.lastGameAt || displayAccount?.lastMatchAt),
      lastSyncedAt: new Date(),
      confidenceLabel: resolveConfidenceLabel(confidenceScore),
      notes: sourceLabels.join(' / ') || null,
    },
  });

  return {
    success: true,
    playerId,
    cacheId: cache.id,
    accountCount: accounts.length,
    displayAccountId: displayAccount?.id || null,
    sourceSummary: sourceLabels.join(' / '),
  } as const;
}

export async function refreshAllRankProfiles(limit?: number) {
  const players = await prisma.player.findMany({
    where: {
      rankAccounts: {
        some: {
          status: {
            not: 'ARCHIVED',
          },
        },
      },
    },
    select: { id: true },
    take: limit && limit > 0 ? limit : undefined,
    orderBy: [{ updatedAt: 'desc' }],
  });

  const results = [];
  for (const player of players) {
    results.push(await rebuildPlayerRankProfileCache(player.id));
  }

  return {
    success: true,
    total: results.length,
    refreshed: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  };
}

export async function refreshRankProfilesByPlayerIds(playerIds: string[]) {
  const uniqueIds = Array.from(new Set(playerIds.filter(Boolean)));
  const results = [];

  for (const playerId of uniqueIds) {
    results.push(await rebuildPlayerRankProfileCache(playerId));
  }

  return {
    success: true,
    total: results.length,
    refreshed: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  };
}

export async function getRankSyncAdminStatus() {
  const providers = getRankSyncProviderStatus();
  const autoSyncEnabled = String(process.env.RANK_SYNC_ENABLED || 'true').trim().toLowerCase() !== 'false';
  const intervalMinutes = Math.max(30, Number(process.env.RANK_SYNC_INTERVAL_MINUTES || 360) || 360);
  const retryCount = Math.max(0, Number(process.env.RANK_SYNC_MAX_RETRIES || 2) || 2);
  const retryDelaySeconds = Math.max(5, Math.round((Number(process.env.RANK_SYNC_RETRY_DELAY_MS || 20000) || 20000) / 1000));

  const [profileAggregate, summaryAggregate, snapshotAggregate, pendingCount, history, failureState] = await Promise.all([
    prisma.playerRankProfileCache.aggregate({
      _max: {
        lastSyncedAt: true,
      },
    }),
    prisma.playerRankRecentSummary.aggregate({
      _max: {
        updatedAt: true,
      },
    }),
    prisma.playerRankSnapshot.aggregate({
      _max: {
        snapshotAt: true,
      },
    }),
    prisma.playerRankProfileCache.count({
      where: {
        suspectAccountCount: {
          gt: 0,
        },
      },
    }),
    getRecentRankSyncHistory(6),
    readRankSyncFailureState(),
  ]);

  const candidatesCount = await prisma.playerRankAccount.count({
    where: {
      status: {
        not: 'ARCHIVED',
      },
      OR: [
        { status: 'SUSPECT' },
        {
          confidence: { lt: 0.85 },
          OR: [{ isPrimary: true }, { isActiveCandidate: true }],
        },
      ],
    },
  });

  const timestamps = [
    toDate(profileAggregate._max.lastSyncedAt),
    toDate(summaryAggregate._max.updatedAt),
    toDate(snapshotAggregate._max.snapshotAt),
  ].filter((value): value is Date => Boolean(value));
  const lastSyncedAt =
    timestamps.length > 0
      ? timestamps.slice().sort((left, right) => right.getTime() - left.getTime())[0]
      : null;
  let normalizedHistory = history;
  if (normalizedHistory.length === 0 && lastSyncedAt) {
    const bootstrapEntry: RankSyncHistoryEntry = {
      id: `bootstrap-${lastSyncedAt.getTime()}`,
      trigger: 'cron',
      status: 'SUCCESS',
      startedAt: lastSyncedAt.toISOString(),
      finishedAt: lastSyncedAt.toISOString(),
      durationMs: 0,
      refreshedPlayers: 0,
      failedPlayers: 0,
      riotAttempted: 0,
      riotSynced: 0,
      autoImportedCreated: 0,
      autoImportedUpdated: 0,
      note: '已根据现有缓存恢复最近一次同步记录。',
      error: null,
    };
    normalizedHistory = [bootstrapEntry];
    await writeRankSyncHistory(normalizedHistory);
  }

  const nextScheduledAt =
    autoSyncEnabled && lastSyncedAt
      ? new Date(lastSyncedAt.getTime() + intervalMinutes * 60 * 1000)
      : null;
  const latestHistory = normalizedHistory[0] || null;
  const latestSuccessfulHistory = normalizedHistory.find((item) => item.status === 'SUCCESS') || null;
  const latestHistoryFinishedAt = toDate(latestHistory?.finishedAt || latestHistory?.startedAt || null);
  const shouldPromoteObservedSuccess =
    Boolean(lastSyncedAt) &&
    (!latestHistoryFinishedAt || lastSyncedAt!.getTime() - latestHistoryFinishedAt.getTime() > 60 * 1000);
  const latestObservedRun =
    shouldPromoteObservedSuccess && lastSyncedAt
      ? {
          id: `observed-${lastSyncedAt.getTime()}`,
          trigger: latestSuccessfulHistory?.trigger || 'manual',
          status: 'SUCCESS' as const,
          startedAt: lastSyncedAt.toISOString(),
          finishedAt: lastSyncedAt.toISOString(),
          durationMs: 0,
          refreshedPlayers: latestSuccessfulHistory?.refreshedPlayers || 0,
          failedPlayers: latestSuccessfulHistory?.failedPlayers || 0,
          riotAttempted: latestSuccessfulHistory?.riotAttempted || 0,
          riotSynced: latestSuccessfulHistory?.riotSynced || 0,
          autoImportedCreated: latestSuccessfulHistory?.autoImportedCreated || 0,
          autoImportedUpdated: latestSuccessfulHistory?.autoImportedUpdated || 0,
          note: '已根据最新缓存时间推断最近一次同步已成功完成。',
          error: null,
        }
      : null;
  const displayedLatestRun = latestObservedRun || latestHistory;
  const historySuccessCount = normalizedHistory.filter((item) => item.status === 'SUCCESS').length;
  const historyFailureCount = normalizedHistory.filter((item) => item.status === 'FAILED').length;
  const failureEntries = Object.values(failureState);
  const recentFailureCount = failureEntries.length;
  const recentFailureCategories = Array.from(new Set(failureEntries.map((item) => item.failureCategory))).slice(0, 4);

  return {
    ...providers,
    sync: {
      autoSyncEnabled,
      intervalMinutes,
      retryCount,
      retryDelaySeconds,
      lastSyncedAt,
      nextScheduledAt,
      pendingAccountCount: pendingCount,
      candidateCount: candidatesCount,
      latestRun: displayedLatestRun,
      latestObservedRun,
      latestFailureRun: latestHistory?.status === 'FAILED' ? latestHistory : null,
      history: normalizedHistory,
      historySuccessCount,
      historyFailureCount,
      recentFailureCount,
      recentFailureCategories,
      summary:
        providers.statuses.every((item) => item.ready) && autoSyncEnabled
          ? '正式服务已启用自动 Rank 同步。'
          : '当前自动同步未完全就绪，请检查 Provider 状态。',
    },
  };
}

export async function applyRankSyncFailurePolicy(riotResult: Awaited<ReturnType<typeof syncRankAccountsViaRiot>> | null) {
  if (!riotResult) {
    return {
      updated: 0,
      archived: 0,
      downgraded: 0,
      cleared: 0,
      touchedPlayerIds: [] as string[],
    };
  }

  const state = await readRankSyncFailureState();
  const touchedPlayerIds = new Set<string>();
  let archived = 0;
  let downgraded = 0;
  let cleared = 0;
  let updated = 0;

  for (const result of riotResult.results) {
    if (result.status === 'synced') {
      if (state[result.accountId]) {
        delete state[result.accountId];
        cleared += 1;
      }
      continue;
    }

    const category = result.failureCategory;
    if (!category) continue;

    const previous = state[result.accountId];
    const consecutiveFailures =
      previous && previous.failureCategory === category ? previous.consecutiveFailures + 1 : 1;

    state[result.accountId] = {
      accountId: result.accountId,
      playerId: result.playerId,
      accountName: result.accountName,
      failureCategory: category,
      consecutiveFailures,
      totalFailures: (previous?.totalFailures || 0) + 1,
      lastMessage: result.message,
      lastHttpStatus: result.httpStatus ?? null,
      lastFailedAt: new Date().toISOString(),
    };
    updated += 1;

    if (!['not_found', 'invalid_mapping'].includes(category)) continue;

    const account = await prisma.playerRankAccount.findUnique({
      where: { id: result.accountId },
      select: {
        id: true,
        playerId: true,
        source: true,
      status: true,
      confidence: true,
      isPrimary: true,
      isActiveCandidate: true,
      notes: true,
      gameName: true,
      tagLine: true,
      summonerId: true,
      player: {
        select: {
          id: true,
            name: true,
            role: true,
            team: {
              select: {
                name: true,
                shortName: true,
                region: true,
              },
            },
          },
        },
      },
    });

    if (!account || account.status === 'ARCHIVED') continue;

    const isManual = account.source === 'MANUAL';
    const isSummonerOnlyImportedAccount = Boolean(account.summonerId) && !String(account.tagLine || '').trim();
    const accountNotes = mergeDistinctNoteText(account.notes, `同步异常：${category}（连续 ${consecutiveFailures} 次）`);
    let preserveLastKnownRealAccount = false;

    if (!isManual && !isPlaceholderCoverageAccount(account) && account.player?.team?.region) {
      const equivalentPlayers = await getEquivalentPlayersForAutoImport({
        playerId: account.player.id,
        playerName: account.player.name,
        role: account.player.role,
        teamName: account.player.team.name,
        teamShortName: account.player.team.shortName,
        region: account.player.team.region,
      });
      const relatedPlayerIds = Array.from(
        new Set([account.player.id, ...equivalentPlayers.siblings.map((player) => player.id)]),
      );
      const relatedActiveAccounts = await prisma.playerRankAccount.findMany({
        where: {
          playerId: {
            in: relatedPlayerIds,
          },
          id: {
            not: account.id,
          },
          status: {
            not: 'ARCHIVED',
          },
        },
        select: {
          id: true,
          gameName: true,
          tagLine: true,
          puuid: true,
          summonerId: true,
          lastMatchAt: true,
          notes: true,
        },
      });
      const alternativeRealAccounts = relatedActiveAccounts.filter(
        (candidate) =>
          !isPlaceholderCoverageAccount(candidate) &&
          Boolean(candidate.puuid || candidate.summonerId || candidate.lastMatchAt),
      );
      preserveLastKnownRealAccount = alternativeRealAccounts.length === 0;
    }

    const shouldArchiveImmediately =
      !isManual && !preserveLastKnownRealAccount && category === 'invalid_mapping' && isSummonerOnlyImportedAccount;

    if (
      !isManual &&
      !preserveLastKnownRealAccount &&
      (shouldArchiveImmediately || consecutiveFailures >= RANK_SYNC_FAILURE_ARCHIVE_THRESHOLD)
    ) {
      await prisma.playerRankAccount.update({
        where: { id: result.accountId },
        data: {
          status: 'ARCHIVED',
          isPrimary: false,
          isActiveCandidate: false,
          notes: mergeDistinctNoteText(
            accountNotes,
            shouldArchiveImmediately
              ? '系统自动归档：仅依赖 summonerId 的导入账号首次同步即失效，已等待更可靠来源重新发现。'
              : '系统自动归档：连续多次同步失败，等待更可靠来源重新发现。',
          ),
        },
      });
      archived += 1;
      touchedPlayerIds.add(account.playerId);
      continue;
    }

    if (consecutiveFailures >= RANK_SYNC_FAILURE_DOWNGRADE_THRESHOLD) {
      const downgradedConfidence = Math.max(0.35, Number(account.confidence || 0) - 0.1);
      await prisma.playerRankAccount.update({
        where: { id: result.accountId },
        data: {
          status: isManual ? 'SUSPECT' : account.status === 'ACTIVE' ? 'SUSPECT' : account.status,
          confidence: downgradedConfidence,
          notes: mergeDistinctNoteText(
            accountNotes,
            preserveLastKnownRealAccount
              ? '系统自动保留：该账号仍是当前同身份最后一个已知真号，已降权但不直接归档。'
              : '系统自动降权：连续同步失败，已降为自动补齐等待后续恢复。',
          ),
        },
      });
      downgraded += 1;
      touchedPlayerIds.add(account.playerId);
    }
  }

  await writeRankSyncFailureState(state);

  return {
    updated,
    archived,
    downgraded,
    cleared,
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

async function getScheduledRankSyncPlayerIds(limit?: number, effectiveScope?: CurrentSeasonRankEffectiveScope) {
  const scopedEffectiveScope = effectiveScope || (await getCurrentSeasonRankEffectiveScope());
  const targetRegions = scopedEffectiveScope.regions.length ? scopedEffectiveScope.regions : [...AUTO_IMPORT_REGIONS];
  const scopedPreferredPlayerIds = scopedEffectiveScope.preferredPlayerIds || [];
  const players = await prisma.player.findMany({
    where: {
      ...(scopedPreferredPlayerIds.length > 0
        ? {
            id: {
              in: scopedPreferredPlayerIds,
            },
          }
        : {
            team: {
              region: {
                in: targetRegions,
              },
            },
          }),
      rankAccounts: {
        some: {
          status: {
            in: ['ACTIVE', 'SUSPECT'],
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      role: true,
      team: {
        select: {
          region: true,
        },
      },
      rankProfileCache: {
        select: {
          lastSyncedAt: true,
        },
      },
      rankAccounts: {
        where: {
          status: {
            in: ['ACTIVE', 'SUSPECT'],
          },
        },
        select: {
          id: true,
          isPrimary: true,
          isActiveCandidate: true,
          lastSeenAt: true,
          updatedAt: true,
        },
      },
    },
  });
  const scopedPlayers = filterPlayersByCurrentSeasonRankEffectiveScope(players, scopedEffectiveScope);

  const now = Date.now();
  const rows = scopedPlayers
    .map((player) => {
      const accounts = player.rankAccounts || [];
      const hasPriorityAccount = accounts.some((account) => account.isPrimary || account.isActiveCandidate);
      const staleHours = hasPriorityAccount ? 8 : 24;
      const staleBefore = now - staleHours * 60 * 60 * 1000;
      const lastSyncedAt = toDate(player.rankProfileCache?.lastSyncedAt)?.getTime() || 0;
      const lastSeenAt = Math.max(
        ...accounts.map((account) => toDate(account.lastSeenAt || account.updatedAt)?.getTime() || 0),
        0,
      );
      const freshness = Math.max(lastSyncedAt, lastSeenAt);
      const isStale = freshness === 0 || freshness < staleBefore;

      return {
        playerId: player.id,
        freshness,
        hasPriorityAccount,
        isStale,
      };
    })
    .filter((row) => row.isStale)
    .sort((left, right) => {
      if (left.hasPriorityAccount !== right.hasPriorityAccount) {
        return left.hasPriorityAccount ? -1 : 1;
      }
      return left.freshness - right.freshness;
    });

  const scoped = Number.isFinite(limit) && Number(limit) > 0 ? rows.slice(0, Number(limit)) : rows;
  return scoped.map((row) => row.playerId);
}

async function autoResolveManagedRankCandidates() {
  const candidates = await prisma.playerRankAccount.findMany({
    where: {
      status: {
        not: 'ARCHIVED',
      },
      OR: [{ status: 'SUSPECT' }, { confidence: { lt: 0.85 } }],
    },
    include: {
      recentSummaries: {
        orderBy: [{ updatedAt: 'desc' }],
        take: 1,
      },
      snapshots: {
        orderBy: [{ snapshotAt: 'desc' }],
        take: 1,
      },
    },
  });

  const touchedPlayerIds = new Set<string>();
  let promoted = 0;

  for (const account of candidates) {
    const score = toNumber(account.confidence);
    const summary = account.recentSummaries[0];
    const snapshot = account.snapshots[0];
    const source = String(account.source || '').toUpperCase();
    const hasResolvableIdentity =
      !isPlaceholderRankAccountName(account.gameName) &&
      (Boolean(account.tagLine) ||
        Boolean(account.summonerId)) &&
      (Boolean(account.summonerId) ||
        !isManualPuuid(account.puuid) ||
        (source === 'SEED' && Boolean(account.tagLine)));
    const hasCompetitiveSignal =
      toNumber(summary?.games7d) > 0 ||
      toNumber(summary?.games14d) > 0 ||
      (String(snapshot?.tier || '').toUpperCase() !== 'UNRANKED' && Boolean(snapshot?.tier));
    const isSystemManagedSource = ['SEED', 'MIXED', 'OPGG', 'DPM', 'LEAGUEPEDIA', 'SCOREGG'].includes(source);
    const isPrimaryLike = account.isPrimary || account.isActiveCandidate;
    const shouldPromote =
      isSystemManagedSource &&
      hasResolvableIdentity &&
      (
        hasCompetitiveSignal ||
        Boolean(account.summonerId) ||
        (isPrimaryLike && score >= 0.8)
      ) &&
      score >= 0.74;

    if (!shouldPromote) continue;

    await prisma.playerRankAccount.update({
      where: { id: account.id },
      data: {
        status: 'ACTIVE',
        confidence: Math.max(score, 0.9),
        lastVerifiedAt: new Date(),
        notes: mergeDistinctNoteText(account.notes, '系统自动提升为已确认：已具备真实账号标识与可用同步数据。'),
      },
    });
    touchedPlayerIds.add(account.playerId);
    promoted += 1;
  }

  return {
    promoted,
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

export async function syncSinglePlayerRankProfile(playerId: string) {
  const providers = getRankSyncProviderStatus();
  const riotReady = providers.statuses.some((item) => item.key === 'riot' && item.ready);

  const riot = riotReady ? await syncRankAccountsViaRiot({ playerId }) : null;
  const refresh = await refreshRankProfilesByPlayerIds([playerId]);

  return {
    success: refresh.failed === 0,
    playerId,
    providers,
    riot,
    refreshedPlayers: refresh.refreshed,
    failedPlayers: refresh.failed,
    note: riot
      ? '单个选手已完成 Riot 实时同步，并重建了 Rank 缓存。'
      : '已重建选手缓存；当前未执行 Riot 实时同步。',
  };
}

export async function getRankAdminAccounts(search = '') {
  const keyword = search.trim();
  const accounts = await prisma.playerRankAccount.findMany({
    include: {
      player: {
        include: {
          team: true,
        },
      },
    },
    where: keyword
      ? {
          OR: [
            { gameName: { contains: keyword } },
            { tagLine: { contains: keyword } },
            { player: { name: { contains: keyword } } },
            { player: { team: { name: { contains: keyword } } } },
          ],
        }
      : undefined,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });

  const players = await prisma.player.findMany({
    include: {
      team: true,
    },
    orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    take: 300,
  });

  const summary = {
    totalAccounts: accounts.length,
    primaryAccounts: accounts.filter((item) => item.isPrimary).length,
    activeAccounts: accounts.filter((item) => item.isActiveCandidate).length,
    suspectAccounts: accounts.filter((item) => item.status === 'SUSPECT').length,
  };

  return {
    summary,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      teamName: player.team.name,
      teamShortName: player.team.shortName,
      role: player.role,
      teamId: player.teamId,
    })),
    accounts: accounts.map((account) => ({
      id: account.id,
      playerId: account.playerId,
      playerName: account.player.name,
      teamName: account.player.team.name,
      teamShortName: account.player.team.shortName,
      role: account.player.role,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform: account.platform,
      regionGroup: account.regionGroup,
      puuid: account.puuid,
      summonerId: account.summonerId,
      isPrimary: account.isPrimary,
      isActiveCandidate: account.isActiveCandidate,
      status: account.status,
      source: account.source,
      confidence: account.confidence,
      confidenceLabel: resolveConfidenceLabel(toNumber(account.confidence)),
      verificationLabel: resolveVerificationLabel(toNumber(account.confidence), account.status),
      lastVerifiedAt: account.lastVerifiedAt,
      lastMatchAt: account.lastMatchAt,
      notes: account.notes,
      updatedAt: account.updatedAt,
    })),
  };
}

export async function getRankAdminCandidates() {
  const candidates = await prisma.playerRankAccount.findMany({
    where: {
      status: {
        not: 'ARCHIVED',
      },
      OR: [
        { status: 'SUSPECT' },
        {
          confidence: { lt: 0.85 },
          OR: [{ isPrimary: true }, { isActiveCandidate: true }],
        },
      ],
    },
    include: {
      player: {
        include: {
          team: true,
        },
      },
      recentSummaries: {
        orderBy: [{ updatedAt: 'desc' }],
        take: 1,
      },
      snapshots: {
        orderBy: [{ snapshotAt: 'desc' }],
        take: 1,
      },
    },
    orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
    take: 60,
  });

  return candidates.map((item) => ({
    id: item.id,
    playerId: item.playerId,
    playerName: item.player.name,
    teamName: item.player.team.name,
    accountName: item.tagLine ? `${item.gameName}#${item.tagLine}` : item.gameName,
    platform: item.platform,
    status: item.status,
    source: item.source,
    confidence: item.confidence,
    confidenceLabel: resolveConfidenceLabel(toNumber(item.confidence)),
    verificationLabel: resolveVerificationLabel(toNumber(item.confidence), item.status),
    games7d: toNumber(item.recentSummaries[0]?.games7d),
    lastGameAt: toDate(item.recentSummaries[0]?.lastGameAt || item.lastMatchAt),
    currentTier: item.snapshots[0]?.tier || 'UNRANKED',
    currentRank: item.snapshots[0]?.rank || '',
    leaguePoints: toNumber(item.snapshots[0]?.leaguePoints),
  }));
}

export async function createRankAccount(input: {
  playerId: string;
  platform: string;
  regionGroup?: string;
  gameName: string;
  tagLine?: string | null;
  puuid?: string;
  summonerId?: string | null;
  isPrimary?: boolean;
  isActiveCandidate?: boolean;
  status?: string;
  source?: string;
  confidence?: number;
  notes?: string;
}) {
  const player = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, teamId: true },
  });

  if (!player) {
    throw new Error('Player not found');
  }

  const supportsImmediatePromotion = supportsImmediateRankPromotion({
    tagLine: input.tagLine,
    puuid: input.puuid,
  });
  const normalizedIsPrimary = supportsImmediatePromotion && Boolean(input.isPrimary);
  const normalizedIsActiveCandidate = supportsImmediatePromotion && Boolean(input.isActiveCandidate);

  if (normalizedIsPrimary) {
    await prisma.playerRankAccount.updateMany({
      where: { playerId: player.id },
      data: { isPrimary: false },
    });
  }

  if (normalizedIsActiveCandidate) {
    await prisma.playerRankAccount.updateMany({
      where: { playerId: player.id },
      data: { isActiveCandidate: false },
    });
  }

  const desiredPuuid =
    input.puuid && input.puuid.trim()
      ? input.puuid.trim()
      : input.summonerId && input.summonerId.trim()
        ? `manual:summoner:${normalizeText(input.platform || 'kr')}:${normalizeText(input.summonerId)}`
      : buildManualPuuid({
          playerId: player.id,
          platform: input.platform,
          gameName: input.gameName,
          tagLine: input.tagLine || null,
        });

  const findExistingByPuuid = () =>
    prisma.playerRankAccount.findFirst({
      where: { puuid: desiredPuuid },
      select: {
        id: true,
        playerId: true,
        confidence: true,
        notes: true,
        tagLine: true,
        puuid: true,
        isPrimary: true,
        isActiveCandidate: true,
        lastVerifiedAt: true,
      },
    });

  const mergeIntoExistingAccount = async (existingByPuuid: {
    id: string;
    playerId: string;
    confidence: number | null;
    notes: string | null;
    tagLine: string | null;
    puuid?: string | null;
    isPrimary: boolean;
    isActiveCandidate: boolean;
    lastVerifiedAt: Date | null;
  }) => {
    const previousPlayerId = existingByPuuid.playerId;
    const mergedNotes = mergeDistinctNoteText(existingByPuuid.notes, input.notes || null);
    const existingSupportsImmediatePromotion = supportsImmediateRankPromotion({
      tagLine: existingByPuuid.tagLine,
      puuid: existingByPuuid.puuid,
    });

    const updated = await prisma.playerRankAccount.update({
      where: { id: existingByPuuid.id },
      data: {
        playerId: player.id,
        teamId: player.teamId,
        platform: input.platform,
        regionGroup: input.regionGroup || 'ASIA',
        gameName: input.gameName,
        tagLine: input.tagLine || null,
        puuid: desiredPuuid,
        summonerId: input.summonerId || null,
        isPrimary: normalizedIsPrimary || (existingByPuuid.isPrimary && existingSupportsImmediatePromotion),
        isActiveCandidate:
          normalizedIsActiveCandidate || (existingByPuuid.isActiveCandidate && existingSupportsImmediatePromotion),
        status: input.status || 'SUSPECT',
        source: input.source || 'MANUAL',
        confidence: Math.max(input.confidence ?? 0.6, toNumber(existingByPuuid.confidence)),
        notes: mergedNotes || null,
        lastVerifiedAt:
          (input.confidence ?? 0.6) >= 0.85 && (input.status || 'SUSPECT') !== 'SUSPECT'
            ? new Date()
            : existingByPuuid.lastVerifiedAt,
      },
    });

    if (previousPlayerId !== player.id) {
      await refreshRankProfilesByPlayerIds([previousPlayerId, player.id]);
    } else {
      await rebuildPlayerRankProfileCache(player.id);
    }

    return updated;
  };

  const existingByPuuid = await findExistingByPuuid();

  if (existingByPuuid) {
    return mergeIntoExistingAccount(existingByPuuid);
  }

  try {
    const created = await prisma.playerRankAccount.create({
      data: {
        playerId: player.id,
        teamId: player.teamId,
        platform: input.platform,
        regionGroup: input.regionGroup || 'ASIA',
        gameName: input.gameName,
        tagLine: input.tagLine || null,
        puuid: desiredPuuid,
        summonerId: input.summonerId || null,
        isPrimary: normalizedIsPrimary,
        isActiveCandidate: normalizedIsActiveCandidate,
        status: input.status || 'SUSPECT',
        source: input.source || 'MANUAL',
        confidence: input.confidence ?? 0.6,
        notes: input.notes || null,
        lastVerifiedAt: null,
        lastMatchAt: null,
      },
    });

    await rebuildPlayerRankProfileCache(player.id);
    return created;
  } catch (error) {
    if (!isPuuidUniqueConstraintError(error)) {
      throw error;
    }

    const conflicted = await findExistingByPuuid();
    if (!conflicted) {
      throw error;
    }

    return mergeIntoExistingAccount(conflicted);
  }
}

export async function updateRankAccount(
  accountId: string,
  input: {
    platform?: string;
    regionGroup?: string;
    gameName?: string;
    tagLine?: string | null;
    puuid?: string;
    summonerId?: string | null;
    isPrimary?: boolean;
    isActiveCandidate?: boolean;
    status?: string;
    source?: string;
    confidence?: number;
    notes?: string | null;
    lastVerifiedAt?: string | null;
  },
) {
  const existing = await prisma.playerRankAccount.findUnique({
    where: { id: accountId },
    select: { id: true, playerId: true, tagLine: true, puuid: true },
  });

  if (!existing) {
    throw new Error('Account not found');
  }

  const effectiveTagLine = input.tagLine !== undefined ? input.tagLine : existing.tagLine;
  const effectivePuuid = input.puuid !== undefined ? input.puuid : existing.puuid;
  const supportsImmediatePromotion = supportsImmediateRankPromotion({
    tagLine: effectiveTagLine,
    puuid: effectivePuuid,
  });
  const normalizedIsPrimary =
    input.isPrimary !== undefined ? supportsImmediatePromotion && Boolean(input.isPrimary) : undefined;
  const normalizedIsActiveCandidate =
    input.isActiveCandidate !== undefined ? supportsImmediatePromotion && Boolean(input.isActiveCandidate) : undefined;

  if (normalizedIsPrimary) {
    await prisma.playerRankAccount.updateMany({
      where: { playerId: existing.playerId, id: { not: accountId } },
      data: { isPrimary: false },
    });
  }

  if (normalizedIsActiveCandidate) {
    await prisma.playerRankAccount.updateMany({
      where: { playerId: existing.playerId, id: { not: accountId } },
      data: { isActiveCandidate: false },
    });
  }

  const updated = await prisma.playerRankAccount.update({
    where: { id: accountId },
    data: {
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      ...(input.regionGroup !== undefined ? { regionGroup: input.regionGroup } : {}),
      ...(input.gameName !== undefined ? { gameName: input.gameName } : {}),
      ...(input.tagLine !== undefined ? { tagLine: input.tagLine } : {}),
      ...(input.puuid !== undefined && input.puuid.trim() ? { puuid: input.puuid.trim() } : {}),
      ...(input.summonerId !== undefined ? { summonerId: input.summonerId } : {}),
      ...(normalizedIsPrimary !== undefined ? { isPrimary: normalizedIsPrimary } : {}),
      ...(normalizedIsActiveCandidate !== undefined ? { isActiveCandidate: normalizedIsActiveCandidate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.lastVerifiedAt !== undefined
        ? { lastVerifiedAt: input.lastVerifiedAt ? new Date(input.lastVerifiedAt) : null }
        : {}),
    },
  });

  await rebuildPlayerRankProfileCache(existing.playerId);
  return updated;
}

export async function importRankAccountsFromText(input: {
  rawText: string;
  overwriteExisting?: boolean;
  defaults?: {
    platform?: string;
    regionGroup?: string;
    source?: string;
    status?: string;
    confidence?: number;
  };
}) {
  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error('Import text is empty');
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Import text is empty');
  }

  const delimiter = detectDelimiter(lines[0]);
  const firstRow = parseDelimitedLine(lines[0], delimiter);
  const firstHeaderMap = buildHeaderMap(firstRow);
  const hasHeader = Object.keys(firstHeaderMap).length >= 3;
  const header = hasHeader
    ? firstRow
    : ['playerName', 'teamName', 'platform', 'gameName', 'tagLine', 'source', 'status', 'confidence', 'notes'];
  const headerMap = hasHeader ? firstHeaderMap : buildHeaderMap(header);
  const rows = hasHeader ? lines.slice(1) : lines;

  const players = await prisma.player.findMany({
    include: { team: true },
  });

  const results: Array<{ line: number; status: 'created' | 'updated' | 'skipped' | 'error'; message: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const lineNumber = hasHeader ? index + 2 : index + 1;

    try {
      const values = parseDelimitedLine(rows[index], delimiter);
      const read = (field: string) => {
        const fieldIndex = headerMap[field];
        return fieldIndex === undefined ? '' : values[fieldIndex] || '';
      };

      const accountField = read('gameName');
      const accountCandidate = accountField || read('accountName');
      const split = splitAccountName(accountCandidate);
      const gameName = (accountField || split.gameName).trim();
      const tagLine = (read('tagLine') || split.tagLine || '').trim();
      const playerId = read('playerId');
      const playerName = read('playerName');
      const teamName = read('teamName');
      const platform = (read('platform') || input.defaults?.platform || 'KR').trim().toUpperCase();
      const regionGroup = (read('regionGroup') || input.defaults?.regionGroup || 'ASIA').trim().toUpperCase();
      const source = (read('source') || input.defaults?.source || 'MANUAL').trim().toUpperCase();
      const status = (read('status') || input.defaults?.status || 'SUSPECT').trim().toUpperCase();
      const confidenceRaw = read('confidence');
      const confidence =
        confidenceRaw !== ''
          ? Number(confidenceRaw)
          : input.defaults?.confidence !== undefined
            ? input.defaults.confidence
            : 0.6;
      const notes = read('notes') || '';
      const puuid = read('puuid');
      const summonerId = read('summonerId');
      const isPrimary = parseBooleanLike(read('isPrimary'));
      const isActiveCandidate = parseBooleanLike(read('isActiveCandidate'));

      if (!gameName) {
        results.push({ line: lineNumber, status: 'error', message: 'Missing gameName/account' });
        continue;
      }

      const player =
        (playerId ? players.find((item) => item.id === playerId) : undefined) ||
        players.find((item) => {
          const sameName = item.name.toLowerCase() === playerName.toLowerCase();
          if (!sameName) return false;
          if (!teamName) return true;
          return (
            item.team.name.toLowerCase() === teamName.toLowerCase() ||
            (item.team.shortName || '').toLowerCase() === teamName.toLowerCase()
          );
        });

      if (!player) {
        results.push({ line: lineNumber, status: 'error', message: `Player not found: ${playerName || playerId}` });
        continue;
      }

      const existing =
        (puuid
          ? await prisma.playerRankAccount.findFirst({
              where: { puuid },
            })
          : null) ||
        (await prisma.playerRankAccount.findFirst({
          where: {
            playerId: player.id,
            platform,
            gameName,
            tagLine: tagLine || null,
          },
        }));

      if (existing && !input.overwriteExisting) {
        results.push({
          line: lineNumber,
          status: 'skipped',
          message: `Existing account kept: ${gameName}${tagLine ? `#${tagLine}` : ''}`,
        });
        continue;
      }

      if (existing) {
        await updateRankAccount(existing.id, {
          platform,
          regionGroup,
          gameName,
          tagLine: tagLine || null,
          puuid: puuid || existing.puuid,
          summonerId: summonerId || null,
          status,
          source,
          confidence,
          notes: notes || null,
          isPrimary,
          isActiveCandidate,
          lastVerifiedAt: confidence >= 0.85 && status !== 'SUSPECT' ? new Date().toISOString() : null,
        });
        results.push({
          line: lineNumber,
          status: 'updated',
          message: `Updated account: ${gameName}${tagLine ? `#${tagLine}` : ''}`,
        });
        continue;
      }

      await createRankAccount({
        playerId: player.id,
        platform,
        regionGroup,
        gameName,
        tagLine: tagLine || undefined,
        puuid: puuid || undefined,
        summonerId: summonerId || undefined,
        source,
        status,
        confidence,
        notes: notes || undefined,
        isPrimary,
        isActiveCandidate,
      });

      results.push({
        line: lineNumber,
        status: 'created',
        message: `Created account: ${gameName}${tagLine ? `#${tagLine}` : ''}`,
      });
    } catch (error) {
      results.push({
        line: lineNumber,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown import error',
      });
    }
  }

  return {
    success: true,
    total: results.length,
    created: results.filter((item) => item.status === 'created').length,
    updated: results.filter((item) => item.status === 'updated').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
    failed: results.filter((item) => item.status === 'error').length,
    results,
  };
}

export async function buildRankImportTemplateCsv() {
  const players = await prisma.player.findMany({
    include: {
      team: true,
    },
    orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    take: 300,
  });

  const header = [
    'playerId',
    'playerName',
    'teamName',
    'role',
    'platform',
    'gameName',
    'tagLine',
    'puuid',
    'summonerId',
    'source',
    'status',
    'confidence',
    'isPrimary',
    'isActiveCandidate',
    'notes',
  ];

  const escapeCsv = (value: unknown) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const rows = players.map((player) => [
    player.id,
    player.name,
    player.team.name,
    player.role,
    'KR',
    '',
    '',
    '',
    '',
    'MANUAL',
    'SUSPECT',
    '0.60',
    'false',
    'false',
    '',
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

export async function ensurePlaceholderRankCoverage(options?: {
  regions?: string[];
  effectiveScope?: CurrentSeasonRankEffectiveScope;
}) {
  const targetRegions = (options?.regions?.length ? options.regions : ['LPL', 'LCK']).map((item) =>
    String(item || '').trim().toUpperCase(),
  );
  const effectiveScope =
    options?.effectiveScope || (await getCurrentSeasonRankEffectiveScope({ regions: targetRegions }));
  const scopedPreferredPlayerIds = effectiveScope.preferredPlayerIds || [];

  const players = await prisma.player.findMany({
    where: {
      ...(scopedPreferredPlayerIds.length > 0
        ? {
            id: {
              in: scopedPreferredPlayerIds,
            },
          }
        : {
            team: {
              region: {
                in: targetRegions,
              },
            },
          }),
    },
    include: {
      team: true,
      rankAccounts: {
        where: {
          status: {
            not: 'ARCHIVED',
          },
        },
      },
    },
    orderBy: [{ team: { region: 'asc' } }, { name: 'asc' }],
  });
  const scopedPlayers = filterPlayersByCurrentSeasonRankEffectiveScope(players, effectiveScope);

  const touchedPlayerIds = new Set<string>();
  const groupedPlayers = new Map<string, typeof players>();

  for (const player of scopedPlayers) {
    const identityKey = buildAutoImportLoosePlayerKey({
      region: player.team?.region || '',
      playerName: player.name,
      role: player.role,
      teamShortName: player.team?.shortName,
      teamName: player.team?.name,
    });
    const existingGroup = groupedPlayers.get(identityKey) || [];
    existingGroup.push(player);
    groupedPlayers.set(identityKey, existingGroup);
  }

  let created = 0;

  for (const groupPlayers of groupedPlayers.values()) {
    const candidatePlayers = groupPlayers
      .slice()
      .sort((left, right) => {
        const diff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        if (diff !== 0) return diff;
        return String(left.id).localeCompare(String(right.id));
      });

    if (candidatePlayers.some((player) => player.rankAccounts.length > 0)) continue;

    const player = candidatePlayers[0];
    if (!player) continue;
    if (isPlaceholderPlayerName(player.name)) continue;

    const equivalentPlayers = await getEquivalentPlayersForAutoImport({
      playerId: player.id,
      playerName: player.name,
      role: player.role,
      teamName: player.team?.name || '',
      teamShortName: player.team?.shortName || null,
      region: player.team?.region || '',
    });
    const hasSiblingRealAccount = equivalentPlayers.siblings.some((sibling) =>
      (sibling.rankAccounts || []).some((account) => !isPlaceholderCoverageAccount(account)),
    );
    if (hasSiblingRealAccount) continue;

    const placeholderPlatform = String(player.team?.region || '').trim().toUpperCase() === 'LCK' ? 'KR' : 'KR';
    const placeholderTag = normalizeText(player.name || 'pending') || 'pending';

    const placeholderResult = await createRankAccount({
      playerId: player.id,
      platform: placeholderPlatform,
      regionGroup: 'ASIA',
      gameName: '待确认映射',
      puuid: buildManualPuuid({
        playerId: player.id,
        platform: placeholderPlatform,
        gameName: '待确认映射',
        tagLine: placeholderTag,
      }),
      isPrimary: false,
      isActiveCandidate: false,
      status: 'SUSPECT',
      source: 'MANUAL',
      confidence: 0.15,
      notes: `自动占位：公开来源暂未发现可验证账号，待后续替换（${player.name} / ${player.team?.shortName || player.team?.name || '--'}）`,
    });

    if (placeholderResult?.id) {
      created += 1;
    }
    touchedPlayerIds.add(player.id);
  }

  return {
    created,
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

function extractAutoImportSourceUrl(value: string | null | undefined) {
  const text = String(value || '');
  const match = text.match(/https?:\/\/[^\s|]+/i);
  return match ? match[0] : null;
}

function normalizeAutoImportLookup(value: string) {
  return normalizeUnicodeText(
    String(value || '')
      .replace(/_/g, ' ')
      .replace(/\(.*?\)/g, ' ')
      .replace(/%20/g, ' '),
  );
}

function isMalformedAutoImportedAccount(account: {
  gameName: string;
  tagLine: string | null;
  summonerId?: string | null;
}) {
  const gameName = String(account.gameName || '').trim();
  const tagLine = String(account.tagLine || '').trim();
  const summonerId = String(account.summonerId || '').trim();
  if (!gameName || (!tagLine && !summonerId)) return true;
  if (gameName.length > 24 || tagLine.length > 12) return true;
  if (/[<>{}\[\]]/g.test(gameName)) return true;
  if (gameName.includes("'''") || gameName.includes('<br')) return true;
  if ((gameName.match(/#/g) || []).length > 0) return true;
  if (/(^|\s)(KR|CN|EUW|EUNE|NA|BR|LAN|LAS|JP|OCE|TR|RU|PH|SG|TH|TW|VN)\s*:/i.test(gameName)) return true;
  return false;
}

function isSourceUrlMismatched(account: {
  notes: string | null;
  player: { name: string };
}) {
  const sourceUrl = extractAutoImportSourceUrl(account.notes);
  if (!sourceUrl) return false;
  const normalizedPlayerName = normalizeAutoImportLookup(account.player.name);
  if (!normalizedPlayerName) return false;

  try {
    const url = new URL(sourceUrl);
    if (/op\.gg$/i.test(url.hostname) || /summoners/i.test(url.pathname)) {
      return false;
    }

    const pathname = url.pathname;
    const slug = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
    const normalizedSourceName = normalizeAutoImportLookup(slug);
    if (!normalizedSourceName) return false;
    return !(
      normalizedSourceName.includes(normalizedPlayerName) ||
      normalizedPlayerName.includes(normalizedSourceName)
    );
  } catch {
    return false;
  }
}

function hasRecoverableAutoImportIdentity(account: {
  puuid?: string | null;
  summonerId: string | null;
  lastMatchAt: Date | null;
}) {
  return Boolean(
    (account.puuid && !String(account.puuid).startsWith('manual:')) ||
      account.lastMatchAt ||
      account.summonerId,
  );
}

function shouldArchiveLowQualityAutoImportedAccount(account: {
  player: { team: { region: string }; name: string };
  platform: string;
  source: string;
  gameName: string;
  tagLine: string | null;
  puuid?: string | null;
  summonerId: string | null;
  lastMatchAt: Date | null;
  notes: string | null;
}) {
  if (!['LPL', 'LCK'].includes(String(account.player.team.region || '').toUpperCase())) return false;
  if (!['MIXED', 'DPM', 'LEAGUEPEDIA', 'OPGG'].includes(String(account.source || '').toUpperCase())) return false;

  const hasRecoverableIdentity = hasRecoverableAutoImportIdentity(account);
  if (String(account.platform || '').toUpperCase() !== 'KR') {
    return !hasRecoverableIdentity;
  }
  if (hasRecoverableIdentity) return false;

  if (isMalformedAutoImportedAccount(account)) return true;
  if (isSourceUrlMismatched(account)) return true;

  return false;
}

async function reactivateRecoverableArchivedAccounts() {
  const recoverable = await prisma.playerRankAccount.findMany({
    where: {
      status: 'ARCHIVED',
      source: {
        in: ['DPM', 'MIXED'],
      },
      player: {
        team: {
          region: {
            in: ['LPL', 'LCK'],
          },
        },
      },
      notes: {
        contains: '自动归档：低质量自动发现账号',
      },
    },
    include: {
      player: {
        select: {
          name: true,
        },
      },
    },
  });

  const touchedPlayerIds = new Set<string>();
  const revivedIds: string[] = [];

  for (const account of recoverable) {
    const hasRecoverableIdentity = hasRecoverableAutoImportIdentity(account);
    if (!hasRecoverableIdentity) continue;
    if (isMalformedAutoImportedAccount(account)) continue;
    if (isSourceUrlMismatched(account)) continue;

    await prisma.playerRankAccount.update({
      where: { id: account.id },
      data: {
        status: 'ACTIVE',
        isActiveCandidate: true,
        confidence: Math.max(toNumber(account.confidence), 0.9),
        notes: mergeDistinctNoteText(account.notes, '自动恢复：已检测到有效同步痕迹，重新纳入自动同步链路。'),
        lastVerifiedAt: new Date(),
      },
    });
    touchedPlayerIds.add(account.playerId);
    revivedIds.push(account.id);
  }

  if (touchedPlayerIds.size > 0) {
    await refreshRankProfilesByPlayerIds(Array.from(touchedPlayerIds));
  }

  return {
    revived: revivedIds.length,
    revivedIds,
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

export async function archiveLowQualityAutoImportedAccounts() {
  const accounts = await prisma.playerRankAccount.findMany({
    where: {
      status: {
        not: 'ARCHIVED',
      },
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

  const suspicious = accounts.filter((account) => shouldArchiveLowQualityAutoImportedAccount(account));
  const touchedPlayerIds = new Set<string>();

  for (const account of suspicious) {
    await prisma.playerRankAccount.update({
      where: { id: account.id },
      data: {
        status: 'ARCHIVED',
        isPrimary: false,
        isActiveCandidate: false,
        notes: mergeDistinctNoteText(account.notes, '自动归档：低质量自动发现账号，等待更可靠来源重新绑定。'),
      },
    });
    touchedPlayerIds.add(account.playerId);
  }

  if (touchedPlayerIds.size > 0) {
    await refreshRankProfilesByPlayerIds(Array.from(touchedPlayerIds));
  }

  return {
    archived: suspicious.length,
    archivedIds: suspicious.map((item) => item.id),
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

export async function archiveDuplicateRankAccounts() {
  const accounts = await prisma.playerRankAccount.findMany({
    where: {
      status: {
        not: 'ARCHIVED',
      },
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

  const grouped = new Map<string, typeof accounts>();
  for (const account of accounts) {
    if (isPlaceholderCoverageAccount(account)) continue;
    const key = buildRankAccountIdentityKey(account);
    const list = grouped.get(key) || [];
    list.push(account);
    grouped.set(key, list);
  }

  const duplicateGroups = Array.from(grouped.values()).filter((group) => group.length > 1);
  const archivedIds: string[] = [];
  const touchedPlayerIds = new Set<string>();

  const scoreAccount = (account: (typeof accounts)[number]) => {
    const player = account.player;
    return (
      (account.isPrimary ? 1000 : 0) +
      (account.isActiveCandidate ? 500 : 0) +
      toNumber(account.confidence) * 100 +
      (String(account.source || '').toUpperCase() === 'SEED' ? 120 : 0) +
      (String(account.source || '').toUpperCase() === 'MIXED' ? 80 : 0) +
      (String(account.status || '').toUpperCase() === 'ACTIVE' ? 40 : 0) +
      (String(account.puuid || '').startsWith('manual:') ? -250 : 80) +
      new Date(account.updatedAt).getTime() / 1000000000
    );
  };

  for (const group of duplicateGroups) {
    const [keep, ...archive] = group.slice().sort((left, right) => scoreAccount(right) - scoreAccount(left));
    for (const account of archive) {
      await prisma.playerRankAccount.update({
        where: { id: account.id },
        data: {
          status: 'ARCHIVED',
          isPrimary: false,
          isActiveCandidate: false,
          notes: mergeDistinctNoteText(
            account.notes,
            `自动归档：重复账号，保留 ${keep.gameName}#${keep.tagLine || ''}（${keep.player.name} / ${keep.player.team.shortName || keep.player.team.name}）`,
          ),
        },
      });
      archivedIds.push(account.id);
      touchedPlayerIds.add(account.playerId);
      touchedPlayerIds.add(keep.playerId);
    }
  }

  if (touchedPlayerIds.size > 0) {
    await refreshRankProfilesByPlayerIds(Array.from(touchedPlayerIds));
  }

  return {
    groups: duplicateGroups.length,
    archived: archivedIds.length,
    archivedIds,
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

function isPlaceholderCoverageAccount(account: {
  gameName?: string | null;
  tagLine?: string | null;
  summonerId?: string | null;
  puuid?: string | null;
  notes?: string | null;
}) {
  const gameName = normalizeRankTextIfNeeded(String(account.gameName || '').trim());
  const tagLine = String(account.tagLine || '').trim();
  const summonerId = String(account.summonerId || '').trim();
  const puuid = String(account.puuid || '').trim();
  const notes = normalizeRankTextIfNeeded(String(account.notes || '').trim());

  return (
    (!tagLine && !summonerId) ||
    gameName === '待确认映射' ||
    gameName === '自动补齐映射' ||
    (puuid.startsWith('manual:') && /(待确认|占位|placeholder|pending|manual)/i.test(`${gameName}\n${notes}`))
  );
}

export async function archivePlaceholderAccountsWithRealEquivalent(options?: {
  regions?: string[];
  effectiveScope?: CurrentSeasonRankEffectiveScope;
}) {
  const targetRegions = (options?.regions?.length ? options.regions : ['LPL', 'LCK']).map((item) =>
    String(item || '').trim().toUpperCase(),
  );
  const effectiveScope =
    options?.effectiveScope || (await getCurrentSeasonRankEffectiveScope({ regions: targetRegions }));
  const scopedPreferredPlayerIds = effectiveScope.preferredPlayerIds || [];
  const accounts = await prisma.playerRankAccount.findMany({
    where: {
      status: {
        not: 'ARCHIVED',
      },
      player: {
        ...(scopedPreferredPlayerIds.length > 0
          ? {
              id: {
                in: scopedPreferredPlayerIds,
              },
            }
          : {
              team: {
                region: {
                  in: targetRegions,
                },
              },
            }),
      },
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

  const grouped = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const key = buildAutoImportLoosePlayerKey({
      region: account.player.team.region,
      playerName: account.player.name,
      role: account.player.role,
    });
    const list = grouped.get(key) || [];
    list.push(account);
    grouped.set(key, list);
  }

  const archivedIds: string[] = [];
  const touchedPlayerIds = new Set<string>();

  for (const group of grouped.values()) {
    const realAccounts = group.filter((account) => !isPlaceholderCoverageAccount(account));
    const placeholderAccounts = group.filter((account) => isPlaceholderCoverageAccount(account));
    if (realAccounts.length === 0 || placeholderAccounts.length === 0) continue;

    const keep = realAccounts
      .slice()
      .sort((left, right) => {
        const score =
          (Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary))) * 1000 ||
          (Number(Boolean(right.isActiveCandidate)) - Number(Boolean(left.isActiveCandidate))) * 500 ||
          (toNumber(right.confidence) - toNumber(left.confidence)) * 100 ||
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        return score;
      })[0];

    for (const account of placeholderAccounts) {
      await prisma.playerRankAccount.update({
        where: { id: account.id },
        data: {
          status: 'ARCHIVED',
          isPrimary: false,
          isActiveCandidate: false,
          notes: mergeDistinctNoteText(
            account.notes,
            `自动归档：同身份已存在可验证真号，保留 ${keep.gameName}#${keep.tagLine || ''}（${keep.player.name} / ${keep.player.team.shortName || keep.player.team.name}）`,
          ),
        },
      });
      archivedIds.push(account.id);
      touchedPlayerIds.add(account.playerId);
      touchedPlayerIds.add(keep.playerId);
    }
  }

  if (touchedPlayerIds.size > 0) {
    await refreshRankProfilesByPlayerIds(Array.from(touchedPlayerIds));
  }

  return {
    archived: archivedIds.length,
    archivedIds,
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

export async function consolidateEquivalentPlayerRankAccounts(options?: {
  regions?: string[];
  effectiveScope?: CurrentSeasonRankEffectiveScope;
}) {
  const targetRegions = (options?.regions?.length ? options.regions : ['LPL', 'LCK']).map((item) =>
    String(item || '').trim().toUpperCase(),
  );
  const effectiveScope =
    options?.effectiveScope || (await getCurrentSeasonRankEffectiveScope({ regions: targetRegions }));
  const preferredPlayerIds = new Set(effectiveScope.preferredPlayerIds || []);

  const players = await prisma.player.findMany({
    where: {
      team: {
        region: {
          in: targetRegions,
        },
      },
    },
    include: {
      team: true,
      rankAccounts: {
        where: {
          status: {
            not: 'ARCHIVED',
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
      },
    },
  });

  const grouped = new Map<string, typeof players>();
  for (const player of players) {
    const key = buildAutoImportLoosePlayerKey({
      region: player.team?.region || '',
      playerName: player.name,
      role: player.role,
      teamShortName: player.team?.shortName,
      teamName: player.team?.name,
    });
    const list = grouped.get(key) || [];
    list.push(player);
    grouped.set(key, list);
  }

  const touchedPlayerIds = new Set<string>();
  let groups = 0;
  let moved = 0;
  let archived = 0;

  for (const siblings of grouped.values()) {
    if (siblings.length <= 1) continue;
    const preferredSibling = siblings.find((player) => preferredPlayerIds.has(player.id));
    const canonical = pickCanonicalAutoImportPlayer(siblings, preferredSibling?.id);
    if (!canonical) continue;

    const canonicalKeys = new Set(
      canonical.rankAccounts
        .filter((account) => !isPlaceholderCoverageAccount(account))
        .map((account) => buildRankAccountIdentityKey(account)),
    );

    let groupTouched = false;

    for (const sibling of siblings) {
      if (sibling.id === canonical.id) continue;

      for (const account of sibling.rankAccounts) {
        if (isPlaceholderCoverageAccount(account)) continue;
        const identityKey = buildRankAccountIdentityKey(account);

        if (canonicalKeys.has(identityKey)) {
          await prisma.playerRankAccount.update({
            where: { id: account.id },
            data: {
              status: 'ARCHIVED',
              isPrimary: false,
              isActiveCandidate: false,
              notes: mergeDistinctNoteText(
                account.notes,
                `自动归档：同身份规范记录已保留该真实账号（${canonical.name} / ${canonical.team?.shortName || canonical.team?.name || '--'}）`,
              ),
            },
          });
          archived += 1;
          groupTouched = true;
          continue;
        }

        await prisma.playerRankAccount.update({
          where: { id: account.id },
        data: {
          playerId: canonical.id,
          teamId: canonical.teamId,
          notes: mergeDistinctNoteText(
            account.notes,
            `自动并回规范记录：${canonical.name} / ${canonical.team?.shortName || canonical.team?.name || '--'}`,
          ),
        },
      });
        await prisma.playerRankRecentSummary.updateMany({
          where: { accountId: account.id },
          data: {
            playerId: canonical.id,
            teamId: canonical.teamId,
          },
        });
        await prisma.playerRankSnapshot.updateMany({
          where: { accountId: account.id },
          data: {
            playerId: canonical.id,
          },
        });
        canonicalKeys.add(identityKey);
        moved += 1;
        groupTouched = true;
      }
    }

    if (groupTouched) {
      groups += 1;
      siblings.forEach((player) => touchedPlayerIds.add(player.id));
    }
  }

  if (touchedPlayerIds.size > 0) {
    await refreshRankProfilesByPlayerIds(Array.from(touchedPlayerIds));
  }

  return {
    groups,
    moved,
    archived,
    touchedPlayerIds: Array.from(touchedPlayerIds),
  };
}

export async function runRankSyncSkeleton(options?: { limit?: number; trigger?: 'manual' | 'cron' }) {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const providers = getRankSyncProviderStatus();
  const riotReady = providers.statuses.some((item) => item.key === 'riot' && item.ready);
  clearCurrentSeasonRankEffectiveScopeCache(['LPL', 'LCK']);
  const effectiveScope = await getCurrentSeasonRankEffectiveScope({ regions: ['LPL', 'LCK'], forceFresh: true });
  const recovery = await reactivateRecoverableArchivedAccounts();
  const lowQualityCleanup = await archiveLowQualityAutoImportedAccounts();
  const duplicateCleanup = await archiveDuplicateRankAccounts();
  const autoImport = await autoImportLeagueRankAccountsCanonical({
    regions: ['LPL', 'LCK'],
    overwriteExisting: false,
    forceRescan: true,
    effectiveScope,
  });
  const equivalentConsolidation = await consolidateEquivalentPlayerRankAccounts({
    regions: ['LPL', 'LCK'],
    effectiveScope,
  });
  const placeholderEquivalentCleanup = await archivePlaceholderAccountsWithRealEquivalent({
    regions: ['LPL', 'LCK'],
    effectiveScope,
  });
  const scheduledSyncPlayerIds = riotReady
    ? await getScheduledRankSyncPlayerIds(options?.limit, effectiveScope)
    : [];
  const targetedPlayerIds = Array.from(
    new Set([
      ...(autoImport.touchedPlayerIds || []),
      ...(equivalentConsolidation.touchedPlayerIds || []),
      ...(recovery.touchedPlayerIds || []),
      ...(lowQualityCleanup.touchedPlayerIds || []),
      ...(duplicateCleanup.touchedPlayerIds || []),
      ...(placeholderEquivalentCleanup.touchedPlayerIds || []),
      ...scheduledSyncPlayerIds,
    ].filter(Boolean)),
  );
  const riotResult = riotReady
    ? await syncRankAccountsViaRiot(
        targetedPlayerIds.length > 0 ? { playerIds: targetedPlayerIds } : { limit: 0 },
      )
    : null;
  const failurePolicy = await applyRankSyncFailurePolicy(riotResult);
  const autoResolvedCandidates = await autoResolveManagedRankCandidates();
  const placeholderCoverage = await ensurePlaceholderRankCoverage({
    regions: ['LPL', 'LCK'],
    effectiveScope,
  });
  const refreshPlayerIds = Array.from(
    new Set([
      ...targetedPlayerIds,
      ...(riotResult?.touchedPlayerIds || []),
      ...(failurePolicy.touchedPlayerIds || []),
      ...(autoResolvedCandidates.touchedPlayerIds || []),
      ...(placeholderCoverage.touchedPlayerIds || []),
    ].filter(Boolean)),
  );
  const profileRefresh =
    refreshPlayerIds.length > 0
      ? await refreshRankProfilesByPlayerIds(refreshPlayerIds)
      : await refreshAllRankProfiles(options?.limit);
  const durationMs = Date.now() - startedAt;
  const finishedAtIso = new Date().toISOString();
  const note = riotResult
    ? '已完成 LPL/LCK 账号自动发现、Riot 实时同步和缓存刷新。'
    : '已完成 LPL/LCK 账号自动发现和缓存刷新；当前未执行 Riot 实时同步。';

  await recordRankSyncHistory({
    id: `${options?.trigger || 'manual'}-${Date.now()}`,
    trigger: options?.trigger || 'manual',
    status: 'SUCCESS',
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    durationMs,
    refreshedPlayers: profileRefresh.refreshed,
    failedPlayers: profileRefresh.failed,
    riotAttempted: Number(riotResult?.attempted ?? 0),
    riotSynced: Number(riotResult?.synced ?? 0),
    autoImportedCreated: Number(autoImport?.created ?? 0),
    autoImportedUpdated: Number(autoImport?.updated ?? 0),
    note,
    error: null,
  });

  return {
    success: true,
    trigger: options?.trigger || 'manual',
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    durationMs,
    autoImport,
    equivalentConsolidation,
    recovery,
    lowQualityCleanup,
    duplicateCleanup,
    placeholderEquivalentCleanup,
    scheduledSyncPlayerIds,
    failurePolicy,
    autoResolvedCandidates,
    placeholderCoverage,
    refreshedPlayers: profileRefresh.refreshed,
    failedPlayers: profileRefresh.failed,
    providers,
    riot: riotResult,
    note,
  };
}





import { promises as fs } from 'fs';
import path from 'path';
