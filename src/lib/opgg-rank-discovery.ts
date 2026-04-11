const OPGG_PRO_GAMER_URL = 'https://op.gg/lol/spectate/list/pro-gamer?region=kr';
const OPGG_CACHE_TTL_MS = 60 * 60 * 1000;
const OPGG_FETCH_TIMEOUT_MS = 8000;

const OPGG_PLATFORM_MAP: Record<string, { platform: string; regionGroup: string }> = {
  KR: { platform: 'KR', regionGroup: 'ASIA' },
  JP: { platform: 'JP1', regionGroup: 'ASIA' },
  NA: { platform: 'NA1', regionGroup: 'AMERICAS' },
  LAN: { platform: 'LA1', regionGroup: 'AMERICAS' },
  LAS: { platform: 'LA2', regionGroup: 'AMERICAS' },
  BR: { platform: 'BR1', regionGroup: 'AMERICAS' },
  EUW: { platform: 'EUW1', regionGroup: 'EUROPE' },
  EUNE: { platform: 'EUN1', regionGroup: 'EUROPE' },
  TR: { platform: 'TR1', regionGroup: 'EUROPE' },
  RU: { platform: 'RU', regionGroup: 'EUROPE' },
  OCE: { platform: 'OC1', regionGroup: 'SEA' },
  PH: { platform: 'PH2', regionGroup: 'SEA' },
  SG: { platform: 'SG2', regionGroup: 'SEA' },
  TH: { platform: 'TH2', regionGroup: 'SEA' },
  TW: { platform: 'TW2', regionGroup: 'SEA' },
  VN: { platform: 'VN2', regionGroup: 'SEA' },
};

const DISCOVERY_ALIAS_MAP: Record<string, string[]> = {
  bdd: ['Bdd'],
  care: ['Care'],
  clozer: ['Clozer'],
  deokdam: ['Deokdam'],
  gideon: ['Gideon'],
  karis: ['Karis'],
  knight: ['Knight'],
  monki: ['Monki'],
  vicla: ['VicLa'],
  xiaohu: ['Xiaohu'],
  xun: ['Xun'],
  jiejie: ['Jiejie'],
  junjia: ['JunJia'],
  missing: ['MISSING'],
  on: ['ON'],
  teddy: ['Teddy'],
  zdz: ['ZDZ'],
  zhuo: ['Zhuo'],
  ycx: ['YCX'],
  jwei: ['JWEI'],
  dudu: ['DuDu'],
};

export type DiscoveredOpggRankAccount = {
  sourceUrl: string;
  platformLabel: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string;
  note: string;
};

let cache:
  | {
      expiresAt: number;
      lines: string[];
    }
  | null = null;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|br|h1|h2|h3|h4|h5|h6|tr|td)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim(),
  );
}

function buildDiscoveryNameCandidates(playerName: string) {
  const trimmed = String(playerName || '').trim();
  const compact = trimmed.replace(/\s+/g, '');
  const normalizedKey = compact.toLowerCase();
  const titleCase = compact ? compact.charAt(0).toUpperCase() + compact.slice(1).toLowerCase() : '';
  const aliasCandidates = DISCOVERY_ALIAS_MAP[normalizedKey] || [];
  const strippedPrefixCandidates = [] as string[];
  const prefixedTitleCase = compact.match(/^([A-Z]{2,5})([A-Z][A-Za-z0-9]{1,24})$/);
  if (prefixedTitleCase?.[2]) {
    strippedPrefixCandidates.push(prefixedTitleCase[2]);
  }
  const prefixedUpper = compact.match(/^([A-Z]{2,5})([A-Z0-9]{2,24})$/);
  if (prefixedUpper?.[2] && prefixedUpper[2] !== compact) {
    strippedPrefixCandidates.push(prefixedUpper[2]);
  }
  return Array.from(new Set([trimmed, compact, titleCase, ...strippedPrefixCandidates, ...aliasCandidates].filter(Boolean)));
}

