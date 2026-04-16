import Link from 'next/link';

import { prisma } from '@/lib/db';
import { getSystemConfig } from '@/lib/config-service';
import { comparePreferredEventCandidates } from '@/lib/event-defaults';
import { buildEventMetaRowsFromMatches, buildEventMetaRowsFromSnapshots } from '@/lib/event-meta';
import { ALL_EVENT_OPTION, buildConfiguredEventBundles } from '@/lib/event-option-mapping';
import { getRankModulePageData } from '@/lib/player-rank';
import { normalizeLeague, normalizeLeagueBucket, normalizeRole, parseJsonArray } from '@/lib/player-snapshot';
import { getTeamAliasCandidates, normalizeTeamLookupKey } from '@/lib/team-alias';
import AnalysisViewTabs from '@/components/analysis/AnalysisViewTabs';
import RankModulePage from '@/components/analysis/RankModulePage';
import PlayerPhoto from '@/components/player/PlayerPhoto';
import AnalysisFilters from './AnalysisFilters';

export const dynamic = 'force-dynamic';

type SortKey =
  | 'overallScore'
  | 'relativeScore'
  | 'confidence'
  | 'games'
  | 'wins'
  | 'winRatePct'
  | 'kda'
  | 'avgKills'
  | 'avgAssists'
  | 'avgDeaths'
  | 'killParticipationPct'
  | 'damagePerMin'
  | 'goldDiffAt15'
  | 'csDiffAt15'
  | 'xpDiffAt15';

const SORT_KEYS: SortKey[] = [
  'overallScore',
  'relativeScore',
  'confidence',
  'games',
  'wins',
  'winRatePct',
  'kda',
  'avgKills',
  'avgAssists',
  'avgDeaths',
  'killParticipationPct',
  'damagePerMin',
  'goldDiffAt15',
  'csDiffAt15',
  'xpDiffAt15',
];

const ROLE_LABEL: Record<string, string> = {
  ALL: '全部',
  TOP: '上单',
  JUN: '打野',
  MID: '中单',
  ADC: '下路',
  SUP: '辅助',
  OTHER: '其他',
};

