import { type SplitConfig } from '@/lib/config-service';
import { comparePreferredEventCandidates } from '@/lib/event-defaults';
import { type EventMetaRow } from '@/lib/event-meta';
import { normalizeLeague, normalizeLeagueBucket } from '@/lib/player-snapshot';

export const ALL_EVENT_OPTION = '全部';

export type EventOptionBundle = {
  display: string;
  selectionAliases: string[];
  matchAliases: string[];
  latestTimestampMs: number;
  totalGames: number;
};

const OTHER_REGION_ID = 'OTHER';
const WORLDS_REGION_ID = 'WORLDS';
const CORE_BUCKETS = new Set(['LPL', 'LCK', WORLDS_REGION_ID]);
const LEAF_LEAGUES = ['LPL', 'LCK', 'LEC', 'LCP', 'LCS', 'CBLOL', 'LJL', 'VCS', 'PCS', 'LTA', 'LLA', 'TCL'];
const WORLD_KEYWORDS = ['WORLDS', 'WORLD', 'MSI', '全球', '世界赛', '国际赛事', '先锋赛'];
const STOPWORDS = new Set([
  'season',
  'tournament',
  'unknown',
  'vs',
  'versus',
  'stage',
  'group',
  'regular',
  'playoffs',
  'playoff',
  'playin',
  'play-in',
  'swiss',
  '赛季',
  '赛事',
  '未知',
  '阶段',
]);

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function includesKeyword(text: string, keyword: string) {
  return text.toUpperCase().includes(keyword.toUpperCase()) || text.includes(keyword);
}

function normalizeTournamentAliasKey(value: unknown) {
  let text = normalizeText(value);
  const replacements: Array<[RegExp, string]> = [
    [/(第\s*1\s*赛段|第一赛段|split\s*1|spring)/gi, ' split1 '],
    [/(第\s*2\s*赛段|第二赛段|split\s*2|summer)/gi, ' split2 '],
    [/(第\s*3\s*赛段|第三赛段|split\s*3|winter)/gi, ' split3 '],
    [/(第\s*4\s*赛段|第四赛段|split\s*4)/gi, ' split4 '],
    [/(cup|杯赛|杯)/gi, ' cup '],
    [/(versus|对决)/gi, ' versus '],
    [/(lock[\s-]*in|开幕赛)/gi, ' lockin '],
    [/(regular\s*season|常规赛)/gi, ' regular '],
    [/(playoffs?|季后赛|淘汰赛)/gi, ' playoffs '],
    [/(play[\s-]*in|入围赛)/gi, ' playin '],
    [/(swiss\s*stage|swiss|瑞士轮)/gi, ' swiss '],
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
    .filter((token) => !/^20\d{2}$/.test(token))
    .map((token) => {
      if (token === 'playoff') return 'playoffs';
      if (token === 'play-in') return 'playin';
      return token;
    })
    .filter((token) => !STOPWORDS.has(token))
    .sort()
    .join(' ');
}

function resolveLeafLeagueKey(league: unknown, tournamentName: unknown, stage?: unknown) {
  const normalizedLeague = normalizeLeague(league || '');
  if (normalizedLeague && normalizedLeague !== OTHER_REGION_ID) return normalizedLeague;

  const text = `${normalizeText(tournamentName)} ${normalizeText(stage)}`.trim();
  const upperText = text.toUpperCase();

  if (WORLD_KEYWORDS.some((keyword) => includesKeyword(text, keyword))) {
    return WORLDS_REGION_ID;
  }

  const inferredFromContains = LEAF_LEAGUES.find((item) => upperText.includes(item));
  if (inferredFromContains) return inferredFromContains;

  const match = text.match(/^([A-Za-z]{2,10})\s*(20\d{2})?\b/i);
  if (!match) return normalizedLeague || OTHER_REGION_ID;

  const inferred = normalizeLeague(match[1]);
  return inferred || normalizedLeague || OTHER_REGION_ID;
}

function splitAppliesToRegion(split: SplitConfig, targetRegion: string) {
  const regions = (split.regions || []).map((value) => normalizeText(value)).filter(Boolean);
  if (regions.length === 0) return true;
  return regions.some((value) => normalizeLeagueBucket(value, value) === targetRegion);
}

function buildCombinedText(value: { id?: string; name?: string; mapping?: string }) {
  return `${normalizeText(value.id)} ${normalizeText(value.name)} ${normalizeText(value.mapping)}`.trim();
}

function detectExplicitLeafLeague(value: { id?: string; name?: string; mapping?: string }) {
  const text = buildCombinedText(value);
  if (WORLD_KEYWORDS.some((keyword) => includesKeyword(text, keyword))) {
    return WORLDS_REGION_ID;
  }

  const upper = text.toUpperCase();
  return LEAF_LEAGUES.find((league) => upper.includes(league)) || '';
}

function detectStageOrdinal(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('split 1') || lower.includes('split1') || text.includes('第一赛段') || lower.includes('spring')) return 1;
  if (lower.includes('split 2') || lower.includes('split2') || text.includes('第二赛段') || lower.includes('summer')) return 2;
  if (lower.includes('split 3') || lower.includes('split3') || text.includes('第三赛段') || lower.includes('winter')) return 3;
  if (lower.includes('split 4') || lower.includes('split4') || text.includes('第四赛段')) return 4;
  return null;
}