function normalizePlatform(platformLabel: string) {
  return OPGG_PLATFORM_MAP[platformLabel.toUpperCase()] || { platform: 'KR', regionGroup: 'ASIA' };
}

function isLikelyPlaceholderAccount(gameName: string) {
  const compact = String(gameName || '').replace(/\s+/g, '').toLowerCase();
  if (!compact) return true;
  if (/^\d{6,}del$/.test(compact)) return true;
  if (/^\d{8,}$/.test(compact)) return true;
  if (compact.includes('del') && /^\d+del/.test(compact)) return true;
  return false;
}

function pushDiscoveredAccount(
  accounts: DiscoveredOpggRankAccount[],
  seen: Set<string>,
  gameName: string,
  tagLine: string,
) {
  const normalizedGameName = String(gameName || '').replace(/\s+/g, ' ').trim();
  const normalizedTagLine = String(tagLine || '').trim();
  if (!normalizedGameName || !normalizedTagLine) return;
  if (isLikelyPlaceholderAccount(normalizedGameName)) return;

  const mapped = normalizePlatform('KR');
  const key = `${mapped.platform}::${normalizedGameName.toLowerCase()}::${normalizedTagLine.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);

  accounts.push({
    sourceUrl: OPGG_PRO_GAMER_URL,
    platformLabel: 'KR',
    platform: mapped.platform,
    regionGroup: mapped.regionGroup,
    gameName: normalizedGameName,
    tagLine: normalizedTagLine,
    note: `OP.GG 自动发现：KR / ${normalizedGameName}#${normalizedTagLine}`,
  });
}

function parseAccountsFromTextBlock(block: string) {
  const accounts: DiscoveredOpggRankAccount[] = [];
  const seen = new Set<string>();
  const accountPattern = /([^\n#]{1,40}?)#([^\s#]{1,16})/gu;

  for (const match of block.matchAll(accountPattern)) {
    const gameName = String(match[1] || '')
      .replace(/\b(?:Lv|S\d+|master|grandmaster|challenger|diamond|emerald|platinum|gold|silver|bronze|iron)\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const tagLine = String(match[2] || '').trim();
    if (!gameName || !tagLine) continue;
    pushDiscoveredAccount(accounts, seen, gameName, tagLine);
  }

  return accounts;
}

async function fetchOpggLines() {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.lines;
  }

  const response = await fetch(OPGG_PRO_GAMER_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(OPGG_FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`OP.GG pro gamer request failed: ${response.status}`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  cache = {
    expiresAt: Date.now() + OPGG_CACHE_TTL_MS,
    lines,
  };

  return lines;
}

function buildSearchPatterns(playerName: string) {
  return buildDiscoveryNameCandidates(playerName).map((candidate) => candidate.toLowerCase());
}

export async function discoverProRankAccountsFromOpgg(playerName: string) {
  const lines = await fetchOpggLines();
  const patterns = buildSearchPatterns(playerName);
  const matchedIndexes = lines
    .map((line, index) => ({ line: line.toLowerCase(), index }))
    .filter(({ line }) => patterns.some((pattern) => pattern && line.includes(pattern)))
    .map(({ index }) => index);

  const accounts: DiscoveredOpggRankAccount[] = [];
  const seen = new Set<string>();

  for (const index of matchedIndexes) {
    const block = lines.slice(Math.max(0, index - 1), index + 18).join('\n');
    const parsed = parseAccountsFromTextBlock(block);
    for (const account of parsed) {
      const key = `${account.platform}::${account.gameName.toLowerCase()}::${account.tagLine.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      accounts.push(account);
    }
  }

  return {
    success: accounts.length > 0,
    source: 'OPGG' as const,
    sourceUrl: OPGG_PRO_GAMER_URL,
    accounts,
    error: accounts.length > 0 ? null : 'No OP.GG pro accounts found',
  };
}
