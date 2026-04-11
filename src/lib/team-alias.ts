function normalizeAliasKey(value?: string | null): string {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase();
}

const TEAM_ALIAS_BY_KEY: Record<string, string> = {
    drx: 'KRX',
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
    hle: 'Hanwha Life Esports',
    hanwhalifeesports: 'Hanwha Life Esports',
};

export function resolveTeamAlias(value?: string | null): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return TEAM_ALIAS_BY_KEY[normalizeAliasKey(trimmed)] || trimmed;
}

export function normalizeTeamLookupKey(value?: string | null): string {
    return normalizeAliasKey(resolveTeamAlias(value));
}

export function getTeamAliasCandidates(value?: string | null): string[] {
    const trimmed = String(value || '').trim();
    if (!trimmed) return [];
    const canonical = resolveTeamAlias(trimmed);
    return [...new Set([trimmed, canonical].filter(Boolean))];
}