function detectTags(text: string) {
  const lower = text.toLowerCase();
  return {
    stageOrdinal: detectStageOrdinal(text),
    isCup: lower.includes('cup') || text.includes('杯'),
    isPlayoff: lower.includes('playoff') || text.includes('季后赛') || text.includes('淘汰赛'),
    isRegular: lower.includes('regular') || text.includes('常规赛'),
    isVersus: lower.includes('versus') || text.includes('对决'),
    isLockIn: lower.includes('lock-in') || lower.includes('lock in') || lower.includes('lockin') || text.includes('开幕赛'),
    isWorld: WORLD_KEYWORDS.some((keyword) => includesKeyword(text, keyword)),
  };
}

function detectNamedSeason(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('spring') || text.includes('春季赛')) return 'spring';
  if (lower.includes('summer') || text.includes('夏季赛')) return 'summer';
  if (lower.includes('winter') || text.includes('冬季赛')) return 'winter';
  return '';
}

function countSharedTokens(left: string, right: string) {
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = right.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const token of rightTokens) {
    if (leftTokens.has(token)) count += 1;
  }
  return count;
}

function shouldCollapseLegacyRows(targetRegion: string) {
  return targetRegion === 'LPL' || targetRegion === OTHER_REGION_ID;
}

function findFallbackSplitOne(splits: SplitConfig[]) {
  return (
    splits.find((split) => {
      const tags = detectTags(buildCombinedText(split));
      return !detectExplicitLeafLeague(split) && tags.stageOrdinal === 1;
    }) || null
  );
}

