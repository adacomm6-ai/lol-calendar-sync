const DISCOVERY_ALIAS_MAP: Record<string, string[]> = {
  bdd: ['Bdd'],
  care: ['Care'],
  clozer: ['Clozer'],
  deokdam: ['Deokdam'],
  dudu: ['DuDu'],
  gideon: ['Gideon'],
  jiejie: ['Jiejie'],
  junjia: ['JunJia'],
  jwei: ['JWEI'],
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
  zdz: ['ZDZ'],
  zhuo: ['Zhuo'],
};

const DISCOVERY_SEARCH_ALIAS_MAP: Record<string, string[]> = {
  ryan3: [
    'Ryan',
    'Ryan 3',
    'Ryan01',
    'Ryan 01',
    'TT Ryan3',
    'TTRyan3',
    'TT.Y Ryan3',
    'TTY Ryan3',
    'TTYRyan3',
    'TT Young Ryan3',
    'Chen Qi-Hong',
    'Chen Qi Hong',
    'ChenQihong',
    '陈齐宏',
  ],
};

const DISCOVERY_DEEP_SEARCH_ALIAS_MAP: Record<string, string[]> = {
  ryan3: [
    'TT Ryan',
    'TTYoung Ryan',
    'TT Young Ryan',
    'ThunderTalk Ryan3',
    'ThunderTalk Ryan',
    'Ryan TT',
    'Qi-Hong Chen',
    'Qi Hong Chen',
    'Qihong Chen',
  ],
};

function pushVariant(target: Set<string>, value?: string | null) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return;
  target.add(trimmed);
}

function buildAsciiTitleCase(value: string) {
  if (!/^[A-Za-z0-9 ]+$/.test(value)) return value;
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function stripLeadingTeamPrefix(value: string) {
  const stripped = new Set<string>();
  const prefixedTitleCase = value.match(/^([A-Z]{2,5})([A-Z][A-Za-z0-9]{1,24})$/);
  if (prefixedTitleCase?.[2]) {
    stripped.add(prefixedTitleCase[2]);
  }

  const prefixedUpper = value.match(/^([A-Z]{2,5})([A-Z0-9]{2,24})$/);
  if (prefixedUpper?.[2] && prefixedUpper[2] !== value) {
    stripped.add(prefixedUpper[2]);
  }

  return Array.from(stripped);
}

function stripTrailingDigits(value: string) {
  const compact = String(value || '').trim();
  if (!compact) return [];

  const stripped = new Set<string>();
  const nameWithDigits = compact.match(/^([\p{L}_]{2,})(\d{1,3})$/u);
  if (nameWithDigits?.[1]) {
    stripped.add(nameWithDigits[1]);
    stripped.add(`${nameWithDigits[1]} ${nameWithDigits[2]}`);
  }

  return Array.from(stripped);
}

function buildCompactVariants(value: string) {
  const compactNoSpace = value.replace(/\s+/g, '');
  const compactNoSymbol = compactNoSpace.replace(/[-_./\\]+/g, '');
  return Array.from(new Set([compactNoSpace, compactNoSymbol].filter(Boolean)));
}

export function buildRankDiscoveryNameVariants(
  playerName: string,
  extraNames?: Array<string | null | undefined>,
  options?: {
    includeSearchAliases?: boolean;
    includeDeepSearchAliases?: boolean;
  },
) {
  const variants = new Set<string>();
  const includeSearchAliases = options?.includeSearchAliases !== false;
  const includeDeepSearchAliases = options?.includeDeepSearchAliases === true;
  const rawNames = [playerName, ...(extraNames || [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const rawName of rawNames) {
    const compactVariants = buildCompactVariants(rawName);
    const normalizedKey = (compactVariants[compactVariants.length - 1] || rawName).toLowerCase();
    const aliasCandidates = DISCOVERY_ALIAS_MAP[normalizedKey] || [];
    const searchAliasCandidates = DISCOVERY_SEARCH_ALIAS_MAP[normalizedKey] || [];
    const deepSearchAliasCandidates = DISCOVERY_DEEP_SEARCH_ALIAS_MAP[normalizedKey] || [];

    pushVariant(variants, rawName);
    pushVariant(variants, rawName.toLowerCase());
    pushVariant(variants, rawName.toUpperCase());

    for (const compact of compactVariants) {
      pushVariant(variants, compact);
      pushVariant(variants, buildAsciiTitleCase(compact));

      for (const strippedPrefix of stripLeadingTeamPrefix(compact)) {
        pushVariant(variants, strippedPrefix);
        pushVariant(variants, buildAsciiTitleCase(strippedPrefix));
      }

      for (const strippedDigits of stripTrailingDigits(compact)) {
        pushVariant(variants, strippedDigits);
        pushVariant(variants, buildAsciiTitleCase(strippedDigits));
      }
    }

    for (const aliasCandidate of aliasCandidates) {
      pushVariant(variants, aliasCandidate);
    }

    if (includeSearchAliases) {
      for (const searchAliasCandidate of searchAliasCandidates) {
        pushVariant(variants, searchAliasCandidate);
      }
    }

    if (includeDeepSearchAliases) {
      for (const deepSearchAliasCandidate of deepSearchAliasCandidates) {
        pushVariant(variants, deepSearchAliasCandidate);
      }
    }
  }

  return Array.from(variants);
}
