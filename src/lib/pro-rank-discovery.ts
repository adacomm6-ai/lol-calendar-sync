import { buildRankDiscoveryNameVariants } from '@/lib/rank-discovery-name-variants';

const DPM_BASE_URL = 'https://dpm.lol';
const DPM_FETCH_TIMEOUT_MS = 8000;

const DPM_PLATFORM_MAP: Record<string, { platform: string; regionGroup: string }> = {
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

const ACCOUNT_PATTERN =
  /\b(KR|EUW|EUNE|NA|BR|LAN|LAS|JP|OCE|TR|RU|PH|SG|TH|TW|VN)\b\s+(?:(?:\d+\s+(?:minutes?|hours?|days?|weeks?|months?))\s+ago\s+)?(.+?)#([^\s#]+)\s+(?:(?:[IVX]+)\s*-\s*)?(?:Unranked|\d+\s*LP)\b/giu;

const UNLABELED_ACCOUNT_PATTERN =
  /(?:(?:\d+\s+(?:minutes?|hours?|days?|weeks?|months?))\s+ago\s+)?([^#\n]+?)#([^\s#]+)\s+(?:(?:[IVX]+)\s*-\s*)?(?:Unranked|\d+\s*LP)\b/giu;

export type DiscoveredProRankAccount = {
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

function normalizeSection(text: string) {
  const startIndex = text.indexOf('SoloQ Accounts');
  const sliced = startIndex >= 0 ? text.slice(startIndex + 'SoloQ Accounts'.length) : text;
  const endCandidates = ['Last 2 Weeks', 'DPM.LOL is not endorsed', 'Team SoloQ'];
  const endIndex = endCandidates
    .map((marker) => sliced.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return (endIndex === undefined ? sliced : sliced.slice(0, endIndex))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlayerPageCandidates(playerName: string) {
  return buildRankDiscoveryNameVariants(playerName, [], {
    includeSearchAliases: false,
    includeDeepSearchAliases: false,
  });
}

function mapPlatform(platformLabel: string) {
  return DPM_PLATFORM_MAP[platformLabel.toUpperCase()] || { platform: platformLabel.toUpperCase(), regionGroup: 'ASIA' };
}

function pushDiscoveredAccount(
  accounts: DiscoveredProRankAccount[],
  seen: Set<string>,
  sourceUrl: string,
  platformLabel: string,
  gameName: string,
  tagLine: string,
  note: string,
) {
  const mapped = mapPlatform(platformLabel);
  const normalizedGameName = String(gameName || '').replace(/\s+/g, ' ').trim();
  const normalizedTag = String(tagLine || '').trim();
  if (!normalizedGameName || !normalizedTag) return;

  const key = `${mapped.platform}::${normalizedGameName.toLowerCase()}::${normalizedTag.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);

  accounts.push({
    sourceUrl,
    platformLabel,
    platform: mapped.platform,
    regionGroup: mapped.regionGroup,
    gameName: normalizedGameName,
    tagLine: normalizedTag,
    note,
  });
}

function parseAccountSection(sectionText: string, sourceUrl: string, defaultPlatformLabel = 'KR') {
  const accounts: DiscoveredProRankAccount[] = [];
  const seen = new Set<string>();

  for (const match of sectionText.matchAll(ACCOUNT_PATTERN)) {
    const platformLabel = String(match[1] || '').trim().toUpperCase();
    const gameName = String(match[2] || '').trim();
    const tagLine = String(match[3] || '').trim();
    if (!platformLabel || !gameName || !tagLine) continue;

    pushDiscoveredAccount(
      accounts,
      seen,
      sourceUrl,
      platformLabel,
      gameName,
      tagLine,
      `DPM auto-discovered: ${platformLabel} / ${gameName}#${tagLine}`,
    );
  }

  if (accounts.length > 0) {
    return accounts;
  }

  const fallbackPlatformLabel = String(defaultPlatformLabel || 'KR').trim().toUpperCase();
  for (const match of sectionText.matchAll(UNLABELED_ACCOUNT_PATTERN)) {
    const rawGameName = String(match[1] || '').trim();
    const tagLine = String(match[2] || '').trim();
    if (!rawGameName || !tagLine) continue;

    const gameName = rawGameName
      .replace(/\s+/g, ' ')
      .replace(/^(KR|EUW|EUNE|NA|BR|LAN|LAS|JP|OCE|TR|RU|PH|SG|TH|TW|VN)\s+/i, '')
      .trim();

    if (!gameName) continue;

    pushDiscoveredAccount(
      accounts,
      seen,
      sourceUrl,
      fallbackPlatformLabel,
      gameName,
      tagLine,
      `DPM auto-discovered (default ${fallbackPlatformLabel}): ${gameName}#${tagLine}`,
    );
  }

  return accounts;
}

async function fetchDpmHtml(playerName: string) {
  for (const candidate of normalizePlayerPageCandidates(playerName)) {
    const url = `${DPM_BASE_URL}/pro/${encodeURIComponent(candidate)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(DPM_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    }).catch(() => null);

    if (!response || !response.ok) continue;

    const html = await response.text();
    if (!html || !html.includes('SoloQ Accounts')) continue;

    return { html, url };
  }

  return null;
}

async function fetchDpmHtmlByUrl(sourceUrl: string) {
  const normalizedUrl = String(sourceUrl || '').trim();
  if (!normalizedUrl || !normalizedUrl.startsWith(DPM_BASE_URL)) return null;

  const response = await fetch(normalizedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(DPM_FETCH_TIMEOUT_MS),
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) return null;

  const html = await response.text();
  if (!html || !html.includes('SoloQ Accounts')) return null;

  return { html, url: normalizedUrl };
}

export async function discoverProRankAccountsFromDpm(playerName: string) {
  const payload = await fetchDpmHtml(playerName);
  if (!payload) {
    return {
      success: false as const,
      source: 'DPM',
      sourceUrl: null,
      accounts: [] as DiscoveredProRankAccount[],
      error: 'No DPM pro page found',
    };
  }

  const text = stripHtml(payload.html);
  const section = normalizeSection(text);
  const accounts = parseAccountSection(section, payload.url, 'KR');

  return {
    success: accounts.length > 0,
    source: 'DPM' as const,
    sourceUrl: payload.url,
    accounts,
    error: accounts.length > 0 ? null : 'No SoloQ accounts found on DPM page',
  };
}

export async function discoverProRankAccountsFromDpmUrl(sourceUrl: string) {
  const payload = await fetchDpmHtmlByUrl(sourceUrl);
  if (!payload) {
    return {
      success: false as const,
      source: 'DPM' as const,
      sourceUrl: String(sourceUrl || '').trim() || null,
      accounts: [] as DiscoveredProRankAccount[],
      error: 'No DPM pro page found by source URL',
    };
  }

  const text = stripHtml(payload.html);
  const section = normalizeSection(text);
  const accounts = parseAccountSection(section, payload.url, 'KR');

  return {
    success: accounts.length > 0,
    source: 'DPM' as const,
    sourceUrl: payload.url,
    accounts,
    error: accounts.length > 0 ? null : 'No SoloQ accounts found on DPM page',
  };
}
