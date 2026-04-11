import { getTeamAliasCandidates, normalizeTeamLookupKey } from './team-alias';

type TeamLike = {
    id: string;
    name?: string | null;
    shortName?: string | null;
    logo?: string | null;
    region?: string | null;
};

type MatchLike<TTeam extends TeamLike = TeamLike> = {
    teamAId?: string | null;
    teamBId?: string | null;
    winnerId?: string | null;
    teamA?: TTeam | null;
    teamB?: TTeam | null;
    games?: Array<Record<string, unknown>> | null;
    [key: string]: unknown;
};

export type CanonicalTeamIndex<TTeam extends TeamLike = TeamLike> = {
    canonicalByTeamId: Map<string, TTeam>;
    relatedIdsByCanonicalId: Map<string, string[]>;
    canonicalByLookupKey: Map<string, TTeam>;
    relatedIdsByLookupKey: Map<string, string[]>;
    canonicalTeams: TTeam[];
};

function scoreCanonicalTeam(team: TeamLike) {
    const name = String(team.name || '').trim();
    const shortName = String(team.shortName || '').trim();
    const upperShort = shortName.toUpperCase();
    const upperName = name.toUpperCase();

    let score = 0;
    if (String(team.logo || '').trim()) score += 1000;
    if (name && shortName && upperName !== upperShort) score += 200;
    if (/\s|['.-]/.test(name)) score += 40;
    score += name.length;
    score += shortName.length * 0.1;
    return score;
}

function buildGroupKey(team: TeamLike) {
    const lookup = normalizeTeamLookupKey(team.shortName || team.name || '');
    const region = String(team.region || '').trim().toUpperCase();
    if (!lookup) return `${region}::${team.id}`;
    return `${region}::${lookup}`;
}

function getLookupKeys(team: Pick<TeamLike, 'name' | 'shortName'> | string | null | undefined) {
    if (typeof team === 'string') {
        return getTeamAliasCandidates(team)
            .map((value) => normalizeTeamLookupKey(value))
            .filter(Boolean);
    }

    const values = [
        ...getTeamAliasCandidates(team?.name),
        ...getTeamAliasCandidates(team?.shortName),
    ];

    return Array.from(
        new Set(
            values
                .map((value) => normalizeTeamLookupKey(value))
                .filter(Boolean),
        ),
    );
}

function setIfBetter<TTeam extends TeamLike>(map: Map<string, TTeam>, key: string, candidate: TTeam) {
    const current = map.get(key);
    if (!current || scoreCanonicalTeam(candidate) > scoreCanonicalTeam(current)) {
        map.set(key, candidate);
    }
}

export function buildCanonicalTeamIndex<TTeam extends TeamLike>(teams: TTeam[]): CanonicalTeamIndex<TTeam> {
    const grouped = new Map<string, TTeam[]>();
    for (const team of teams) {
        const key = buildGroupKey(team);
        const list = grouped.get(key) || [];
        list.push(team);
        grouped.set(key, list);
    }

    const canonicalByTeamId = new Map<string, TTeam>();
    const relatedIdsByCanonicalId = new Map<string, string[]>();
    const canonicalByLookupKey = new Map<string, TTeam>();
    const relatedIdsByLookupKey = new Map<string, string[]>();
    const canonicalTeams: TTeam[] = [];
    const seenCanonicalIds = new Set<string>();

    for (const list of grouped.values()) {
        const canonical = [...list].sort((left, right) => {
            const scoreDiff = scoreCanonicalTeam(right) - scoreCanonicalTeam(left);
            if (scoreDiff !== 0) return scoreDiff;
            return String(left.id).localeCompare(String(right.id));
        })[0];

        const relatedIds = list.map((item) => item.id);
        relatedIdsByCanonicalId.set(canonical.id, relatedIds);
        for (const team of list) {
            canonicalByTeamId.set(team.id, canonical);
        }

        const region = String(canonical.region || '').trim().toUpperCase();
        const lookupKeys = getLookupKeys(canonical);
        for (const lookupKey of lookupKeys) {
            setIfBetter(canonicalByLookupKey, `*::${lookupKey}`, canonical);
            relatedIdsByLookupKey.set(`*::${lookupKey}`, Array.from(new Set([
                ...(relatedIdsByLookupKey.get(`*::${lookupKey}`) || []),
                ...relatedIds,
            ])));

            if (region) {
                setIfBetter(canonicalByLookupKey, `${region}::${lookupKey}`, canonical);
                relatedIdsByLookupKey.set(`${region}::${lookupKey}`, Array.from(new Set([
                    ...(relatedIdsByLookupKey.get(`${region}::${lookupKey}`) || []),
                    ...relatedIds,
                ])));
            }
        }

        if (!seenCanonicalIds.has(canonical.id)) {
            canonicalTeams.push(canonical);
            seenCanonicalIds.add(canonical.id);
        }
    }

    // A number of recovered matches only carry shell team ids (for example TES/IG/AL)
    // without the richer nested team payload. Re-map those ids through the alias-based
    // identity lookup so the schedule/team pages consistently land on the fuller team row.
    for (const team of teams) {
        const currentCanonical = canonicalByTeamId.get(team.id) || null;
        const identityCanonical = getCanonicalTeamByIdentity(team, {
            canonicalByTeamId,
            relatedIdsByCanonicalId,
            canonicalByLookupKey,
            relatedIdsByLookupKey,
            canonicalTeams,
        } as CanonicalTeamIndex<TTeam>, team.region);
        const preferredCanonical = pickPreferredCanonicalTeam(currentCanonical, identityCanonical);

        if (!preferredCanonical) continue;
        canonicalByTeamId.set(team.id, preferredCanonical);

        const relatedIds = new Set(relatedIdsByCanonicalId.get(preferredCanonical.id) || [preferredCanonical.id]);
        relatedIds.add(team.id);
        relatedIdsByCanonicalId.set(preferredCanonical.id, Array.from(relatedIds));
    }

    return {
        canonicalByTeamId,
        relatedIdsByCanonicalId,
        canonicalByLookupKey,
        relatedIdsByLookupKey,
        canonicalTeams,
    };
}

export function getCanonicalTeam<TTeam extends TeamLike>(
    teamId: string | null | undefined,
    index: CanonicalTeamIndex<TTeam>,
) {
    if (!teamId) return null;
    return index.canonicalByTeamId.get(teamId) || null;
}

export function getCanonicalTeamByIdentity<TTeam extends TeamLike>(
    team: Pick<TeamLike, 'name' | 'shortName' | 'region'> | string | null | undefined,
    index: CanonicalTeamIndex<TTeam>,
    regionHint?: string | null,
) {
    const region = String(regionHint || (typeof team === 'string' ? '' : team?.region) || '')
        .trim()
        .toUpperCase();
    const lookupKeys = getLookupKeys(team);

    let best: TTeam | null = null;
    for (const lookupKey of lookupKeys) {
        const candidates = [
            region ? index.canonicalByLookupKey.get(`${region}::${lookupKey}`) || null : null,
            index.canonicalByLookupKey.get(`*::${lookupKey}`) || null,
        ].filter(Boolean) as TTeam[];

        for (const candidate of candidates) {
            if (!best || scoreCanonicalTeam(candidate) > scoreCanonicalTeam(best)) {
                best = candidate;
            }
        }
    }

    return best;
}

export function getRelatedTeamIds(teamId: string | null | undefined, index: CanonicalTeamIndex) {
    if (!teamId) return [];
    const canonical = getCanonicalTeam(teamId, index);
    if (!canonical) return [teamId];
    return index.relatedIdsByCanonicalId.get(canonical.id) || [canonical.id];
}

export function getRelatedTeamIdsByIdentity(
    team: Pick<TeamLike, 'name' | 'shortName' | 'region'> | string | null | undefined,
    index: CanonicalTeamIndex,
    regionHint?: string | null,
) {
    const region = String(regionHint || (typeof team === 'string' ? '' : team?.region) || '')
        .trim()
        .toUpperCase();
    const lookupKeys = getLookupKeys(team);
    const relatedIds = new Set<string>();

    for (const lookupKey of lookupKeys) {
        const scoped = region ? index.relatedIdsByLookupKey.get(`${region}::${lookupKey}`) || [] : [];
        const global = index.relatedIdsByLookupKey.get(`*::${lookupKey}`) || [];
        for (const id of [...scoped, ...global]) {
            relatedIds.add(id);
        }
    }

    return Array.from(relatedIds);
}

export function pickPreferredCanonicalTeam<TTeam extends TeamLike>(
    primary: TTeam | null | undefined,
    secondary: TTeam | null | undefined,
) {
    if (!primary) return secondary || null;
    if (!secondary) return primary;
    return scoreCanonicalTeam(secondary) > scoreCanonicalTeam(primary) ? secondary : primary;
}

export function canonicalizeTeamId(teamId: string | null | undefined, index: CanonicalTeamIndex) {
    if (!teamId) return teamId || null;
    const canonical = getCanonicalTeam(teamId, index);
    return canonical?.id || teamId;
}

export function canonicalizeMatchTeams<TTeam extends TeamLike, TMatch extends MatchLike<TTeam>>(
    match: TMatch,
    index: CanonicalTeamIndex<TTeam>,
): TMatch {
    const canonicalTeamA = pickPreferredCanonicalTeam(
        getCanonicalTeam(match.teamAId || match.teamA?.id || null, index),
        getCanonicalTeamByIdentity(match.teamA || null, index, match.teamA?.region),
    );
    const canonicalTeamB = pickPreferredCanonicalTeam(
        getCanonicalTeam(match.teamBId || match.teamB?.id || null, index),
        getCanonicalTeamByIdentity(match.teamB || null, index, match.teamB?.region),
    );

    const games = Array.isArray(match.games)
        ? match.games.map((game) => ({
              ...game,
              winnerId: canonicalizeTeamId(String(game.winnerId || '') || null, index),
              blueSideTeamId: canonicalizeTeamId(String(game.blueSideTeamId || '') || null, index),
              redSideTeamId: canonicalizeTeamId(String(game.redSideTeamId || '') || null, index),
          }))
        : match.games;

    return {
        ...match,
        teamAId: canonicalTeamA?.id || match.teamAId || match.teamA?.id || null,
        teamBId: canonicalTeamB?.id || match.teamBId || match.teamB?.id || null,
        winnerId: canonicalizeTeamId(match.winnerId || null, index),
        teamA: canonicalTeamA ? ({ ...(match.teamA || {}), ...canonicalTeamA } as TTeam) : match.teamA,
        teamB: canonicalTeamB ? ({ ...(match.teamB || {}), ...canonicalTeamB } as TTeam) : match.teamB,
        games,
    };
}