const REGION_LABEL: Record<string, string> = {
  LPL: 'LPL',
  LCK: 'LCK',
  OTHER: 'OTHER',
  WORLDS: 'WORLDS',
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function formatSignedNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  const fixed = Number(value).toFixed(digits);
  return Number(value) > 0 ? `+${fixed}` : fixed;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${Number(value).toFixed(digits)}%`;
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return Number(value).toFixed(digits);
}

function formatDateTime(value: unknown) {
  if (!value) return '--';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

function getSortIndicator(currentKey: SortKey, key: SortKey, order: 'asc' | 'desc') {
  if (currentKey !== key) return '↕';
  return order === 'desc' ? '▼' : '▲';
}

function resolveRowSortValue(row: any, key: SortKey): number {
  return toNumber(row[key]);
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

function resolveRegionOptions(snapshotMeta: Array<{ league: string; tournamentName: string }>, configuredRegions: string[]) {
  const source = configuredRegions.length > 0 ? configuredRegions : ['LPL', 'LCK', 'OTHER', 'WORLDS'];
  const normalized = source.map((item) => normalizeLeagueBucket(item));
  return Array.from(new Set(normalized)).filter((item) => item !== 'MAJOR3');
}

function resolveTournamentRowBucket(row: { league: string; tournamentName: string }) {
  return normalizeLeagueBucket(row.league, row.tournamentName);
}

function scoreSnapshotCompleteness(row: any) {
  const metricFields = [
    'winRatePct',
    'kda',
    'avgKills',
    'avgDeaths',
    'avgAssists',
    'goldPerMin',
    'csPerMin',
    'damagePerMin',
    'goldDiffAt15',
    'csDiffAt15',
    'xpDiffAt15',
    'visionScorePerMin',
    'overallScore',
    'relativeScore',
    'confidence',
  ];

  let score = 0;
  for (const key of metricFields) {
    if (row[key] !== null && row[key] !== undefined && row[key] !== '') {
      score += 1;
    }
  }
  score += toNumber(row.games) * 0.01;
  score += row.source === 'lolesports_official' ? 0.3 : 0;
  score += row.source === 'oracleselixir' ? 0.8 : 0;
  score += row.source === 'golgg' ? 0.6 : 0;
  return score;
}

function normalizeStrictTournamentKey(value: unknown) {
  const stopwords = new Set(['season', '赛季', 'unknown', '未知', 'tournament', '赛事', 'vs', 'versus']);
  let text = String(value || '');
  const replacements: Array<[RegExp, string]> = [
    [/(第\s*1\s*赛段|第一赛段|split\s*1)/gi, ' split1 '],
    [/(第\s*2\s*赛段|第二赛段|split\s*2)/gi, ' split2 '],
    [/(第\s*3\s*赛段|第三赛段|split\s*3)/gi, ' split3 '],
    [/(第\s*4\s*赛段|第四赛段|split\s*4)/gi, ' split4 '],
    [/(杯|cup)/gi, ' cup '],
    [/(对决赛|versus)/gi, ' versus '],
    [/(卡位赛|lock[\s-]*in)/gi, ' lockin '],
    [/(春季赛|spring)/gi, ' spring '],
    [/(夏季赛|summer)/gi, ' summer '],
    [/(冬季赛|winter)/gi, ' winter '],
    [/(常规赛|regular\s*season)/gi, ' regular '],
    [/(淘汰赛|季后赛|playoffs?)/gi, ' playoffs '],
    [/(入围赛|play[\s-]*in)/gi, ' playin '],
    [/(瑞士轮|swiss\s*stage|swiss)/gi, ' swiss '],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !stopwords.has(token))
    .sort()
    .join(' ');
}

function weightedAverage(rows: any[], field: string, fallback = 0) {
  let weighted = 0;
  let weightSum = 0;
  for (const row of rows) {
    const value = Number(row[field]);
    if (!Number.isFinite(value)) continue;
    const w = Math.max(1, toNumber(row.games));
    weighted += value * w;
    weightSum += w;
  }
  if (weightSum === 0) return fallback;
  return weighted / weightSum;
}

function pickBestRow(rows: any[]) {
  return rows
    .slice()
    .sort((left, right) => {
      const diff = scoreSnapshotCompleteness(right) - scoreSnapshotCompleteness(left);
      if (diff !== 0) return diff;
      const rightHasPhoto = right?.player?.photo ? 1 : 0;
      const leftHasPhoto = left?.player?.photo ? 1 : 0;
      if (rightHasPhoto !== leftHasPhoto) return rightHasPhoto - leftHasPhoto;
      const rightHasPlayerId = right?.playerId ? 1 : 0;
      const leftHasPlayerId = left?.playerId ? 1 : 0;
      if (rightHasPlayerId !== leftHasPlayerId) return rightHasPlayerId - leftHasPlayerId;
      const rightMs = new Date(right.updatedAt || 0).getTime();
      const leftMs = new Date(left.updatedAt || 0).getTime();
      return rightMs - leftMs;
    })[0];
}

function sourcePriority(source: unknown) {
  const sourceText = String(source || '').toLowerCase();
  if (sourceText.includes('oracleselixir')) return 3;
  if (sourceText.includes('golgg')) return 2;
  if (sourceText.includes('lolesports')) return 1;
  return 0;
}

function mergeRowsForSource(rows: any[], unifiedTournamentName: string) {
  const byStrictTournament = new Map<string, any[]>();
  for (const row of rows) {
    const key = normalizeStrictTournamentKey(row.tournamentName);
    const list = byStrictTournament.get(key) || [];
    list.push(row);
    byStrictTournament.set(key, list);
  }

  const dedupedRows = Array.from(byStrictTournament.values()).map((group) => pickBestRow(group));
  const representative = pickBestRow(dedupedRows);

  const games = dedupedRows.reduce((sum, row) => sum + toNumber(row.games), 0);
  const wins = dedupedRows.reduce((sum, row) => sum + toNumber(row.wins), 0);
  const losses = dedupedRows.reduce((sum, row) => sum + toNumber(row.losses), 0);

  const avgKills = weightedAverage(dedupedRows, 'avgKills');
  const avgDeaths = weightedAverage(dedupedRows, 'avgDeaths');
  const avgAssists = weightedAverage(dedupedRows, 'avgAssists');
  const kda = avgDeaths > 0 ? (avgKills + avgAssists) / avgDeaths : weightedAverage(dedupedRows, 'kda');

  const latestSyncedAt = dedupedRows
    .map((row) => new Date(row.syncedAt || 0).getTime())
    .reduce((max, value) => Math.max(max, value), 0);

  const latestUpdatedAt = dedupedRows
    .map((row) => new Date(row.updatedAt || 0).getTime())
    .reduce((max, value) => Math.max(max, value), 0);

  const earliestDateFrom = dedupedRows
    .map((row) => (row.dateFrom ? new Date(row.dateFrom).getTime() : Number.POSITIVE_INFINITY))
    .reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);

  const latestDateTo = dedupedRows
    .map((row) => (row.dateTo ? new Date(row.dateTo).getTime() : 0))
    .reduce((max, value) => Math.max(max, value), 0);

  return {
    ...representative,
    sourceKey: String(representative.sourceKey || representative.id) + '::phase-merged',
    tournamentName: unifiedTournamentName || representative.tournamentName,
    splitName: unifiedTournamentName || representative.splitName,
    games,
    wins,
    losses: losses > 0 ? losses : Math.max(0, games - wins),
    winRatePct: games > 0 ? (wins / games) * 100 : weightedAverage(dedupedRows, 'winRatePct'),
    kda,
    avgKills,
    avgDeaths,
    avgAssists,
    csPerMin: weightedAverage(dedupedRows, 'csPerMin'),
    goldPerMin: weightedAverage(dedupedRows, 'goldPerMin'),
    killParticipationPct: weightedAverage(dedupedRows, 'killParticipationPct'),
    damageSharePct: weightedAverage(dedupedRows, 'damageSharePct'),
    goldSharePct: weightedAverage(dedupedRows, 'goldSharePct'),
    visionSharePct: weightedAverage(dedupedRows, 'visionSharePct'),
    damagePerMin: weightedAverage(dedupedRows, 'damagePerMin'),
    visionScorePerMin: weightedAverage(dedupedRows, 'visionScorePerMin'),
    wardsPerMin: weightedAverage(dedupedRows, 'wardsPerMin'),
    wardsClearedPerMin: weightedAverage(dedupedRows, 'wardsClearedPerMin'),
    visionWardsPerMin: weightedAverage(dedupedRows, 'visionWardsPerMin'),
    goldDiffAt15: weightedAverage(dedupedRows, 'goldDiffAt15'),
    csDiffAt15: weightedAverage(dedupedRows, 'csDiffAt15'),
    xpDiffAt15: weightedAverage(dedupedRows, 'xpDiffAt15'),
    firstBloodParticipationPct: weightedAverage(dedupedRows, 'firstBloodParticipationPct'),
    firstBloodVictimPct: weightedAverage(dedupedRows, 'firstBloodVictimPct'),
    confidence: weightedAverage(dedupedRows, 'confidence'),
    stateScore: weightedAverage(dedupedRows, 'stateScore'),
    masteryScore: weightedAverage(dedupedRows, 'masteryScore'),
    laneScore: weightedAverage(dedupedRows, 'laneScore'),
    overallScore: weightedAverage(dedupedRows, 'overallScore'),
    relativeScore: weightedAverage(dedupedRows, 'relativeScore'),
    relativeZScore: weightedAverage(dedupedRows, 'relativeZScore'),
    trendScore: weightedAverage(dedupedRows, 'trendScore'),
    recentWinRatePct: weightedAverage(dedupedRows, 'recentWinRatePct'),
    careerWinRatePct: weightedAverage(dedupedRows, 'careerWinRatePct'),
    recentKda: weightedAverage(dedupedRows, 'recentKda'),
    careerKda: weightedAverage(dedupedRows, 'careerKda'),
    localGoldPerMin: weightedAverage(dedupedRows, 'localGoldPerMin'),
    localCsPerMin: weightedAverage(dedupedRows, 'localCsPerMin'),
    localDamagePerMin: weightedAverage(dedupedRows, 'localDamagePerMin'),
    localDamageTakenPerMin: weightedAverage(dedupedRows, 'localDamageTakenPerMin'),
    localKillParticipationPct: weightedAverage(dedupedRows, 'localKillParticipationPct'),
    localVisionPerMin: weightedAverage(dedupedRows, 'localVisionPerMin'),
    localScore: weightedAverage(dedupedRows, 'localScore'),
    localExternalWinRatePct: weightedAverage(dedupedRows, 'localExternalWinRatePct'),
    currentRecentGames: dedupedRows.reduce((max, row) => Math.max(max, toNumber(row.currentRecentGames)), 0),
    currentTotalGames: dedupedRows.reduce((max, row) => Math.max(max, toNumber(row.currentTotalGames)), 0),
    sampleGames: dedupedRows.reduce((max, row) => Math.max(max, toNumber(row.sampleGames)), 0),
    mappingConfidence: weightedAverage(dedupedRows, 'mappingConfidence'),
    syncedAt: latestSyncedAt > 0 ? new Date(latestSyncedAt) : representative.syncedAt,
    updatedAt: latestUpdatedAt > 0 ? new Date(latestUpdatedAt) : representative.updatedAt,
    dateFrom: Number.isFinite(earliestDateFrom) ? new Date(earliestDateFrom) : representative.dateFrom,
    dateTo: latestDateTo > 0 ? new Date(latestDateTo) : representative.dateTo,
  };
}

function dedupeRows(rows: any[], unifiedTournamentName: string) {
  const shouldMergeAcrossTournaments = unifiedTournamentName !== ALL_EVENT_OPTION;
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const key = [
      row.seasonYear,
      resolveSnapshotPlayerKey(row),
      resolveSnapshotTeamKey(row),
      normalizeRole(row.role),
    ].join('::');
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }

  const result: any[] = [];
  for (const groupRows of grouped.values()) {
    const bySource = new Map<string, any[]>();
    for (const row of groupRows) {
      const sourceKey = String(row.source || 'unknown');
      const list = bySource.get(sourceKey) || [];
      list.push(row);
      bySource.set(sourceKey, list);
    }

    const sourceCandidates = Array.from(bySource.entries()).map(([source, sourceRows]) => {
      const merged = shouldMergeAcrossTournaments ? mergeRowsForSource(sourceRows, unifiedTournamentName) : pickBestRow(sourceRows);
      const score = toNumber(merged.games) * 100 + scoreSnapshotCompleteness(merged) * 10 + sourcePriority(source) * 5;
      return { merged, score };
    });

    if (sourceCandidates.length > 0) {
      sourceCandidates.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        const rightMs = new Date(right.merged.updatedAt || 0).getTime();
        const leftMs = new Date(left.merged.updatedAt || 0).getTime();
        return rightMs - leftMs;
      });
      result.push(enrichRowWithPreferredIdentity(sourceCandidates[0].merged, groupRows));
    }
  }

  return result;
}

function buildTeamAliasKeys(...values: Array<unknown>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => getTeamAliasCandidates(String(value || '').trim()))
        .map((value) => normalizeTeamLookupKey(value))
        .filter(Boolean),
    ),
  );
}

function resolveSnapshotPlayerKey(row: any) {
  return String(row.normalizedPlayerName || row.playerName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function resolveSnapshotTeamKey(row: any) {
  const aliasKeys = buildTeamAliasKeys(row.teamName, row.teamShortName, row.mappedTeamName);
  if (aliasKeys.length > 0) return aliasKeys.slice().sort()[0];
  return normalizeTeamLookupKey(String(row.teamName || row.teamShortName || row.mappedTeamName || '').trim());
}

function enrichRowWithPreferredIdentity(row: any, rows: any[]) {
  const preferredWithPhoto = pickBestRow(rows.filter((item) => item?.player?.photo));
  const preferredWithPlayerId = pickBestRow(rows.filter((item) => item?.playerId));
  return {
    ...row,
    playerId: row.playerId || preferredWithPlayerId?.playerId || null,
    player: row.player?.photo ? row.player : preferredWithPhoto?.player || row.player,
    teamShortName: row.teamShortName || preferredWithPlayerId?.teamShortName || preferredWithPhoto?.teamShortName || row.teamShortName,
    mappedTeamName: row.mappedTeamName || preferredWithPlayerId?.mappedTeamName || preferredWithPhoto?.mappedTeamName || row.mappedTeamName,
  };
}

function resolveMatchRegionBucket(row: {
  tournament?: string | null;
  teamA?: { region?: string | null } | null;
  teamB?: { region?: string | null } | null;
}) {
  const primaryRegion = String(row.teamA?.region || row.teamB?.region || '').trim();
  return normalizeLeagueBucket(primaryRegion || row.tournament || '', row.tournament || '');
}

function normalizeTournamentKey(value: string) {
  const stopwords = new Set([
    'season', '\u8d5b\u5b63', 'unknown', '\u672a\u77e5', 'tournament', '\u8d5b\u4e8b', 'vs', 'versus',
    'regular', 'playoffs', 'group', 'stage', 'swiss', 'playin',
  ]);
  let text = String(value || '');
  const replacements: Array<[RegExp, string]> = [
    [/(第\s*1\s*赛段|第一赛段|split\s*1)/gi, ' split1 '],
    [/(第\s*2\s*赛段|第二赛段|split\s*2)/gi, ' split2 '],
    [/(第\s*3\s*赛段|第三赛段|split\s*3)/gi, ' split3 '],
    [/(第\s*4\s*赛段|第四赛段|split\s*4)/gi, ' split4 '],
    [/(杯|cup)/gi, ' cup '],
    [/(对决赛|versus)/gi, ' versus '],
    [/(卡位赛|lock[\s-]*in)/gi, ' lockin '],
    [/(春季赛|spring)/gi, ' spring '],
    [/(夏季赛|summer)/gi, ' summer '],
    [/(冬季赛|winter)/gi, ' winter '],
    [/(常规赛|regular\s*season)/gi, ' regular '],
    [/(淘汰赛|季后赛|playoffs?)/gi, ' playoffs '],
    [/(入围赛|play[\s-]*in)/gi, ' playin '],
    [/(瑞士轮|swiss\s*stage|swiss)/gi, ' swiss '],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  const normalizeToken = (token: string) => {
    if (token === 'playoff' || token === 'playoffs' || token === '\u5b63\u540e\u8d5b') return 'playoffs';
    if (token === 'group' || token === 'groups') return 'group';
    if (token === 'stage' || token === '\u9636\u6bb5') return 'stage';
    if (token === 'playin' || token === 'play-in') return 'playin';
    return token;
  };

  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(normalizeToken)
    .filter((token) => !stopwords.has(token))
    .sort()
    .join(' ');
}

function buildTournamentSelectionKeys(
  display: string,
  aliasGroup: { selectionAliases: string[]; matchAliases: string[] } | null | undefined,
) {
  return new Set(
    [display, ...(aliasGroup?.selectionAliases || []), ...(aliasGroup?.matchAliases || [])]
      .map((value) => normalizeTournamentKey(String(value || '')))
      .filter(Boolean),
  );
}

function scoreTournamentLabel(value: string) {
  const text = String(value || '').trim();
  if (!text) return 0;
  let score = 0;
  if (/^[A-Za-z]+\s+20\d{2}\b/.test(text)) score += 20;
  if (/\b20\d{2}\b/.test(text)) score += 8;
  if (/\b(split|cup)\b/i.test(text)) score += 6;
  if (/\b(playoffs?|regular|group|stage|swiss|play[- ]?in)\b/i.test(text)) score -= 4;
  if (/\b(split|cup)\b.*\b20\d{2}\b/i.test(text)) score -= 2;
  score -= Math.max(0, text.length - 36) * 0.05;
  return score;
}

function resolveLeafLeagueKey(league: unknown, tournamentName: unknown) {
  const normalizedLeague = normalizeLeague(league || '');
  if (normalizedLeague && normalizedLeague !== 'OTHER') return normalizedLeague;

  const text = String(tournamentName || '').trim();
  const match = text.match(/^([A-Za-z]{2,10})\s+20\d{2}\b/i);
  if (!match) return normalizedLeague || 'OTHER';

  const inferred = normalizeLeague(match[1]);
  return inferred || normalizedLeague || 'OTHER';
}

function isUnknownTournamentLabel(value: string) {
  const text = String(value || '').trim().toLowerCase();
  return text.includes('unknown') || /\u672a\u77e5/u.test(text);
}

function pickOtherLeagueDisplayName(
  league: string,
  seasonYear: string,
  aliasesWithGames: Array<[string, number]>,
  scoreDisplayName: (name: string, league: string, totalGames: number) => number,
) {
  if (aliasesWithGames.length === 0) return '';

  const sortByScore = (left: [string, number], right: [string, number]) => {
    const rightScore = scoreDisplayName(right[0], league, right[1]);
    const leftScore = scoreDisplayName(left[0], league, left[1]);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left[0].localeCompare(right[0]);
  };

  if (league === 'LEC') {
    const versus = aliasesWithGames.filter(([name]) => /\bversus\b/i.test(name));
    if (versus.length > 0) {
      const canonical = [league, seasonYear, 'Versus'].filter(Boolean).join(' ').trim();
      const exact = versus.find(([name]) => name.toLowerCase() === canonical.toLowerCase());
      if (exact) return exact[0];
      return canonical;
    }
  }

  if (league === 'LJL') {
    const nonUnknown = aliasesWithGames.filter(([name]) => !isUnknownTournamentLabel(name));
    if (nonUnknown.length > 0) {
      return nonUnknown.slice().sort(sortByScore)[0][0];
    }
  }

  if (league === 'CBLOL') {
    const cupAliases = aliasesWithGames.filter(([name]) => /\b(cup)\b/i.test(name) || name.includes('杯'));
    if (cupAliases.length > 0) {
      return cupAliases.slice().sort(sortByScore)[0][0];
    }
    return [league, seasonYear, 'Cup'].filter(Boolean).join(' ').trim();
  }

  const nonUnknown = aliasesWithGames.filter(([name]) => !isUnknownTournamentLabel(name));
  const pool = nonUnknown.length > 0 ? nonUnknown : aliasesWithGames;
  return pool.slice().sort(sortByScore)[0][0];
}

function buildTournamentAliasMapLegacy(rows: Array<{ league: string; seasonYear: string; tournamentName: string; games?: number; syncedAtMs?: number }>) {
  const grouped = new Map<string, Array<{ name: string; league: string; seasonYear: string; games: number; syncedAtMs: number }>>();

  for (const row of rows) {
    const normalizedName = String(row.tournamentName || '').trim();
    if (!normalizedName) continue;

    const leagueKey = resolveLeafLeagueKey(row.league || '', normalizedName);
    const bucket = normalizeLeagueBucket(leagueKey, normalizedName);
    const isCoreLeague = bucket === 'LPL' || bucket === 'LCK' || bucket === 'WORLDS';

    const aliasKey = isCoreLeague
      ? leagueKey + '::' + normalizeTournamentKey(normalizedName)
      : leagueKey + '::' + String(row.seasonYear || '').trim();

    const list = grouped.get(aliasKey) || [];
    list.push({
      name: normalizedName,
      league: leagueKey,
      seasonYear: String(row.seasonYear || '').trim(),
      games: Math.max(0, toNumber(row.games)),
      syncedAtMs: Math.max(0, Number(row.syncedAtMs || 0)),
    });
    grouped.set(aliasKey, list);
  }

  const scoreDisplayName = (name: string, league: string, totalGames: number) => {
    const label = String(name || '').trim();
    const lower = label.toLowerCase();
    let score = scoreTournamentLabel(label);
    score += totalGames * 0.05;
    if (lower.includes('unknown') || /\u672a\u77e5/u.test(label)) score -= 1000;
    if (league === 'LEC' && lower.includes('versus')) score += 30;
    return score;
  };

  const aliasEntries: Array<{ display: string; aliases: string[]; latestTimestampMs: number; totalGames: number }> = [];

  for (const entries of grouped.values()) {
    const byName = new Map<string, number>();
    let league = '';
    let latestTimestampMs = 0;

    for (const item of entries) {
      league = item.league || league;
      byName.set(item.name, (byName.get(item.name) || 0) + item.games);
      latestTimestampMs = Math.max(latestTimestampMs, item.syncedAtMs || 0);
    }

    const aliases = Array.from(byName.entries())
      .sort((left, right) => {
        const rightScore = scoreDisplayName(right[0], league, right[1]);
        const leftScore = scoreDisplayName(left[0], league, left[1]);
        if (rightScore !== leftScore) return rightScore - leftScore;
        return left[0].localeCompare(right[0]);
      })
      .map(([name]) => name);

    if (aliases.length > 0) {
      const seasonYear = entries.find((item) => !!item.seasonYear)?.seasonYear || '';
      const display = pickOtherLeagueDisplayName(league, seasonYear, Array.from(byName.entries()), scoreDisplayName) || aliases[0];
      aliasEntries.push({
        display,
        aliases,
        latestTimestampMs,
        totalGames: Array.from(byName.values()).reduce((sum, value) => sum + value, 0),
      });
    }
  }

  aliasEntries.sort((left, right) =>
    comparePreferredEventCandidates(
      {
        label: left.display,
        latestTimestampMs: left.latestTimestampMs,
        totalCount: left.totalGames,
      },
      {
        label: right.display,
        latestTimestampMs: right.latestTimestampMs,
        totalCount: right.totalGames,
      },
    ),
  );

  const aliasMap = new Map<string, string[]>();
  for (const entry of aliasEntries) {
    aliasMap.set(entry.display, entry.aliases);
  }

  return aliasMap;
}

function buildTournamentAliasMap(
  rows: Array<{ league: string; seasonYear: string; tournamentName: string; stage?: string; games?: number; syncedAtMs?: number }>,
  splits: Parameters<typeof buildConfiguredEventBundles>[1],
  targetRegion: string,
) {
  const aliasMap = new Map<string, { selectionAliases: string[]; matchAliases: string[] }>();
  const bundles = buildConfiguredEventBundles(
    rows.map((row) => ({
      league: row.league,
      seasonYear: String(row.seasonYear || '').trim(),
      tournamentName: String(row.tournamentName || '').trim(),
      stage: String(row.stage || '').trim(),
      games: Math.max(0, toNumber(row.games)),
      syncedAtMs: Math.max(0, Number(row.syncedAtMs || 0)),
    })),
    splits,
    targetRegion,
  );

  for (const bundle of bundles) {
    aliasMap.set(bundle.display, {
      selectionAliases: bundle.selectionAliases,
      matchAliases: bundle.matchAliases,
    });
  }

  return aliasMap;
}

function resolveTournamentSelection(requested: string, aliasMap: Map<string, { selectionAliases: string[]; matchAliases: string[] }>) {

  const requestedText = String(requested || '').trim();
  if (!requestedText) return '';
  if (aliasMap.has(requestedText)) return requestedText;

  for (const [display, aliasGroup] of aliasMap.entries()) {
    if (aliasGroup.selectionAliases.includes(requestedText)) {
      return display;
    }
  }
  return '';
}

export default async function PlayerDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    year?: string;
    tournament?: string;
    search?: string;
    region?: string;
    role?: string;
    sort?: string;
    order?: string;
    activity?: string;
    accountStatus?: string;
    rankSort?: string;
    rankOrder?: string;
  }>;
}) {
  const { view, year, tournament, search, region, role, sort, order, activity, accountStatus, rankSort, rankOrder } = await searchParams;
  const selectedView = view === 'rank' ? 'rank' : 'summary';

  const buildViewHref = (nextView: 'summary' | 'rank') => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    if (year) params.set('year', year);
    if (tournament) params.set('tournament', tournament);
    if (role) params.set('role', role);
    if (search) params.set('search', search);

    if (nextView === 'rank') {
      params.set('view', 'rank');
      if (activity) params.set('activity', activity);
      if (accountStatus) params.set('accountStatus', accountStatus);
      if (rankSort) params.set('rankSort', rankSort);
      if (rankOrder) params.set('rankOrder', rankOrder);
    } else {
      if (sort) params.set('sort', sort);
      if (order) params.set('order', order);
    }

    const query = params.toString();
    return query ? `/analysis?${query}` : '/analysis';
  };

  if (selectedView === 'rank') {
    const rankData = await getRankModulePageData({
      view,
      year,
      tournament,
      search,
      region,
      role,
      activity,
      accountStatus,
      rankSort,
      rankOrder,
    });

    return (
      <RankModulePage
        data={rankData}
        summaryHref={buildViewHref('summary')}
        rankHref={buildViewHref('rank')}
      />
    );
  }

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
        teamA: { select: { region: true, name: true, shortName: true } },
        teamB: { select: { region: true, name: true, shortName: true } },
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

  const configuredRegions = (config.regions || []).map((item) => item.id).filter((item) => Boolean(item) && item !== 'MAJOR3');
  const availableRegions = resolveRegionOptions(eventMeta, configuredRegions);
  const requestedRegion = normalizeLeagueBucket(region || config.defaultRegion || availableRegions[0] || 'LPL');
  const selectedRegion = availableRegions.includes(requestedRegion) ? requestedRegion : (availableRegions[0] || 'LPL');

  const regionMeta = eventMeta.filter((row) => resolveTournamentRowBucket(row) === selectedRegion);

  const yearsByRegionMap = new Map<string, string[]>();
  for (const regionId of availableRegions) {
    const years = Array.from(
      new Set(
        eventMeta
          .filter((row) => resolveTournamentRowBucket(row) === regionId)
          .map((row) => String(row.seasonYear || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => b.localeCompare(a));
    yearsByRegionMap.set(regionId, years);
  }

  const availableYears = yearsByRegionMap.get(selectedRegion) || [];
  const requestedYear = String(year || '').trim();
  const selectedYear = availableYears.includes(requestedYear)
    ? requestedYear
    : String(config.defaultYear && availableYears.includes(config.defaultYear) ? config.defaultYear : (availableYears[0] || new Date().getFullYear())).trim();

  const tournamentAliasMap = buildTournamentAliasMap(
    regionMeta
      .filter((row) => String(row.seasonYear || '').trim() === selectedYear)
      .map((row) => ({
        league: row.league,
        seasonYear: String(row.seasonYear || '').trim(),
        tournamentName: String(row.tournamentName || '').trim(),
        stage: row.stage,
        games: toNumber((row as any).games),
        syncedAtMs: Number(row.syncedAtMs || 0),
      }))
      .filter((row) => row.tournamentName.length > 0),
    config.splits,
    selectedRegion,
  );
  const tournamentOptions = [ALL_EVENT_OPTION, ...Array.from(tournamentAliasMap.keys())];
  const requestedTournament = String(tournament || '').trim();
  const preferredTournament = tournamentOptions.find((item) => item !== ALL_EVENT_OPTION) || ALL_EVENT_OPTION;
  const initialSelectedTournament =
    requestedTournament === ALL_EVENT_OPTION
      ? ALL_EVENT_OPTION
      : resolveTournamentSelection(requestedTournament, tournamentAliasMap) || preferredTournament;
  let selectedTournament = initialSelectedTournament;
  let selectedTournamentBundle =
    selectedTournament === ALL_EVENT_OPTION ? null : tournamentAliasMap.get(selectedTournament) || null;

  const yearsByRegion = Object.fromEntries(Array.from(yearsByRegionMap.entries()));
  const tournamentsByRegionYear: Record<string, string[]> = {};
  for (const regionId of availableRegions) {
    const years = yearsByRegionMap.get(regionId) || [];
    for (const y of years) {
      const rows = eventMeta
        .filter((row) => resolveTournamentRowBucket(row) === regionId && String(row.seasonYear || '').trim() === y)
          .map((row) => ({
            league: row.league,
            seasonYear: String(row.seasonYear || '').trim(),
            tournamentName: String(row.tournamentName || '').trim(),
            stage: row.stage,
            games: toNumber((row as any).games),
            syncedAtMs: Number(row.syncedAtMs || 0),
          }))
          .filter((row) => row.tournamentName.length > 0);
      const key = regionId + '::' + y;
      tournamentsByRegionYear[key] = [ALL_EVENT_OPTION, ...Array.from(buildTournamentAliasMap(rows, config.splits, regionId).keys())];
    }
  }
  const selectedRole = normalizeRole(role || 'ALL');
  const searchText = String(search || '').trim();
  const searchKeyword = normalizeSearch(searchText);

  const rawSort = String(sort || 'overallScore');
  const selectedSortKey: SortKey = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : 'overallScore';
  const selectedOrder: 'asc' | 'desc' = order === 'asc' ? 'asc' : 'desc';

  const candidateRows = await prisma.playerStatSnapshot.findMany({
    include: {
      player: {
        select: {
          photo: true,
        },
      },
    },
    where: {
      seasonYear: selectedYear,
      ...(selectedRole !== 'ALL' ? { role: selectedRole } : {}),
    },
    orderBy: [{ syncedAt: 'desc' }, { updatedAt: 'desc' }, { games: 'desc' }],
  });

  const scopedCandidateRows = candidateRows.filter((row) => resolveTournamentRowBucket(row) === selectedRegion);
  const filterRowsByTournament = (
    rows: typeof scopedCandidateRows,
    tournamentLabel: string,
    aliasGroup: { selectionAliases: string[]; matchAliases: string[] } | null,
  ) => {
    if (tournamentLabel === ALL_EVENT_OPTION) return rows;
    const selectionKeys = buildTournamentSelectionKeys(tournamentLabel, aliasGroup);
    if (selectionKeys.size === 0) return [];
    return rows.filter((row) => selectionKeys.has(normalizeTournamentKey(String(row.tournamentName || ''))));
  };

  let tournamentScopedRows = filterRowsByTournament(scopedCandidateRows, selectedTournament, selectedTournamentBundle);
  if (selectedTournament !== ALL_EVENT_OPTION && tournamentScopedRows.length === 0) {
    for (const option of tournamentOptions) {
      if (option === ALL_EVENT_OPTION) continue;
      const bundle = tournamentAliasMap.get(option) || null;
      const optionRows = filterRowsByTournament(scopedCandidateRows, option, bundle);
      if (optionRows.length === 0) continue;
      selectedTournament = option;
      selectedTournamentBundle = bundle;
      tournamentScopedRows = optionRows;
      break;
    }
  }
  if (tournamentScopedRows.length === 0) {
    selectedTournament = ALL_EVENT_OPTION;
    selectedTournamentBundle = null;
    tournamentScopedRows = scopedCandidateRows;
  }

  const officialTeamAliasKeys = new Set<string>();
  const selectedTournamentMatchAliases = selectedTournamentBundle?.matchAliases || [];
  if (selectedTournamentMatchAliases.length > 0) {
    for (const row of matchMeta) {
      if (resolveMatchRegionBucket(row) !== selectedRegion) continue;
      if (!selectedTournamentMatchAliases.includes(String(row.tournament || '').trim())) continue;
      buildTeamAliasKeys(row.teamA?.name, row.teamA?.shortName, row.teamB?.name, row.teamB?.shortName).forEach((key) =>
        officialTeamAliasKeys.add(key),
      );
    }
  }

  const strictFilteredCandidateRows =
    officialTeamAliasKeys.size === 0
      ? tournamentScopedRows
      : tournamentScopedRows.filter((row) =>
          buildTeamAliasKeys(row.teamName, row.teamShortName, row.mappedTeamName).some((key) => officialTeamAliasKeys.has(key)),
        );
  const filteredCandidateRows =
    officialTeamAliasKeys.size > 0 && strictFilteredCandidateRows.length === 0
      ? tournamentScopedRows
      : strictFilteredCandidateRows;

  const baseRows = dedupeRows(filteredCandidateRows, selectedTournament);

  const rows = baseRows
    .filter((row) => {
      if (!searchKeyword) return true;
      return [row.playerName, row.teamName, row.teamShortName, row.mappedTeamName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchKeyword));
    })
    .sort((left, right) => {
      const leftValue = resolveRowSortValue(left, selectedSortKey);
      const rightValue = resolveRowSortValue(right, selectedSortKey);
      if (leftValue !== rightValue) {
        return selectedOrder === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }
      return String(left.playerName || '').localeCompare(String(right.playerName || ''));
    });

  const roleOptions = ['ALL', ...Array.from(new Set(baseRows.map((row) => normalizeRole(row.role)).filter(Boolean)))];
  const latestSyncedAt = snapshotMeta[0]?.syncedAt || null;
  const leafLeagueCount = Array.from(new Set(snapshotMeta.map((row) => normalizeLeague(row.league)).filter(Boolean))).length;
  const totalSnapshotCount = snapshotMeta.length;
  const bucketSnapshotCount = snapshotMeta.filter((row) => resolveTournamentRowBucket(row) === selectedRegion).length;
  const bucketLeafLeagues = Array.from(new Set(regionMeta.map((row) => normalizeLeague(row.league)).filter(Boolean))).sort();

  const buildQuery = (patch: Partial<Record<'region' | 'year' | 'tournament' | 'role' | 'search' | 'sort' | 'order', string>>) => {
    const params = new URLSearchParams();
    params.set('region', selectedRegion);
    params.set('year', selectedYear);
    if (selectedTournament) params.set('tournament', selectedTournament);
    params.set('role', selectedRole);
    if (searchText) params.set('search', searchText);
    params.set('sort', selectedSortKey);
    params.set('order', selectedOrder);

    Object.entries(patch).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });

    return `?${params.toString()}`;
  };

  const buildSortHref = (key: SortKey) => {
    const nextOrder: 'asc' | 'desc' = selectedSortKey === key && selectedOrder === 'desc' ? 'asc' : 'desc';
    return buildQuery({ sort: key, order: nextOrder });
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap">
      <Link href={buildSortHref(sortKey)} className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors">
        <span>{label}</span>
        <span className="text-[11px] text-slate-400">{getSortIndicator(selectedSortKey, sortKey, selectedOrder)}</span>
      </Link>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-950 to-slate-900 rounded-xl border border-slate-800 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4">
          <AnalysisViewTabs
            activeView="summary"
            summaryHref={buildViewHref('summary')}
            rankHref={buildViewHref('rank')}
          />
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight">选手资料总览</h1>
              <p className="text-sm text-slate-300 mt-1">这里直接展示 BP 项目同步过来的完整选手统计快照，包含赛季数据、当前状态评分、对线与视野指标。</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
                <div className="text-slate-400">当前分类</div>
                <div className="font-bold text-cyan-300">{REGION_LABEL[selectedRegion] || selectedRegion}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
                <div className="text-slate-400">赛季</div>
                <div className="font-bold text-cyan-300">{selectedYear}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
                <div className="text-slate-400">当前赛事</div>
                <div className="font-bold text-slate-100">{selectedTournament || '全部赛事'}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
                <div className="text-slate-400">当前选手数</div>
                <div className="font-bold text-emerald-300">{rows.length}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3">
              <div className="text-slate-400 text-xs font-bold">最近一次 BP 同步时间</div>
              <div className="mt-1 text-base font-black text-slate-100">{formatDateTime(latestSyncedAt)}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3">
              <div className="text-slate-400 text-xs font-bold">本次同步赛区数</div>
              <div className="mt-1 text-base font-black text-emerald-300">{leafLeagueCount}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3">
              <div className="text-slate-400 text-xs font-bold">快照总数</div>
              <div className="mt-1 text-base font-black text-cyan-300">{totalSnapshotCount}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3">
              <div className="text-slate-400 text-xs font-bold">当前分类覆盖</div>
              <div className="mt-1 text-base font-black text-violet-300">{bucketSnapshotCount} 条 / {bucketLeafLeagues.join('、') || '无'}</div>
            </div>
          </div>
        </div>
      </div>

      <AnalysisFilters
        selectedRegion={selectedRegion}
        selectedYear={selectedYear}
        selectedTournament={selectedTournament}
        selectedRole={selectedRole}
        searchText={searchText}
        selectedSortKey={selectedSortKey}
        selectedOrder={selectedOrder}
        regionOptions={availableRegions.map((item) => ({ value: item, label: REGION_LABEL[item] || item }))}
        roleOptions={roleOptions.map((item) => ({ value: item, label: ROLE_LABEL[item] || item }))}
        yearsByRegion={yearsByRegion}
        tournamentsByRegionYear={tournamentsByRegionYear}
      />

      <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[2200px] w-full text-[13px] text-slate-800">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap">名次</th>
                <th className="px-3 py-3 text-left font-bold text-slate-700 whitespace-nowrap">选手 / 战队</th>
                <th className="px-3 py-3 text-left font-bold text-slate-700 whitespace-nowrap">当前状态</th>
                <SortHeader label="总分" sortKey="overallScore" />
                <SortHeader label="赛区分" sortKey="relativeScore" />
                <SortHeader label="可信" sortKey="confidence" />
                <SortHeader label="小场出场" sortKey="games" />
                <SortHeader label="小场胜场" sortKey="wins" />
                <SortHeader label="胜率" sortKey="winRatePct" />
                <SortHeader label="KDA" sortKey="kda" />
                <SortHeader label="场均击杀" sortKey="avgKills" />
                <SortHeader label="场均助攻" sortKey="avgAssists" />
                <SortHeader label="场均死亡" sortKey="avgDeaths" />
                <SortHeader label="参团率" sortKey="killParticipationPct" />
                <SortHeader label="DPM" sortKey="damagePerMin" />
                <th className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap">GPM / CSPM</th>
                <SortHeader label="15分经济差" sortKey="goldDiffAt15" />
                <SortHeader label="15分补刀差" sortKey="csDiffAt15" />
                <SortHeader label="15分经验差" sortKey="xpDiffAt15" />
                <th className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap">视野</th>
                <th className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap">赛事 / 来源</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={20} className="py-14 text-center text-slate-500 font-medium">当前筛选下没有可展示的选手数据</td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const labels = parseJsonArray(row.labelsJson).filter((label) => label !== String(row.evaluationLabel || '')).slice(0, 3);
                  return (
                    <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-50 align-top">
                      <td className="px-3 py-3 text-center font-bold text-slate-900">{index + 1}</td>
                      <td className="px-3 py-3 min-w-[220px]">
                        {row.playerId ? (
                          <Link href={`/players/${row.playerId}`} className="group flex items-start gap-3">
                            <PlayerPhoto
                              src={row.player?.photo}
                              name={row.playerName}
                              size={44}
                              className="shrink-0 border border-slate-200"
                              fallbackClassName="bg-slate-100 border border-slate-200"
                              fallbackTextClassName="text-slate-500"
                            />
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-blue-600">{row.playerName}</div>
                            <div className="text-xs text-slate-500">{row.teamShortName || row.teamName} · {ROLE_LABEL[row.role] || row.role}</div>
                            </div>
                          </Link>
                        ) : (
                          <div className="flex items-start gap-3">
                            <PlayerPhoto
                              src={row.player?.photo}
                              name={row.playerName}
                              size={44}
                              className="shrink-0 border border-slate-200"
                              fallbackClassName="bg-slate-100 border border-slate-200"
                              fallbackTextClassName="text-slate-500"
                            />
                            <div>
                              <div className="font-bold text-slate-900">{row.playerName}</div>
                            <div className="text-xs text-slate-500">{row.teamShortName || row.teamName} · {ROLE_LABEL[row.role] || row.role}</div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 min-w-[210px]">
                        <div className="flex flex-wrap gap-1">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${resolveBadgeClass(String(row.evaluationLabel || ''))}`}>
                            {row.evaluationLabel || '待评估'}
                          </span>
                          {labels.map((label) => (
                            <span key={label} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${resolveBadgeClass(label)}`}>
                              {label}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">趋势 {formatSignedNumber(toNullableNumber(row.trendScore), 1)} · Z {formatNumber(toNullableNumber(row.relativeZScore), 2)}</div>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-900">{formatNumber(toNullableNumber(row.overallScore), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold text-violet-700">{formatNumber(toNullableNumber(row.relativeScore), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold text-sky-700">{formatNumber(toNullableNumber(row.confidence), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{row.games}</td>
                      <td className="px-3 py-3 text-center font-semibold">{row.wins}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatPercent(toNullableNumber(row.winRatePct), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold text-blue-700">{formatNumber(toNullableNumber(row.kda), 2)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatNumber(toNullableNumber(row.avgKills), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatNumber(toNullableNumber(row.avgAssists), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatNumber(toNullableNumber(row.avgDeaths), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatPercent(toNullableNumber(row.killParticipationPct), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatNumber(toNullableNumber(row.damagePerMin), 0)}</td>
                      <td className="px-3 py-3 text-center font-semibold">
                        <div>{formatNumber(toNullableNumber(row.goldPerMin), 1)}</div>
                        <div className="text-xs text-slate-500">{formatNumber(toNullableNumber(row.csPerMin), 2)}</div>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold">{formatSignedNumber(toNullableNumber(row.goldDiffAt15), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatSignedNumber(toNullableNumber(row.csDiffAt15), 2)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatSignedNumber(toNullableNumber(row.xpDiffAt15), 1)}</td>
                      <td className="px-3 py-3 text-center font-semibold">
                        <div>VSPM {formatNumber(toNullableNumber(row.visionScorePerMin), 2)}</div>
                        <div className="text-xs text-slate-500">眼 {formatNumber(toNullableNumber(row.wardsPerMin), 2)} / 排 {formatNumber(toNullableNumber(row.wardsClearedPerMin), 2)}</div>
                      </td>
                      <td className="px-3 py-3 min-w-[220px]">
                        <div className="font-semibold text-slate-900">{row.tournamentName}</div>
                        <div className="text-xs text-slate-500">{row.source} · 叶子赛区 {normalizeLeague(row.league)} · 更新 {formatDateTime(row.updatedAt)}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


