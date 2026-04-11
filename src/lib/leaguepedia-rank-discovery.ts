const LEAGUEPEDIA_ENDPOINT = 'https://lol.fandom.com/api.php';
const DIRECTORY_PAGE_SIZE = 500;
const DIRECTORY_CACHE_TTL_MS = 60 * 60 * 1000;
const LEAGUEPEDIA_FETCH_TIMEOUT_MS = 10000;

const PLATFORM_MAP: Record<string, { platform: string; regionGroup: string }> = {
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

const SUPPORTED_PLATFORM_LABELS = new Set(Object.keys(PLATFORM_MAP));

const DISCOVERY_ALIAS_MAP: Record<string, string[]> = {
  bdd: ['Bdd'],
  clozer: ['Clozer'],
  deokdam: ['Deokdam'],
  gideon: ['Gideon'],
  knight: ['Knight'],
  vicla: ['VicLa'],
  xiaohu: ['Xiaohu'],
  xun: ['Xun'],
  jiejie: ['Jiejie'],
  junjia: ['JunJia'],
  missing: ['MISSING'],
  on: ['ON'],
  teddy: ['Teddy'],
  zdz: ['ZDZ'],
  ycx: ['YCX'],
  jwei: ['JWEI'],
  dudu: ['DuDu'],
};

type LeaguepediaDirectoryRow = {
  id: string;
  overviewPage: string;
  soloqueueIds: string;
};

let directoryCache:
  | {
      expiresAt: number;
      rows: LeaguepediaDirectoryRow[];
    }
  | null = null;

export type LeaguepediaRankAccount = {
  sourceUrl: string;
  platformLabel: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string;
  note: string;
};

function escapeCargoValue(value: string) {
  return String(value || '').replace(/'/g, "\\'");
}

function normalizePlatform(platform: string) {
  return PLATFORM_MAP[platform.toUpperCase()] || null;
}

function normalizeLookup(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
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

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function sanitizeSoloqueueIds(rawValue: string) {
  return decodeHtmlEntities(String(rawValue || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/'''/g, '')
    .replace(/\[\[|\]\]/g, '')
    .replace(/\{\{|\}\}/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function splitEmbeddedPlatformSegments(line: string) {
  const marker = /\b(KR|EUW|EUNE|NA|BR|LAN|LAS|JP|OCE|TR|RU|PH|SG|TH|TW|VN|CN)\s*:/gi;
  const matches = Array.from(line.matchAll(marker));
  if (matches.length <= 1) {
    return [line];
  }

  const segments: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? line.length : line.length;
    const segment = line.slice(start, end).trim();
    if (segment) segments.push(segment);
  }

  return segments.length > 0 ? segments : [line];
}

function isPlausibleLeaguepediaAccount(gameName: string, tagLine: string) {
  const normalizedGameName = String(gameName || '').trim();
  const normalizedTagLine = String(tagLine || '').trim();
  if (!normalizedGameName || !normalizedTagLine) return false;
  if (normalizedGameName.length > 24 || normalizedTagLine.length > 12) return false;
  if (/[<>{}\[\]]/g.test(normalizedGameName)) return false;
  if (normalizedGameName.includes("'''") || normalizedGameName.includes('<br')) return false;
  if ((normalizedGameName.match(/#/g) || []).length > 0) return false;
  if (/(^|\s)(KR|CN|EUW|EUNE|NA|BR|LAN|LAS|JP|OCE|TR|RU|PH|SG|TH|TW|VN)\s*:/i.test(normalizedGameName)) return false;
  return true;
}

function parseSoloqueueIds(rawValue: string, sourceUrl: string) {
  const accounts: LeaguepediaRankAccount[] = [];
  const seen = new Set<string>();
  const lines = sanitizeSoloqueueIds(rawValue)
    .split(/\n+/)
    .flatMap((item) => splitEmbeddedPlatformSegments(item.trim()))
    .map((item) => item.trim())
    .filter(Boolean);

  let currentPlatformLabel = '';

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const platformLead = line.match(/^(KR|EUW|EUNE|NA|BR|LAN|LAS|JP|OCE|TR|RU|PH|SG|TH|TW|VN|CN)\s*:\s*(.*)$/i);
    let candidateText = line;

    if (platformLead) {
      currentPlatformLabel = platformLead[1].toUpperCase();
      candidateText = platformLead[2].trim();
    }

    if (!candidateText) continue;

    const platformLabel = currentPlatformLabel || 'KR';
    if (!SUPPORTED_PLATFORM_LABELS.has(platformLabel)) continue;

    const mapped = normalizePlatform(platformLabel);
    if (!mapped) continue;

    const accountPattern = /([^#,\n]+?)#([^\s#,\n]+)/g;
    for (const match of candidateText.matchAll(accountPattern)) {
      const gameName = String(match[1] || '').trim().replace(/\s+/g, ' ');
      const tagLine = String(match[2] || '').trim();
      if (!isPlausibleLeaguepediaAccount(gameName, tagLine)) continue;

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
        note: `Leaguepedia 自动发现：${platformLabel} / ${gameName}#${tagLine}`,
      });
    }
  }

  return accounts;
}

async function fetchLeaguepediaDirectoryPage(offset: number) {
  const params = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: 'Players=P',
    fields: 'P.ID=ID, P.OverviewPage=OverviewPage, P.SoloqueueIds=SoloqueueIds',
    where: 'P.SoloqueueIds IS NOT NULL',
    limit: String(DIRECTORY_PAGE_SIZE),
    offset: String(offset),
  });

  const response = await fetch(`${LEAGUEPEDIA_ENDPOINT}?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(LEAGUEPEDIA_FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Leaguepedia directory request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    cargoquery?: Array<{ title?: { ID?: string; OverviewPage?: string; SoloqueueIds?: string } }>;
  };

  return (Array.isArray(payload.cargoquery) ? payload.cargoquery : []).map((row) => ({
    id: String(row.title?.ID || '').trim(),
    overviewPage: String(row.title?.OverviewPage || '').trim(),
    soloqueueIds: String(row.title?.SoloqueueIds || '').trim(),
  }));
}

async function getLeaguepediaDirectory() {
  if (directoryCache && directoryCache.expiresAt > Date.now()) {
    return directoryCache.rows;
  }

  const rows: LeaguepediaDirectoryRow[] = [];
  for (let page = 0; page < 6; page += 1) {
    const offset = page * DIRECTORY_PAGE_SIZE;
    const batch = await fetchLeaguepediaDirectoryPage(offset);
    rows.push(...batch);
    if (batch.length < DIRECTORY_PAGE_SIZE) {
      break;
    }
  }

  directoryCache = {
    expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
    rows,
  };

  return rows;
}

function scoreDirectoryRow(playerName: string, row: LeaguepediaDirectoryRow) {
  const target = normalizeLookup(playerName);
  const idValue = normalizeLookup(row.id);
  const overviewValue = normalizeLookup(row.overviewPage);

  if (!target) return -1;
  if (idValue === target) return 100;
  if (overviewValue === target) return 95;
  if (idValue.startsWith(target) || target.startsWith(idValue)) return 60;
  if (overviewValue.startsWith(target) || target.startsWith(overviewValue)) return 56;
  if (idValue.includes(target) || target.includes(idValue)) return 40;
  if (overviewValue.includes(target) || target.includes(overviewValue)) return 36;
  return -1;
}

function pickDirectoryCandidates(playerName: string, rows: LeaguepediaDirectoryRow[]) {
  return rows
    .map((row) => ({ row, score: scoreDirectoryRow(playerName, row) }))
    .filter((item) => item.score >= 90)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((item) => item.row);
}

async function fetchLeaguepediaPlayerById(playerName: string) {
  const mergedRows: LeaguepediaDirectoryRow[] = [];
  const seen = new Set<string>();

  for (const candidate of buildDiscoveryNameCandidates(playerName)) {
    const params = new URLSearchParams({
      action: 'cargoquery',
      format: 'json',
      tables: 'Players=P',
      fields: 'P.ID=ID, P.OverviewPage=OverviewPage, P.SoloqueueIds=SoloqueueIds',
      where: `P.ID='${escapeCargoValue(candidate)}' OR P.OverviewPage='${escapeCargoValue(candidate)}'`,
      limit: '5',
    });

    const response = await fetch(`${LEAGUEPEDIA_ENDPOINT}?${params.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(LEAGUEPEDIA_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Leaguepedia request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      cargoquery?: Array<{ title?: { ID?: string; OverviewPage?: string; SoloqueueIds?: string } }>;
    };

    for (const row of Array.isArray(payload.cargoquery) ? payload.cargoquery : []) {
      const mapped = {
        id: String(row.title?.ID || '').trim(),
        overviewPage: String(row.title?.OverviewPage || '').trim(),
        soloqueueIds: String(row.title?.SoloqueueIds || '').trim(),
      };
      const key = `${mapped.id}::${mapped.overviewPage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mergedRows.push(mapped);
    }
  }

  return mergedRows;
}

export async function discoverLeaguepediaRankAccounts(playerName: string) {
  const directory = await getLeaguepediaDirectory().catch(() => [] as LeaguepediaDirectoryRow[]);
  const candidateRows = directory.length > 0 ? pickDirectoryCandidates(playerName, directory) : [];
  const rows = candidateRows.length > 0 ? candidateRows : await fetchLeaguepediaPlayerById(playerName);

  if (rows.length === 0) {
    return {
      success: false as const,
      source: 'LEAGUEPEDIA' as const,
      sourceUrl: null,
      accounts: [] as LeaguepediaRankAccount[],
      error: 'No Leaguepedia player entry found',
    };
  }

  for (const row of rows) {
    const sourcePage = row.overviewPage || row.id || playerName;
    const sourceUrl = `https://lol.fandom.com/wiki/${encodeURIComponent(sourcePage.replace(/ /g, '_'))}`;
    const accounts = parseSoloqueueIds(row.soloqueueIds, sourceUrl);
    if (accounts.length > 0) {
      return {
        success: true as const,
        source: 'LEAGUEPEDIA' as const,
        sourceUrl,
        accounts,
        error: null,
      };
    }
  }

  return {
    success: false as const,
    source: 'LEAGUEPEDIA' as const,
    sourceUrl: null,
    accounts: [] as LeaguepediaRankAccount[],
    error: 'No Leaguepedia Soloqueue IDs with Riot tag found',
  };
}
