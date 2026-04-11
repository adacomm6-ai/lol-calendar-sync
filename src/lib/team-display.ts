type TeamDisplayLike = {
    name?: string | null;
    shortName?: string | null;
};

const TEAM_SHORT_ALIASES: Record<string, string> = {
    'bilibili gaming': 'BLG',
    'weibo gaming': 'WBG',
    'top esports': 'TES',
    'jd gaming': 'JDG',
    'invictus gaming': 'IG',
    "anyone's legend": 'AL',
    'edward gaming': 'EDG',
    'lng esports': 'LNG',
    'oh my god': 'OMG',
    'ninjas in pyjamas': 'NIP',
    'ultra prime': 'UP',
    'royal never give up': 'RNG',
    'funplus phoenix': 'FPX',
    'thundertalk gaming': 'TT',
    'thunder talk gaming': 'TT',
    'rare atom': 'RA',
    'team we': 'WE',
    'lgd gaming': 'LGD',
    'hanwha life esports': 'HLE',
    'kt rolster': 'KT',
    'dplus kia': 'DK',
    'bnk fearx': 'BFX',
    'nongshim redforce': 'NS',
    'dn freecs': 'DNF',
    'drx': 'DRX',
    't1': 'T1',
    'gen.g': 'GEN',
    'gen.g esports': 'GEN',
    'oksavingsbank brion': 'BRO',
    'team vitality': 'VIT',
    'karmine corp': 'KC',
    'movistar koi': 'MKOI',
    'g2 esports': 'G2',
    'fnatic': 'FNC',
    giantx: 'GX',
    sk: 'SK',
    'sk gaming': 'SK',
    shifters: 'SHFT',
    shft: 'SHFT',
    'team heretics': 'TH',
    'shopify rebellion': 'SR',
    lyon: 'LYON',
    loud: 'LOUD',
    'team secret whales': 'TSW',
    'deep cross gaming': 'DCG',
    'cloud9': 'C9',
    'furia': 'FUR',
    'pain gaming': 'PNG',
    'red canids': 'RED',
    'gam esports': 'GAM',
    'chiefs esports club': 'CHF',
};

const NORMALIZED_SHORT_NAME_ALIASES: Record<string, string> = {
    tv: 'VIT',
    vit: 'VIT',
    mkoi: 'MKOI',
    kc: 'KC',
    hle: 'HLE',
};

function normalizeTeamDisplayText(value?: string | null) {
    return String(value || '')
        .replace(/\u2060/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isUsableShortName(value: string) {
    return /^[A-Za-z0-9.\-]{2,8}$/.test(value);
}

function buildFallbackShortName(name: string) {
    const words = name
        .replace(/[()]/g, ' ')
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (words.length <= 1) {
        return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'UNK';
    }

    return words
        .map((part) => part.replace(/[^A-Za-z0-9]/g, ''))
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 6)
        .toUpperCase() || 'UNK';
}

export function getTeamShortDisplayName(team?: TeamDisplayLike | null) {
    const shortName = normalizeTeamDisplayText(team?.shortName);
    if (shortName && isUsableShortName(shortName)) {
        const normalizedShort = shortName.toLowerCase();
        return NORMALIZED_SHORT_NAME_ALIASES[normalizedShort] || shortName.toUpperCase();
    }

    const name = normalizeTeamDisplayText(team?.name);
    if (!name) return '待定';

    const normalizedName = name.toLowerCase();
    if (TEAM_SHORT_ALIASES[normalizedName]) {
        return TEAM_SHORT_ALIASES[normalizedName];
    }

    return buildFallbackShortName(name);
}
