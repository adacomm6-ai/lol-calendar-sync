function normalizeAliasKey(value?: string | null): string {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase();
}

const TEAM_ALIAS_BY_KEY: Record<string, string> = {
    drx: 'KRX',
    krx: 'KRX',
    kiwoomdrx: 'KRX',
    kiwoomdrxchallengers: 'KRX Challengers',
    gz: 'Ground Zero Gaming',
    gzg: 'Ground Zero Gaming',
    groundzerogaming: 'Ground Zero Gaming',
    gam: 'GAM Esports',
    gamesports: 'GAM Esports',
    fly: 'FlyQuest',
    flyquest: 'FlyQuest',
    dig: 'Dignitas',
    dignitas: 'Dignitas',
    shft: 'Shifters',
    shifters: 'Shifters',
    tsw: 'Team Secret Whales',
    teamsecretwhales: 'Team Secret Whales',
    sr: 'Shopify Rebellion',
    shopifyrebellion: 'Shopify Rebellion',
    rg: 'Rising Gaming',
    risinggaming: 'Rising Gaming',
    nm: 'New Meta',
    newmeta: 'New Meta',
    yyg: 'Yang Yang Gaming',
    yangyanggaming: 'Yang Yang Gaming',
    uep: 'UEC eSports PlusPlus',
    uecesportsplusplus: 'UEC eSports PlusPlus',
    rvx: 'Revolution Victory X',
    revolutionvictoryx: 'Revolution Victory X',
    ve: 'V3 Esports',
    v3esports: 'V3 Esports',
    los: 'LØS',
    løs: 'LØS',
    nhe: 'Ngựa Hí Esports',
    nguahiesports: 'Ngựa Hí Esports',
    tes: 'Top Esports',
    tope: 'Top Esports',
    topesports: 'Top Esports',
    ig: 'Invictus Gaming',
    invictus: 'Invictus Gaming',
    invictusgaming: 'Invictus Gaming',
    al: "Anyone's Legend",
    anyoneslegend: "Anyone's Legend",
    wbg: 'Weibo Gaming',
    weibogaming: 'Weibo Gaming',
    blg: 'Bilibili Gaming',
    bilibiligaming: 'Bilibili Gaming',
    nip: 'Ninjas in Pyjamas',
    ninjasinpyjamas: 'Ninjas in Pyjamas',
    lng: 'LNG Esports',
    lngesports: 'LNG Esports',
    we: 'Team WE',
    teamwe: 'Team WE',
    jdg: 'JD Gaming',
    jdgaming: 'JD Gaming',
    edg: 'EDward Gaming',
    edwardgaming: 'EDward Gaming',
    fpx: 'FunPlus Phoenix',
    funplusphoenix: 'FunPlus Phoenix',
    omg: 'Oh My God',
    ohmygod: 'Oh My God',
    up: 'Ultra Prime',
    ultraprime: 'Ultra Prime',
    tt: 'ThunderTalk Gaming',
    thundertalkgaming: 'ThunderTalk Gaming',
    lgd: 'LGD Gaming',
    lgdgaming: 'LGD Gaming',
    ra: 'Rare Atom',
    rareatom: 'Rare Atom',
    vit: 'Team Vitality',
    tv: 'Team Vitality',
    teamvitality: 'Team Vitality',
    kc: 'Karmine Corp',
    karminecorp: 'Karmine Corp',
    mkoi: 'Movistar KOI',
    movistarkoi: 'Movistar KOI',
    gx: 'GIANTX',
    giantx: 'GIANTX',
    th: 'Team Heretics',
    heretics: 'Team Heretics',
    teamheretics: 'Team Heretics',
    fnc: 'Fnatic',
    fnatic: 'Fnatic',
    g2: 'G2 Esports',
    g2esports: 'G2 Esports',
    bds: 'Team BDS',
    teambds: 'Team BDS',
    rge: 'Rogue',
    rogue: 'Rogue',
    navi: 'Natus Vincere',
    natusvincere: 'Natus Vincere',
    sk: 'SK Gaming',
    skgaming: 'SK Gaming',
    gen: 'GEN',
    geng: 'GEN',
    gengesports: 'GEN',
    genglol: 'GEN',
    kt: 'KT',
    ktrolster: 'KT',
    dk: 'DK',
    dpluskia: 'DK',
    ns: 'NS',
    nongshimredforce: 'NS',
    bro: 'BRO',
    brion: 'BRO',
    oksavingsbankbrion: 'BRO',
    hanjinbrion: 'BRO',
    oksavingsbankbrionchallengers: 'BRO Challengers',
    hanjinbrionchallengers: 'BRO Challengers',
    bfx: 'BFX',
    bnkfearx: 'BFX',
    hle: 'Hanwha Life Esports',
    hanwhalifeesports: 'Hanwha Life Esports',
    mvke: 'MVK Esports Academy',
    mvkesportsacademy: 'MVK Esports Academy',
};

function buildTeamAcronym(value?: string | null): string {
    const tokens = String(value || '')
        .trim()
        .split(/[\s/._-]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => !['team', 'esports', 'gaming', 'club'].includes(token.toLowerCase()));
    if (tokens.length <= 1) return '';
    return normalizeAliasKey(tokens.map((token) => token[0]).join(''));
}

export function resolveTeamAlias(value?: string | null): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return TEAM_ALIAS_BY_KEY[normalizeAliasKey(trimmed)] || trimmed;
}

export function normalizeTeamLookupKey(value?: string | null): string {
    return normalizeAliasKey(resolveTeamAlias(value));
}

export function normalizeTeamIdentityKey(name?: string | null, shortName?: string | null): string {
    const canonicalName = normalizeTeamLookupKey(name);
    const canonicalShort = normalizeTeamLookupKey(shortName);
    if (!canonicalName) return canonicalShort;
    if (!canonicalShort) return canonicalName;

    const acronym = buildTeamAcronym(resolveTeamAlias(name));
    if (acronym && acronym === normalizeAliasKey(shortName)) {
        return canonicalName;
    }

    return canonicalName;
}

const TEAM_FAMILY_BY_KEY: Record<string, string> = {
    kt: 'kt-family',
    ktrolsterchallengers: 'kt-family',
    krx: 'krx-family',
    krxchallengers: 'krx-family',
    mvkesports: 'mvk-family',
    mvkesportsacademy: 'mvk-family',
};

export function normalizeTeamFamilyKey(name?: string | null, shortName?: string | null): string {
    const identityKey = normalizeTeamIdentityKey(name, shortName);
    return TEAM_FAMILY_BY_KEY[identityKey] || identityKey;
}

export function getTeamAliasCandidates(value?: string | null): string[] {
    const trimmed = String(value || '').trim();
    if (!trimmed) return [];
    const canonical = resolveTeamAlias(trimmed);
    return [...new Set([trimmed, canonical].filter(Boolean))];
}