function buildSplitMatchScore(split: SplitConfig, row: EventMetaRow, targetRegion: string) {
  if (!splitAppliesToRegion(split, targetRegion)) return Number.NEGATIVE_INFINITY;

  const splitText = buildCombinedText(split);
  const rowText = `${normalizeText(row.tournamentName)} ${normalizeText(row.stage)}`.trim();
  const splitAliasKey = normalizeTournamentAliasKey(splitText);
  const rowAliasKey = normalizeTournamentAliasKey(rowText);
  const splitTags = detectTags(splitText);
  const rowTags = detectTags(rowText);
  const splitLeafLeague = detectExplicitLeafLeague(split);
  const rowLeafLeague = resolveLeafLeagueKey(row.league, row.tournamentName, row.stage);
  const splitNamedSeason = detectNamedSeason(splitText);
  const rowNamedSeason = detectNamedSeason(rowText);
  const sharedTokenCount = countSharedTokens(splitAliasKey, rowAliasKey);
  const splitHasSpecificShape =
    splitTags.stageOrdinal !== null ||
    splitTags.isCup ||
    splitTags.isPlayoff ||
    splitTags.isRegular ||
    splitTags.isVersus ||
    splitTags.isLockIn ||
    splitTags.isWorld;

  if (splitLeafLeague && rowLeafLeague !== splitLeafLeague) return Number.NEGATIVE_INFINITY;
  if (splitLeafLeague === WORLDS_REGION_ID && !rowTags.isWorld) return Number.NEGATIVE_INFINITY;
  if (splitNamedSeason && rowNamedSeason && splitNamedSeason !== rowNamedSeason) return Number.NEGATIVE_INFINITY;
  if (splitLeafLeague && splitNamedSeason && !rowNamedSeason) return Number.NEGATIVE_INFINITY;

  if (splitLeafLeague) {
    if (splitTags.stageOrdinal !== null && rowTags.stageOrdinal !== splitTags.stageOrdinal) return Number.NEGATIVE_INFINITY;
    if (splitTags.isCup && !(rowTags.isCup || rowTags.isWorld)) return Number.NEGATIVE_INFINITY;
    if (splitTags.isPlayoff && !rowTags.isPlayoff) return Number.NEGATIVE_INFINITY;
    if (splitTags.isRegular && !rowTags.isRegular) return Number.NEGATIVE_INFINITY;
    if (splitTags.isVersus && !rowTags.isVersus) return Number.NEGATIVE_INFINITY;
    if (splitTags.isLockIn && !rowTags.isLockIn) return Number.NEGATIVE_INFINITY;
    if (!splitHasSpecificShape && sharedTokenCount < 2) return Number.NEGATIVE_INFINITY;
  } else {
    if (split.type === 'cup' && !(rowTags.isCup || rowTags.isWorld)) return Number.NEGATIVE_INFINITY;
    if (split.type === 'playoff' && !rowTags.isPlayoff) return Number.NEGATIVE_INFINITY;
    if (split.type === 'league' && (rowTags.isCup || rowTags.isPlayoff || (targetRegion !== WORLDS_REGION_ID && rowTags.isWorld))) {
      return Number.NEGATIVE_INFINITY;
    }
    if (splitTags.stageOrdinal !== null && rowTags.stageOrdinal !== splitTags.stageOrdinal) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  let score = 0;
  if (splitLeafLeague) score += 80;
  if (splitTags.stageOrdinal !== null && rowTags.stageOrdinal === splitTags.stageOrdinal) score += 60;
  if (splitTags.isRegular && rowTags.isRegular) score += 40;
  if (splitTags.isVersus && rowTags.isVersus) score += 40;
  if (splitTags.isLockIn && rowTags.isLockIn) score += 40;
  if (splitTags.isCup && (rowTags.isCup || rowTags.isWorld)) score += 40;
  if (splitTags.isPlayoff && rowTags.isPlayoff) score += 40;
  if (splitLeafLeague === WORLDS_REGION_ID && rowTags.isWorld) score += 60;
  if (sharedTokenCount > 0) score += sharedTokenCount * 12;

  return score > 0 ? score : Number.NEGATIVE_INFINITY;
}

function scoreTournamentLabel(value: string) {
  const text = normalizeText(value);
  if (!text) return 0;
  let score = 0;
  if (/^[A-Za-z]+\s+20\d{2}\b/.test(text)) score += 20;
  if (/\b20\d{2}\b/.test(text)) score += 8;
  if (/\b(split|cup|versus)\b/i.test(text)) score += 6;
  if (/\b(playoffs?|regular|group|stage|swiss|play[- ]?in)\b/i.test(text)) score -= 4;
  if (/\b(split|cup|versus)\b.*\b20\d{2}\b/i.test(text)) score -= 2;
  score -= Math.max(0, text.length - 36) * 0.05;
  return score;
}

function pickRawDisplayName(entries: EventMetaRow[], league: string, seasonYear: string) {
  const byName = new Map<string, number>();
  for (const entry of entries) {
    const key = normalizeText(entry.tournamentName);
    if (!key) continue;
    byName.set(key, (byName.get(key) || 0) + Number(entry.games || 0));
  }

  const aliasesWithGames = Array.from(byName.entries());
  if (aliasesWithGames.length === 0) return '';

  const sortByScore = (left: [string, number], right: [string, number]) => {
    const rightScore = scoreTournamentLabel(right[0]) + right[1] * 0.05;
    const leftScore = scoreTournamentLabel(left[0]) + left[1] * 0.05;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left[0].localeCompare(right[0]);
  };

  if (league === 'LEC') {
    const versus = aliasesWithGames.filter(([name]) => /\bversus\b/i.test(name));
    if (versus.length > 0) return [league, seasonYear, 'Versus'].filter(Boolean).join(' ').trim();
  }

  return aliasesWithGames.slice().sort(sortByScore)[0][0];
}

function buildRawFallbackBundles(rows: EventMetaRow[]) {
  const grouped = new Map<string, EventMetaRow[]>();

  for (const row of rows) {
    const leagueKey = resolveLeafLeagueKey(row.league, row.tournamentName, row.stage);
    const bucket = normalizeLeagueBucket(leagueKey, row.tournamentName);
    const aliasKey = CORE_BUCKETS.has(bucket)
      ? `${leagueKey}::${normalizeTournamentAliasKey(`${row.tournamentName} ${row.stage || ''}`)}`
      : `${leagueKey}::${normalizeText(row.seasonYear)}`;

    const list = grouped.get(aliasKey) || [];
    list.push(row);
    grouped.set(aliasKey, list);
  }

  return Array.from(grouped.values())
    .map((entries) => {
      const leagueKey = resolveLeafLeagueKey(entries[0]?.league, entries[0]?.tournamentName, entries[0]?.stage);
      const aliases = Array.from(new Set(entries.map((item) => normalizeText(item.tournamentName)).filter(Boolean)));
      return {
        display: pickRawDisplayName(entries, leagueKey, normalizeText(entries[0]?.seasonYear)),
        selectionAliases: aliases,
        matchAliases: aliases,
        latestTimestampMs: Math.max(...entries.map((item) => Number(item.syncedAtMs || 0)), 0),
        totalGames: entries.reduce((sum, item) => sum + Number(item.games || 0), 0),
      };
    })
    .filter((item) => item.display.length > 0);
}

export function buildConfiguredEventBundles(rows: EventMetaRow[], splits: SplitConfig[], targetRegion: string): EventOptionBundle[] {
  const applicableSplits = splits.filter((split) => splitAppliesToRegion(split, targetRegion));
  const matchedBySplit = new Map<string, { split: SplitConfig; rows: EventMetaRow[] }>();
  const unmatchedRows: EventMetaRow[] = [];

  for (const row of rows) {
    let bestSplit: SplitConfig | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const split of applicableSplits) {
      const score = buildSplitMatchScore(split, row, targetRegion);
      if (score > bestScore) {
        bestScore = score;
        bestSplit = split;
      }
    }

    if (bestSplit && bestScore > 0) {
      const bucket = matchedBySplit.get(bestSplit.id) || { split: bestSplit, rows: [] };
      bucket.rows.push(row);
      matchedBySplit.set(bestSplit.id, bucket);
      continue;
    }

    unmatchedRows.push(row);
  }

  if (unmatchedRows.length > 0 && shouldCollapseLegacyRows(targetRegion)) {
    const fallbackSplit = findFallbackSplitOne(applicableSplits);
    if (fallbackSplit) {
      const bucket = matchedBySplit.get(fallbackSplit.id) || { split: fallbackSplit, rows: [] };
      bucket.rows.push(...unmatchedRows);
      matchedBySplit.set(fallbackSplit.id, bucket);
      unmatchedRows.length = 0;
    }
  }

  const mappedBundles = applicableSplits.map((split) => {
    const matchedRows = matchedBySplit.get(split.id)?.rows || [];
    return {
      display: normalizeText(split.name) || normalizeText(split.id),
      selectionAliases: Array.from(
        new Set([split.id, split.name, split.mapping].map((value) => normalizeText(value)).filter(Boolean)),
      ),
      matchAliases: Array.from(new Set(matchedRows.map((row) => normalizeText(row.tournamentName)).filter(Boolean))),
      latestTimestampMs: Math.max(...matchedRows.map((row) => Number(row.syncedAtMs || 0)), 0),
      totalGames: matchedRows.reduce((sum, row) => sum + Number(row.games || 0), 0),
    };
  });

  const rawBundles = buildRawFallbackBundles(unmatchedRows);
  const mappedWithData = mappedBundles
    .filter((bundle) => bundle.totalGames > 0)
    .sort((left, right) =>
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
  const mappedWithoutData = mappedBundles.filter((bundle) => bundle.totalGames <= 0);

  return [...mappedWithData, ...mappedWithoutData, ...rawBundles];
}
