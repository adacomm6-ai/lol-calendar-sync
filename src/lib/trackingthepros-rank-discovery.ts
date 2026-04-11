const TRACKING_THE_PROS_BASE_URL = 'https://www.trackingthepros.com';
const TRACKING_THE_PROS_FETCH_TIMEOUT_MS = 10000;

const TRACKING_PLATFORM_MAP: Record<string, { platform: string; regionGroup: string }> = {
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

const TRACKING_ACCOUNT_PATTERN = /\[(KR|EUW|EUNE|NA|BR|LAN|LAS|JP|OCE|TR|RU|PH|SG|TH|TW|VN)\]\s+(.+?)#([^\s|#]+)\s+\|/giu;

const DISCOVERY_ALIAS_MAP: Record<string, string[]> = {
  bdd: ['Bdd'],
  care: ['Care'],
  clozer: ['Clozer'],
  deokdam: ['Deokdam'],
  gideon: ['Gideon'],
  karis: ['Karis'],
  knight: ['Knight'],
  missing: ['MISSING'],
  monki: ['Monki'],
  on: ['ON'],
  teddy: ['Teddy'],
  vicla: ['VicLa'],
  xiaohu: ['Xiaohu'],
  xun: ['Xun'],
  ycx: ['YCX'],
  jiejie: ['Jiejie'],
  junjia: ['JunJia'],
  jwei: ['JWEI'],
  zdz: ['ZDZ'],
  zhuo: ['Zhuo'],
  dudu: ['DuDu'],
};

export type DiscoveredTrackingTheProsRankAccount = {
  sourceUrl: string;
  platformLabel: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string;
  note: string;
};

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

function normalizePlayerPageCandidates(playerName: string) {
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

  return Array.from(
    new Set(
      [trimmed, compact, trimmed.toLowerCase(), trimmed.toUpperCase(), titleCase, ...strippedPrefixCandidates, ...aliasCandidates].filter(
        Boolean,
      ),
    ),
  );
}

function normalizeSection(text: string) {
  const startIndex = text.indexOf('Accounts');
  const sliced = startIndex >= 0 ? text.slice(startIndex + 'Accounts'.length) : text;
  const endCandidates = ['Solo Q', 'Reddit', 'Twitch Clips', 'Stream Video', 'Load More'];
  const endIndex = endCandidates
    .map((marker) => sliced.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return (endIndex === undefined ? sliced : sliced.slice(0, endIndex))
    .replace(/\s+/g, ' ')
    .trim();
}

function mapPlatform(platformLabel: string) {
  return TRACKING_PLATFORM_MAP[platformLabel.toUpperCase()] || { platform: platformLabel.toUpperCase(), regionGroup: 'ASIA' };
}

function isLikelyPlaceholderAccount(gameName: string) {
  const compact = String(gameName || '').replace(/\s+/g, '').toLowerCase();
  if (!compact) return true;
  if (/^\d{6,}del$/.test(compact)) return true;
  if (/^\d{8,}$/.test(compact)) return true;
  if (compact.includes('del') && /^\d+del/.test(compact)) return true;
  return false;
}

function parseAccounts(sectionText: string, sourceUrl: string) {
  const accounts: DiscoveredTrackingTheProsRankAccount[] = [];
  const seen = new Set<string>();

  for (const match of sectionText.matchAll(TRACKING_ACCOUNT_PATTERN)) {
    const platformLabel = String(match[1] || '').trim().toUpperCase();
    const gameName = String(match[2] || '').replace(/\s+/g, ' ').trim();
    const tagLine = String(match[3] || '').trim();
    if (!platformLabel || !gameName || !tagLine) continue;
    if (isLikelyPlaceholderAccount(gameName)) continue;

    const mapped = mapPlatform(platformLabel);
    const key = `${mapped.platform}::${gameName.toLowerCase()}::${tagLine.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    accounts.push({
      sourceUrl,
      platformLabel,
      platform: mapped.platform,
      regionGroup: mapped.regionGroup,
      gameName,
      tagLine,
      note: `TrackingThePros 自动发现：${platformLabel} / ${gameName}#${tagLine}`,
    });
  }

  return accounts;
}

async function fetchTrackingTheProsHtml(playerName: string) {
  for (const candidate of normalizePlayerPageCandidates(playerName)) {
    const url = `${TRACKING_THE_PROS_BASE_URL}/player/${encodeURIComponent(candidate)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(TRACKING_THE_PROS_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    }).catch(() => null);

    if (!response || !response.ok) continue;

    const html = await response.text();
    if (!html || !html.includes('Accounts')) continue;

    return { html, url };
  }

  return null;
}

async function fetchTrackingTheProsHtmlByUrl(sourceUrl: string) {
  const normalizedUrl = String(sourceUrl || '').trim();
  if (!normalizedUrl || !normalizedUrl.startsWith(TRACKING_THE_PROS_BASE_URL)) return null;

  const response = await fetch(normalizedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(TRACKING_THE_PROS_FETCH_TIMEOUT_MS),
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) return null;

  const html = await response.text();
  if (!html || !html.includes('Accounts')) return null;

  return { html, url: normalizedUrl };
}

export async function discoverProRankAccountsFromTrackingThePros(playerName: string) {
  const payload = await fetchTrackingTheProsHtml(playerName);
  if (!payload) {
    return {
      success: false as const,
      source: 'TRACKING' as const,
      sourceUrl: null,
      accounts: [] as DiscoveredTrackingTheProsRankAccount[],
      error: 'No TrackingThePros player page found',
    };
  }

  const text = stripHtml(payload.html);
  const section = normalizeSection(text);
  const accounts = parseAccounts(section, payload.url);

  return {
    success: accounts.length > 0,
    source: 'TRACKING' as const,
    sourceUrl: payload.url,
    accounts,
    error: accounts.length > 0 ? null : 'No accounts found on TrackingThePros page',
  };
}

export async function discoverProRankAccountsFromTrackingTheProsUrl(sourceUrl: string) {
  const payload = await fetchTrackingTheProsHtmlByUrl(sourceUrl);
  if (!payload) {
    return {
      success: false as const,
      source: 'TRACKING' as const,
      sourceUrl: String(sourceUrl || '').trim() || null,
      accounts: [] as DiscoveredTrackingTheProsRankAccount[],
      error: 'No TrackingThePros player page found by source URL',
    };
  }

  const text = stripHtml(payload.html);
  const section = normalizeSection(text);
  const accounts = parseAccounts(section, payload.url);

  return {
    success: accounts.length > 0,
    source: 'TRACKING' as const,
    sourceUrl: payload.url,
    accounts,
    error: accounts.length > 0 ? null : 'No accounts found on TrackingThePros page',
  };
}
