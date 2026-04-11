import TeamsStatsTableClient from './TeamsStatsTableClient';
import TeamsFilters from './TeamsFilters';

import { getSystemConfig } from '@/lib/config-service';
import { getCachedTeams } from '@/lib/data-cache';
import { prisma } from '@/lib/db';
import { comparePreferredEventCandidates } from '@/lib/event-defaults';
import { buildEventMetaRowsFromMatches, buildEventMetaRowsFromSnapshots } from '@/lib/event-meta';
import { ALL_EVENT_OPTION, buildConfiguredEventBundles, type EventOptionBundle } from '@/lib/event-option-mapping';
import { normalizeLeague, normalizeLeagueBucket } from '@/lib/player-snapshot';

export const dynamic = 'force-dynamic';

type SortKey =
    | 'winRate'
    | 'gameWinRate'
    | 'kda'
    | 'matchCount'
    | 'bo1WinRate'
    | 'bo3WinRate'
    | 'bo5WinRate'
    | 'avgDuration'
    | 'avgTotalKills'
    | 'avgKills'
    | 'avgDeaths';

type BoFormat = 'BO1' | 'BO3' | 'BO5' | null;

type TeamAgg = {
    teamId: string;
    matchCount: number;
    matchWins: number;
    bo1MatchCount: number;
    bo1MatchWins: number;
    bo3MatchCount: number;
    bo3MatchWins: number;
    bo5MatchCount: number;
    bo5MatchWins: number;
    gameCount: number;
    gameWins: number;
    totalKills: number;
    totalDeaths: number;
    totalAssists: number;
    totalDurationSec: number;
    durationGameCount: number;
    totalGameTotalKills: number;
    gameTotalKillsCount: number;
};

type TeamRow = {
    id: string;
    name: string;
    shortName: string;
    logo: string | null;
    winRate: number;
    gameWinRate: number;
    matchCount: number;
    matchWins: number;
    bo1WinRate: number | null;
    bo1MatchCount: number;
    bo1MatchWins: number;
    bo3WinRate: number | null;
    bo3MatchCount: number;
    bo3MatchWins: number;
    bo5WinRate: number | null;
    bo5MatchCount: number;
    bo5MatchWins: number;
    gameCount: number;
    gameWins: number;
    kda: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgDurationSec: number | null;
    avgTotalKills: number | null;
};

const SORT_KEYS: SortKey[] = [
    'winRate',
    'gameWinRate',
    'kda',
    'matchCount',
    'bo1WinRate',
    'bo3WinRate',
    'bo5WinRate',
    'avgDuration',
    'avgTotalKills',
    'avgKills',
    'avgDeaths',
];

const OTHER_REGION_ID = 'OTHER';
const WORLDS_REGION_ID = 'WORLDS';

function normalizeName(value: unknown): string {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeText(value: unknown): string {
    return String(value || '').trim();
}

function normalizeRegionKey(value: unknown): string {
    const text = normalizeText(value);
    if (!text) return '';
    const upper = text.toUpperCase();
    if (upper === 'ALL' || text.includes('\u5168\u90e8')) return 'ALL';
    if (upper.includes('LPL')) return 'LPL';
    if (upper.includes('LCK')) return 'LCK';
    if (text.includes('\u5176\u5b83\u8d5b\u533a') || text.includes('\u5176\u4ed6\u8d5b\u533a') || upper.includes('OTHER')) return OTHER_REGION_ID;
    if (text.includes('\u4e16\u754c\u8d5b') || text.includes('\u5168\u7403\u5148\u950b\u8d5b') || upper.includes(WORLDS_REGION_ID) || upper.includes('WORLD') || upper.includes('MSI')) return WORLDS_REGION_ID;
    return normalizeLeagueBucket(text, text);
}

function matchesSelectedRegion(regionValue: unknown, selectedRegion: string): boolean {
    const selected = normalizeRegionKey(selectedRegion);
    const actual = normalizeRegionKey(regionValue);
    if (!selected || selected === 'ALL') return true;
    if (selected === actual) return true;
    if (selected === OTHER_REGION_ID) {
        return actual === OTHER_REGION_ID;
    }
    return false;
}

function resolveLeafLeagueKey(league: unknown, tournamentName: unknown) {
    const normalizedLeague = normalizeLeague(league || '');
    if (normalizedLeague && normalizedLeague !== OTHER_REGION_ID) return normalizedLeague;

    const text = String(tournamentName || '').trim();
    const upperText = text.toUpperCase();
    const knownLeafLeagues = ['CBLOL', 'LEC', 'LCS', 'LCP', 'LJL', 'VCS', 'PCS', 'LTA', 'LLA', 'TCL'];
    const inferredFromContains = knownLeafLeagues.find((item) => upperText.includes(item));
    if (inferredFromContains) return inferredFromContains;

    const match = text.match(/^([A-Za-z]{2,10})\s*(20\d{2})?\b/i);
    if (!match) return normalizedLeague || OTHER_REGION_ID;

    const inferred = normalizeLeague(match[1]);
    return inferred || normalizedLeague || OTHER_REGION_ID;
}

function normalizeTournamentAliasKey(value: unknown): string {
    const stopwords = new Set([
        'season', '\u8d5b\u5b63', 'unknown', '\u672a\u77e5', 'tournament', '\u8d5b\u4e8b', 'vs', 'versus',
        'regular', 'playoffs', 'group', 'stage', 'swiss', 'playin',
    ]);
    const canonicalizeAliasText = (input: string) => {
        let text = input;
        const replacements: Array<[RegExp, string]> = [
            [/(第\s*1\s*赛段|第一赛段|split\s*1)/gi, ' split1 '],
            [/(第\s*2\s*赛段|第二赛段|split\s*2)/gi, ' split2 '],
            [/(第\s*3\s*赛段|第三赛段|split\s*3)/gi, ' split3 '],
            [/(第\s*4\s*赛段|第四赛段|split\s*4)/gi, ' split4 '],
            [/(杯|cup)/gi, ' cup '],
            [/(对决赛|versus)/gi, ' versus '],
            [/(卡位赛|lock[\s-]*in)/gi, ' lockin '],
            [/(春季赛|spring)/gi, ' spring '],
            [/(夏季赛|summer)/gi, ' summer '],
            [/(冬季赛|winter)/gi, ' winter '],
            [/(常规赛|regular\s*season)/gi, ' regular '],
            [/(淘汰赛|季后赛|playoffs?)/gi, ' playoffs '],
            [/(入围赛|play[\s-]*in)/gi, ' playin '],
            [/(瑞士轮|swiss\s*stage|swiss)/gi, ' swiss '],
        ];

        for (const [pattern, replacement] of replacements) {
            text = text.replace(pattern, replacement);
        }

        return text;
    };
    const normalizeToken = (token: string) => {
        if (token === 'playoff' || token === 'playoffs' || token === '\u5b63\u540e\u8d5b') return 'playoffs';
        if (token === 'group' || token === 'groups') return 'group';
        if (token === 'stage' || token === '\u9636\u6bb5') return 'stage';
        if (token === 'playin' || token === 'play-in') return 'playin';
        return token;
    };

    return canonicalizeAliasText(String(value || ''))
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => !/^20\d{2}$/.test(token))
        .map(normalizeToken)
        .filter((token) => !stopwords.has(token))
        .sort()
        .join(' ');
}

function scoreTournamentLabel(value: string) {
    const text = String(value || '').trim();
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

function isUnknownTournamentLabel(value: string) {
    const text = String(value || '').trim().toLowerCase();
    return text.includes('unknown') || text.includes('\u672a\u77e5');
}

function pickOtherLeagueDisplayName(
    league: string,
    seasonYear: string,
    aliasesWithGames: Array<[string, number]>,
    scoreDisplayName: (name: string, league: string, totalGames: number) => number,
) {
    if (aliasesWithGames.length === 0) return '';

    const sortByScore = (left: [string, number], right: [string, number]) => {
        const rightScore = scoreDisplayName(right[0], league, right[1]);
        const leftScore = scoreDisplayName(left[0], league, left[1]);
        if (rightScore !== leftScore) return rightScore - leftScore;
        return left[0].localeCompare(right[0]);
    };

    if (league === 'LEC') {
        const versus = aliasesWithGames.filter(([name]) => /\bversus\b/i.test(name));
        if (versus.length > 0) {
            const canonical = [league, seasonYear, 'Versus'].filter(Boolean).join(' ').trim();
            const exact = versus.find(([name]) => name.toLowerCase() === canonical.toLowerCase());
            if (exact) return exact[0];
            return canonical;
        }
    }

    if (league === 'LJL') {
        const nonUnknown = aliasesWithGames.filter(([name]) => !isUnknownTournamentLabel(name));
        if (nonUnknown.length > 0) {
            return nonUnknown.slice().sort(sortByScore)[0][0];
        }
    }

    if (league === 'CBLOL') {
        const cupAliases = aliasesWithGames.filter(([name]) => /\b(cup)\b/i.test(name) || name.includes('杯'));
        if (cupAliases.length > 0) {
            return cupAliases.slice().sort(sortByScore)[0][0];
        }
        return [league, seasonYear, 'Cup'].filter(Boolean).join(' ').trim();
    }

    const nonUnknown = aliasesWithGames.filter(([name]) => !isUnknownTournamentLabel(name));
    const pool = nonUnknown.length > 0 ? nonUnknown : aliasesWithGames;
    return pool.slice().sort(sortByScore)[0][0];
}

type TournamentAliasBundle = EventOptionBundle & {
    aliases?: string[];
    leagueKey?: string;
    bucket?: string;
    isCoreLeague?: boolean;
};

function buildTournamentAliasBundlesLegacy(rows: Array<{ league: string; seasonYear: string; tournamentName: string; games?: number; syncedAtMs?: number }>): TournamentAliasBundle[] {
    const grouped = new Map<string, Array<{ name: string; league: string; seasonYear: string; games: number; syncedAtMs: number }>>();

    for (const row of rows) {
        const normalizedName = String(row.tournamentName || '').trim();
        if (!normalizedName) continue;

        const leagueKey = resolveLeafLeagueKey(row.league || '', normalizedName);
        const bucket = normalizeLeagueBucket(leagueKey, normalizedName);
        const isCoreLeague = bucket === 'LPL' || bucket === 'LCK' || bucket === WORLDS_REGION_ID;

        const aliasKey = isCoreLeague
            ? `${leagueKey}::${normalizeTournamentAliasKey(normalizedName)}`
            : `${leagueKey}::${String(row.seasonYear || '').trim()}`;

        const list = grouped.get(aliasKey) || [];
        list.push({
            name: normalizedName,
            league: leagueKey,
            seasonYear: String(row.seasonYear || '').trim(),
            games: Math.max(0, toNumber(row.games)),
            syncedAtMs: Math.max(0, Number(row.syncedAtMs || 0)),
        });
        grouped.set(aliasKey, list);
    }

    const scoreDisplayName = (name: string, league: string, totalGames: number) => {
        const label = String(name || '').trim();
        const lower = label.toLowerCase();
        let score = scoreTournamentLabel(label);
        score += totalGames * 0.05;
        if (lower.includes('unknown') || /未知/u.test(label)) score -= 1000;
        if (league === 'LEC' && lower.includes('versus')) score += 30;
        return score;
    };

    const bundles: TournamentAliasBundle[] = [];
    for (const entries of grouped.values()) {
        const byName = new Map<string, number>();
        let league = '';
        let seasonYear = '';
        let latestTimestampMs = 0;

        for (const item of entries) {
            league = item.league || league;
            seasonYear = item.seasonYear || seasonYear;
            byName.set(item.name, (byName.get(item.name) || 0) + item.games);
            latestTimestampMs = Math.max(latestTimestampMs, item.syncedAtMs || 0);
        }

        const aliases = Array.from(byName.entries())
            .sort((left, right) => {
                const rightScore = scoreDisplayName(right[0], league, right[1]);
                const leftScore = scoreDisplayName(left[0], league, left[1]);
                if (rightScore !== leftScore) return rightScore - leftScore;
                return left[0].localeCompare(right[0]);
            })
            .map(([name]) => name);

        if (aliases.length === 0) continue;
        const display = pickOtherLeagueDisplayName(league, seasonYear, Array.from(byName.entries()), scoreDisplayName) || aliases[0];
        const bucket = normalizeLeagueBucket(league, display);
        bundles.push({
            display,
            aliases,
            selectionAliases: aliases,
            matchAliases: aliases,
            leagueKey: league || OTHER_REGION_ID,
            bucket,
            isCoreLeague: bucket === 'LPL' || bucket === 'LCK' || bucket === WORLDS_REGION_ID,
            latestTimestampMs,
            totalGames: Array.from(byName.values()).reduce((sum, value) => sum + value, 0),
        });
    }

    return bundles.sort((left, right) =>
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
}

function buildTournamentAliasBundles(
    rows: Array<{ league: string; seasonYear: string; tournamentName: string; stage?: string; games?: number; syncedAtMs?: number }>,
    splits: Parameters<typeof buildConfiguredEventBundles>[1],
    targetRegion: string,
): TournamentAliasBundle[] {
    return buildConfiguredEventBundles(
        rows.map((row) => ({
            league: row.league,
            seasonYear: String(row.seasonYear || '').trim(),
            tournamentName: String(row.tournamentName || '').trim(),
            stage: String(row.stage || '').trim(),
            games: Math.max(0, toNumber(row.games)),
            syncedAtMs: Math.max(0, Number(row.syncedAtMs || 0)),
        })),
        splits,
        targetRegion,
    ).map((bundle) => ({
        ...bundle,
        aliases: bundle.selectionAliases,
    }));
}

function resolveTournamentSelection(requested: string, bundles: TournamentAliasBundle[]) {
    const requestedText = String(requested || '').trim();
    if (!requestedText) return '';

    const exact = bundles.find((item) => item.display === requestedText);
    if (exact) return exact.display;

    for (const bundle of bundles) {
        if (bundle.selectionAliases.includes(requestedText)) return bundle.display;
    }
    return '';
}

function matchesSelectedTournamentBundle(
    bundle: TournamentAliasBundle | null,
    selectedRegion: string,
    context: { tournament: unknown; stage: unknown; teamARegion: unknown; teamBRegion: unknown },
): boolean {
    if (!bundle) return true;

    const tournament = normalizeText(context.tournament);
    const stage = normalizeText(context.stage);
    const haystack = `${tournament} ${stage}`.trim();

    const matchLeafLeague = resolveLeafLeagueKey(
        context.teamARegion || context.teamBRegion || tournament || stage || OTHER_REGION_ID,
        tournament || stage,
    );
    const matchBucket = normalizeLeagueBucket(matchLeafLeague, tournament || stage);
    if (selectedRegion !== 'ALL' && matchBucket !== selectedRegion) return false;
    if (bundle.matchAliases.length === 0) return false;

    const aliasKeySet = new Set(bundle.matchAliases.map((alias) => normalizeTournamentAliasKey(alias)).filter(Boolean));
    const candidateKeys = [
        normalizeTournamentAliasKey(tournament),
        normalizeTournamentAliasKey(stage),
        normalizeTournamentAliasKey(haystack),
    ].filter(Boolean);

    if (candidateKeys.some((key) => aliasKeySet.has(key))) return true;

    const lowerHaystack = haystack.toLowerCase();
    return bundle.matchAliases.some((alias) => lowerHaystack.includes(String(alias || '').toLowerCase()));
}

function toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function parsePlayerStatsBlob(blob: unknown): any[] {
    if (!blob) return [];
    try {
        const parsed = JSON.parse(String(blob));
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.players)) return parsed.players;
        if (Array.isArray(parsed?.damage_data)) return parsed.damage_data;
        return [];
    } catch {
        return [];
    }
}

function parseDurationSeconds(duration: unknown): number {
    const numeric = toNumber(duration);
    if (numeric > 0) return Math.floor(numeric);
    return 0;
}

function parseMatchDate(value: unknown): Date | null {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function matchesSelectedYearWindow(startTime: unknown, selectedYear: string): boolean {
    const matchDate = parseMatchDate(startTime);
    if (!matchDate) return false;

    if (selectedYear === '2026') {
        return matchDate >= new Date('2025-11-01T00:00:00.000Z') && matchDate < new Date('2027-01-01T00:00:00.000Z');
    }

    const yearNumber = Number.parseInt(selectedYear, 10);
    if (Number.isNaN(yearNumber)) return true;

    return matchDate >= new Date(`${yearNumber}-01-01T00:00:00.000Z`) && matchDate < new Date(`${yearNumber + 1}-01-01T00:00:00.000Z`);
}

function normalizeBoFormat(format: unknown): BoFormat {
    const raw = String(format || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');

    const boMatch = raw.match(/BO(\d+)/);
    const value = boMatch?.[1] || raw;

    if (value === '1') return 'BO1';
    if (value === '3') return 'BO3';
    if (value === '5') return 'BO5';
    return null;
}

function addBoMatchCount(agg: TeamAgg, bo: BoFormat) {
    if (bo === 'BO1') agg.bo1MatchCount += 1;
    if (bo === 'BO3') agg.bo3MatchCount += 1;
    if (bo === 'BO5') agg.bo5MatchCount += 1;
}

function addBoWinCount(agg: TeamAgg, bo: BoFormat) {
    if (bo === 'BO1') agg.bo1MatchWins += 1;
    if (bo === 'BO3') agg.bo3MatchWins += 1;
    if (bo === 'BO5') agg.bo5MatchWins += 1;
}

function scoreTeamHits(sidePlayers: any[], teamRoster: Set<string> | undefined): number {
    if (!teamRoster || teamRoster.size === 0) return 0;

    let hits = 0;
    for (const raw of sidePlayers) {
        const rawName = raw?.name || raw?.playerName || raw?.player || raw?.player_name;
        const key = normalizeName(rawName);
        if (!key) continue;
        if (teamRoster.has(key)) hits += 1;
    }

    return hits;
}

function inferBlobContext(
    sidePlayers: any[],
    fallbackTeamId: string | null | undefined,
    teamRosterById: Map<string, Set<string>>,
    matchMeta: { teamAId: string | null; teamBId: string | null },
    gameMeta: { blueSideTeamId: string | null; redSideTeamId: string | null },
) {
    let blueTagCount = 0;
    let redTagCount = 0;

    for (const raw of sidePlayers) {
        const sideRaw = String(raw?.team ?? raw?.teamName ?? raw?.team_tag ?? raw?.teamTag ?? '').trim().toLowerCase();
        if (sideRaw.includes('blue') || sideRaw === '蓝方' || sideRaw === '蓝') blueTagCount += 1;
        if (sideRaw.includes('red') || sideRaw === '红方' || sideRaw === '红') redTagCount += 1;
    }

    let sideByTag: 'BLUE' | 'RED' | null = null;
    if (blueTagCount > redTagCount) sideByTag = 'BLUE';
    if (redTagCount > blueTagCount) sideByTag = 'RED';

    const candidates = Array.from(
        new Set([
            gameMeta.blueSideTeamId,
            gameMeta.redSideTeamId,
            matchMeta.teamAId,
            matchMeta.teamBId,
            fallbackTeamId || null,
        ].filter((v): v is string => !!v)),
    );

    let teamId = fallbackTeamId || null;
    let bestHits = -1;
    for (const candidate of candidates) {
        const roster = teamRosterById.get(candidate);
        const hits = scoreTeamHits(sidePlayers, roster);
        if (hits > bestHits) {
            bestHits = hits;
            teamId = candidate;
        }
    }

    let sideByRoster: 'BLUE' | 'RED' | null = null;
    if (gameMeta.blueSideTeamId || gameMeta.redSideTeamId) {
        const blueHits = scoreTeamHits(sidePlayers, teamRosterById.get(gameMeta.blueSideTeamId || ''));
        const redHits = scoreTeamHits(sidePlayers, teamRosterById.get(gameMeta.redSideTeamId || ''));

        if (blueHits > redHits) sideByRoster = 'BLUE';
        if (redHits > blueHits) sideByRoster = 'RED';
    }

    let side: 'BLUE' | 'RED' | null = sideByTag || sideByRoster;
    if (!side && teamId && gameMeta.blueSideTeamId && teamId === gameMeta.blueSideTeamId) side = 'BLUE';
    if (!side && teamId && gameMeta.redSideTeamId && teamId === gameMeta.redSideTeamId) side = 'RED';

    if (side === 'BLUE' && gameMeta.blueSideTeamId) teamId = gameMeta.blueSideTeamId;
    if (side === 'RED' && gameMeta.redSideTeamId) teamId = gameMeta.redSideTeamId;

    return { teamId, side };
}

function resolveBlobWin(
    winnerId: unknown,
    ctx: { teamId: string | null; side: 'BLUE' | 'RED' | null },
    other: { teamId: string | null; side: 'BLUE' | 'RED' | null },
    gameMeta: { blueSideTeamId: string | null; redSideTeamId: string | null },
): boolean | null {
    const winner = String(winnerId || '').trim();
    if (!winner) return null;

    const winnerUpper = winner.toUpperCase();
    if (winnerUpper === 'BLUE') return ctx.side === 'BLUE' ? true : ctx.side === 'RED' ? false : null;
    if (winnerUpper === 'RED') return ctx.side === 'RED' ? true : ctx.side === 'BLUE' ? false : null;

    if (ctx.teamId && winner === ctx.teamId) return true;
    if (other.teamId && winner === other.teamId) return false;

    if (gameMeta.blueSideTeamId && winner === gameMeta.blueSideTeamId) {
        if (ctx.side === 'BLUE') return true;
        if (ctx.side === 'RED') return false;
    }

    if (gameMeta.redSideTeamId && winner === gameMeta.redSideTeamId) {
        if (ctx.side === 'RED') return true;
        if (ctx.side === 'BLUE') return false;
    }

    return null;
}

function resolveMatchWinnerTeamId(match: any): string | null {
    const winner = String(match.winnerId || '').trim();
    if (!winner) return null;

    if (match.teamAId && winner === match.teamAId) return match.teamAId;
    if (match.teamBId && winner === match.teamBId) return match.teamBId;

    let teamAWins = 0;
    let teamBWins = 0;

    for (const game of match.games || []) {
        const gWinner = String(game.winnerId || '').trim();
        if (!gWinner) continue;

        if (match.teamAId && gWinner === match.teamAId) {
            teamAWins += 1;
            continue;
        }
        if (match.teamBId && gWinner === match.teamBId) {
            teamBWins += 1;
            continue;
        }

        const upper = gWinner.toUpperCase();
        if (upper === 'BLUE') {
            if (game.blueSideTeamId && game.blueSideTeamId === match.teamAId) teamAWins += 1;
            if (game.blueSideTeamId && game.blueSideTeamId === match.teamBId) teamBWins += 1;
        }
        if (upper === 'RED') {
            if (game.redSideTeamId && game.redSideTeamId === match.teamAId) teamAWins += 1;
            if (game.redSideTeamId && game.redSideTeamId === match.teamBId) teamBWins += 1;
        }
    }

    if (teamAWins > teamBWins) return match.teamAId;
    if (teamBWins > teamAWins) return match.teamBId;
    return null;
}

function getSortValue(row: TeamRow, key: SortKey): number {
    switch (key) {
        case 'winRate':
            return row.winRate;
        case 'gameWinRate':
            return row.gameWinRate;
        case 'kda':
            return row.kda;
        case 'matchCount':
            return row.matchCount;
        case 'bo1WinRate':
            return row.bo1WinRate ?? -1;
        case 'bo3WinRate':
            return row.bo3WinRate ?? -1;
        case 'bo5WinRate':
            return row.bo5WinRate ?? -1;
        case 'avgDuration':
            return row.avgDurationSec ?? -1;
        case 'avgTotalKills':
            return row.avgTotalKills ?? -1;
        case 'avgKills':
            return row.avgKills;
        case 'avgDeaths':
            return row.avgDeaths;
        default:
            return row.winRate;
    }
}

function calcRate(wins: number, count: number): number | null {
    if (count <= 0) return null;
    return (wins / count) * 100;
}

function pickBestSnapshotByGames(rows: any[]) {
    return rows.slice().sort((left, right) => {
        const gamesDiff = toNumber(right.games) - toNumber(left.games);
        if (gamesDiff !== 0) return gamesDiff;
        const rightMs = new Date(right.updatedAt || right.syncedAt || 0).getTime();
        const leftMs = new Date(left.updatedAt || left.syncedAt || 0).getTime();
        return rightMs - leftMs;
    })[0];
}

function buildFallbackRowsFromSnapshots(
    snapshotRows: any[],
    allTeams: any[],
    selectedRegion: string,
    selectedBundle: TournamentAliasBundle | null,
): TeamRow[] {
    const teamLookup = new Map<string, any>();
    for (const team of allTeams) {
        const keys = [normalizeName(team.name), normalizeName(team.shortName)].filter(Boolean);
        for (const key of keys) {
            if (!teamLookup.has(key)) teamLookup.set(key, team);
        }
    }

    const filteredRows = snapshotRows.filter((row) => {
        const rowBucket = normalizeLeagueBucket(row.league, row.tournamentName);
        if (selectedRegion !== 'ALL' && rowBucket !== selectedRegion) return false;
        if (!selectedBundle) return true;
        if (selectedBundle.matchAliases.length === 0) return false;

        const rowKey = normalizeTournamentAliasKey(row.tournamentName);
        const aliasKeys = new Set(
            selectedBundle.matchAliases
                .map((alias) => normalizeTournamentAliasKey(alias))
                .filter(Boolean),
        );
        return aliasKeys.has(rowKey) || selectedBundle.matchAliases.includes(row.tournamentName);
    });

    const groupedByTeam = new Map<string, any[]>();
    for (const row of filteredRows) {
        const teamKey = normalizeName(row.teamName || row.teamShortName || row.mappedTeamName);
        if (!teamKey) continue;
        const list = groupedByTeam.get(teamKey) || [];
        list.push(row);
        groupedByTeam.set(teamKey, list);
    }

    const rows: TeamRow[] = [];
    for (const [teamKey, teamRows] of groupedByTeam.entries()) {
        const byRole = new Map<string, any[]>();
        for (const row of teamRows) {
            const roleKey = String(row.role || 'OTHER').toUpperCase();
            const list = byRole.get(roleKey) || [];
            list.push(row);
            byRole.set(roleKey, list);
        }

        const representativeRows = Array.from(byRole.values()).map((group) => pickBestSnapshotByGames(group));
        const baseRow = pickBestSnapshotByGames(representativeRows.length > 0 ? representativeRows : teamRows);
        if (!baseRow) continue;

        const resolvedTeam = teamLookup.get(teamKey);
        const games = Math.max(0, Math.round(Math.max(...representativeRows.map((row) => toNumber(row.games)), toNumber(baseRow.games))));
        const wins = Math.max(0, Math.round(Math.max(...representativeRows.map((row) => toNumber(row.wins)), toNumber(baseRow.wins))));

        const avgKills = representativeRows.reduce((sum, row) => sum + toNumber(row.avgKills), 0);
        const avgDeaths = representativeRows.reduce((sum, row) => sum + toNumber(row.avgDeaths), 0);
        const avgAssists = representativeRows.reduce((sum, row) => sum + toNumber(row.avgAssists), 0);

        const winRate = toNumber(baseRow.winRatePct) > 0
            ? toNumber(baseRow.winRatePct)
            : calcRate(wins, games) ?? 0;
        const gameWinRate = winRate;
        const kda = (avgKills + avgAssists) / Math.max(1, avgDeaths);
        const avgTotalKills = avgKills + avgDeaths > 0 ? avgKills + avgDeaths : null;

        const displayName = resolvedTeam?.name || baseRow.teamName || baseRow.teamShortName || '未知战队';
        const displayShortName = resolvedTeam?.shortName || baseRow.teamShortName || displayName;

        if (games <= 0) continue;

        rows.push({
            id: resolvedTeam?.id || `snapshot-${teamKey}`,
            name: displayName,
            shortName: displayShortName,
            logo: resolvedTeam?.logo || null,
            winRate,
            gameWinRate,
            matchCount: games,
            matchWins: wins,
            bo1WinRate: null,
            bo1MatchCount: 0,
            bo1MatchWins: 0,
            bo3WinRate: null,
            bo3MatchCount: 0,
            bo3MatchWins: 0,
            bo5WinRate: null,
            bo5MatchCount: 0,
            bo5MatchWins: 0,
            gameCount: games,
            gameWins: wins,
            kda,
            avgKills,
            avgDeaths,
            avgAssists,
            avgDurationSec: null,
            avgTotalKills,
        });
    }

    return rows;
}

export default async function TeamsPage({
    searchParams,
}: {
    searchParams: Promise<{ region?: string; year?: string; split?: string; sort?: string; order?: string }>;
}) {
    const config = await getSystemConfig();
    const { region, year, split, sort, order } = await searchParams;

    const [snapshotMeta, matchMeta] = await Promise.all([
        prisma.playerStatSnapshot.findMany({
            select: {
                league: true,
                seasonYear: true,
                tournamentName: true,
                games: true,
                syncedAt: true,
            },
            orderBy: [{ syncedAt: 'desc' }, { league: 'asc' }, { seasonYear: 'desc' }, { tournamentName: 'asc' }],
        }),
        prisma.match.findMany({
            select: {
                tournament: true,
                startTime: true,
                teamA: { select: { region: true } },
                teamB: { select: { region: true } },
            },
            where: {
                tournament: { not: '' },
            },
            orderBy: [{ startTime: 'desc' }, { updatedAt: 'desc' }],
        }),
    ]);
    const eventMeta = [
        ...buildEventMetaRowsFromSnapshots(snapshotMeta),
        ...buildEventMetaRowsFromMatches(matchMeta),
    ];

    const configuredRegionOptions = (config.regions || [])
        .map((r) => normalizeRegionKey(r.id || r.name))
        .filter((item) => !!item && item !== 'ALL' && item !== 'MAJOR3');
    const snapshotRegionOptions = Array.from(
        new Set(
            eventMeta
                .map((row) => normalizeLeagueBucket(row.league, row.tournamentName))
                .filter(Boolean),
        ),
    );

    const preferredRegionOrder = ['LPL', 'LCK', OTHER_REGION_ID, WORLDS_REGION_ID];
    const regionOptions = Array.from(new Set([...configuredRegionOptions, ...snapshotRegionOptions, ...preferredRegionOrder]))
        .filter(Boolean)
        .filter((item) => item !== 'MAJOR3')
        .sort((left, right) => {
            const li = preferredRegionOrder.indexOf(left);
            const ri = preferredRegionOrder.indexOf(right);
            if (li !== -1 || ri !== -1) {
                if (li === -1) return 1;
                if (ri === -1) return -1;
                return li - ri;
            }
            return left.localeCompare(right);
        });

    const requestedRegion = normalizeRegionKey(region || config.defaultRegion || regionOptions[0] || 'LPL');
    const selectedRegion = regionOptions.includes(requestedRegion) ? requestedRegion : regionOptions[0] || 'LPL';

    const fallbackYearOptions = (config.years || []).map((item) => String(item || '').trim()).filter(Boolean);
    const yearsByRegionMap = new Map<string, string[]>();
    for (const regionId of regionOptions) {
        const years = Array.from(
            new Set(
                eventMeta
                    .filter((row) => normalizeLeagueBucket(row.league, row.tournamentName) === regionId)
                    .map((row) => String(row.seasonYear || '').trim())
                    .filter(Boolean),
            ),
        ).sort((a, b) => b.localeCompare(a));

        if (years.length > 0) {
            yearsByRegionMap.set(regionId, years);
        } else {
            yearsByRegionMap.set(regionId, fallbackYearOptions);
        }
    }

    const availableYears = yearsByRegionMap.get(selectedRegion) || fallbackYearOptions;
    const requestedYear = String(year || '').trim();
    const selectedYear = availableYears.includes(requestedYear)
        ? requestedYear
        : String(config.defaultYear && availableYears.includes(config.defaultYear) ? config.defaultYear : (availableYears[0] || new Date().getFullYear())).trim();
    const yearOptions = availableYears;

    const tournamentBundlesByRegionYear: Record<string, TournamentAliasBundle[]> = {};
    for (const regionId of regionOptions) {
        const years = yearsByRegionMap.get(regionId) || fallbackYearOptions;
        for (const y of years) {
            const rows = eventMeta
                .filter((row) => normalizeLeagueBucket(row.league, row.tournamentName) === regionId && String(row.seasonYear || '').trim() === y)
                .map((row) => ({
                    league: row.league,
                    seasonYear: String(row.seasonYear || '').trim(),
                    tournamentName: String(row.tournamentName || '').trim(),
                    stage: row.stage,
                    games: toNumber((row as any).games),
                    syncedAtMs: Number(row.syncedAtMs || 0),
                }))
                .filter((row) => row.tournamentName.length > 0);
            tournamentBundlesByRegionYear[`${regionId}::${y}`] = buildTournamentAliasBundles(rows, config.splits, regionId);
        }
    }

    const splitOptionsByRegionYear = Object.fromEntries(
        Object.entries(tournamentBundlesByRegionYear).map(([key, bundles]) => [
            key,
            [{ id: ALL_EVENT_OPTION, name: ALL_EVENT_OPTION }, ...bundles.map((bundle) => ({ id: bundle.display, name: bundle.display }))],
        ]),
    ) as Record<string, Array<{ id: string; name: string }>>;

    const selectedRegionYearKey = `${selectedRegion}::${selectedYear}`;
    const selectedTournamentBundles = tournamentBundlesByRegionYear[selectedRegionYearKey] || [];

    const requestedSplit = String(split || '').trim();
    const selectedSplit = resolveTournamentSelection(requestedSplit, selectedTournamentBundles) || ALL_EVENT_OPTION;
    const selectedTournamentBundle = selectedSplit === ALL_EVENT_OPTION
        ? null
        : selectedTournamentBundles.find((item) => item.display === selectedSplit) || null;

    const rawSort = String(sort || '');
    const selectedSortKey: SortKey = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : 'winRate';
    const selectedOrder: 'asc' | 'desc' = order === 'asc' ? 'asc' : 'desc';

    const allTeams = await getCachedTeams();
    const teams = allTeams.filter((t: any) => selectedRegion === 'ALL' || matchesSelectedRegion(t.region, selectedRegion));

    const [allPlayers, allFinishedMatches] = await Promise.all([
        prisma.player.findMany({
            select: {
                teamId: true,
                name: true,
                team: { select: { region: true } },
            },
        }),
        prisma.match.findMany({
            where: {
                status: 'FINISHED',
            },
            select: {
                id: true,
                startTime: true,
                teamAId: true,
                teamBId: true,
                winnerId: true,
                format: true,
                tournament: true,
                stage: true,
                teamA: { select: { region: true } },
                teamB: { select: { region: true } },
                games: {
                    select: {
                        winnerId: true,
                        duration: true,
                        totalKills: true,
                        blueKills: true,
                        redKills: true,
                        teamAStats: true,
                        teamBStats: true,
                        blueSideTeamId: true,
                        redSideTeamId: true,
                    },
                },
            },
        }),
    ]);

    const rawMatches = allFinishedMatches.filter((match) => matchesSelectedYearWindow(match.startTime, selectedYear));

    const players = allPlayers.filter((player) => matchesSelectedRegion(player.team?.region, selectedRegion));
    const matches = rawMatches.filter((match) => {
        const regionMatched =
            selectedRegion === 'ALL' ||
            matchesSelectedRegion(match.teamA?.region, selectedRegion) ||
            matchesSelectedRegion(match.teamB?.region, selectedRegion) ||
            matchesSelectedRegion(match.tournament, selectedRegion);

        if (!regionMatched) return false;
        return matchesSelectedTournamentBundle(selectedTournamentBundle, selectedRegion, {
            tournament: match.tournament,
            stage: match.stage,
            teamARegion: match.teamA?.region,
            teamBRegion: match.teamB?.region,
        });
    });

    const teamRosterById = new Map<string, Set<string>>();
    for (const p of players) {
        const set = teamRosterById.get(p.teamId) || new Set<string>();
        set.add(normalizeName(p.name));
        teamRosterById.set(p.teamId, set);
    }

    const aggByTeamId = new Map<string, TeamAgg>();
    for (const t of teams) {
        aggByTeamId.set(t.id, {
            teamId: t.id,
            matchCount: 0,
            matchWins: 0,
            bo1MatchCount: 0,
            bo1MatchWins: 0,
            bo3MatchCount: 0,
            bo3MatchWins: 0,
            bo5MatchCount: 0,
            bo5MatchWins: 0,
            gameCount: 0,
            gameWins: 0,
            totalKills: 0,
            totalDeaths: 0,
            totalAssists: 0,
            totalDurationSec: 0,
            durationGameCount: 0,
            totalGameTotalKills: 0,
            gameTotalKillsCount: 0,
        });
    }

    for (const match of matches) {
        const boFormat = normalizeBoFormat(match.format);

        if (match.teamAId && aggByTeamId.has(match.teamAId)) {
            const agg = aggByTeamId.get(match.teamAId)!;
            agg.matchCount += 1;
            addBoMatchCount(agg, boFormat);
        }
        if (match.teamBId && aggByTeamId.has(match.teamBId)) {
            const agg = aggByTeamId.get(match.teamBId)!;
            agg.matchCount += 1;
            addBoMatchCount(agg, boFormat);
        }

        const matchWinnerTeamId = resolveMatchWinnerTeamId(match);
        if (matchWinnerTeamId && aggByTeamId.has(matchWinnerTeamId)) {
            const agg = aggByTeamId.get(matchWinnerTeamId)!;
            agg.matchWins += 1;
            addBoWinCount(agg, boFormat);
        }

        for (const game of match.games) {
            const sideAPlayers = parsePlayerStatsBlob(game.teamAStats);
            const sideBPlayers = parsePlayerStatsBlob(game.teamBStats);

            const matchMeta = {
                teamAId: match.teamAId || null,
                teamBId: match.teamBId || null,
            };

            const gameMeta = {
                blueSideTeamId: game.blueSideTeamId || null,
                redSideTeamId: game.redSideTeamId || null,
            };

            const sideACtx = inferBlobContext(sideAPlayers, match.teamAId || null, teamRosterById, matchMeta, gameMeta);
            const sideBCtx = inferBlobContext(sideBPlayers, match.teamBId || null, teamRosterById, matchMeta, gameMeta);

            const sideAWin = resolveBlobWin(game.winnerId, sideACtx, sideBCtx, gameMeta);
            const sideBWin = resolveBlobWin(game.winnerId, sideBCtx, sideACtx, gameMeta);

            const durationSec = parseDurationSeconds(game.duration);

            const inferredTotalKillsFromSides =
                sideAPlayers.reduce((acc, raw) => acc + toNumber(raw?.kills), 0) + sideBPlayers.reduce((acc, raw) => acc + toNumber(raw?.kills), 0);
            const gameTotalKills =
                toNumber(game.totalKills) > 0
                    ? toNumber(game.totalKills)
                    : toNumber(game.blueKills) + toNumber(game.redKills) > 0
                      ? toNumber(game.blueKills) + toNumber(game.redKills)
                      : inferredTotalKillsFromSides;

            const applyTeamGame = (teamId: string | null, sidePlayers: any[], sideWin: boolean | null) => {
                if (!teamId || !aggByTeamId.has(teamId)) return;

                const agg = aggByTeamId.get(teamId)!;
                let sideKills = 0;
                let sideDeaths = 0;
                let sideAssists = 0;

                for (const raw of sidePlayers) {
                    sideKills += toNumber(raw?.kills);
                    sideDeaths += toNumber(raw?.deaths);
                    sideAssists += toNumber(raw?.assists);
                }

                agg.gameCount += 1;
                if (sideWin === true) agg.gameWins += 1;

                agg.totalKills += sideKills;
                agg.totalDeaths += sideDeaths;
                agg.totalAssists += sideAssists;

                if (durationSec > 0) {
                    agg.totalDurationSec += durationSec;
                    agg.durationGameCount += 1;
                }

                if (gameTotalKills > 0) {
                    agg.totalGameTotalKills += gameTotalKills;
                    agg.gameTotalKillsCount += 1;
                }
            };

            applyTeamGame(sideACtx.teamId, sideAPlayers, sideAWin);
            applyTeamGame(sideBCtx.teamId, sideBPlayers, sideBWin);
        }
    }

    const matchRows: TeamRow[] = teams
        .map((team: any) => {
            const agg = aggByTeamId.get(team.id);
            if (!agg || agg.matchCount === 0 || agg.gameCount === 0) return null;

            const winRate = (agg.matchWins / Math.max(1, agg.matchCount)) * 100;
            const gameWinRate = (agg.gameWins / Math.max(1, agg.gameCount)) * 100;
            const avgKills = agg.totalKills / Math.max(1, agg.gameCount);
            const avgDeaths = agg.totalDeaths / Math.max(1, agg.gameCount);
            const avgAssists = agg.totalAssists / Math.max(1, agg.gameCount);
            const kda = (avgKills + avgAssists) / Math.max(1, avgDeaths);
            const avgDurationSec = agg.durationGameCount > 0 ? agg.totalDurationSec / agg.durationGameCount : null;
            const avgTotalKills = agg.gameTotalKillsCount > 0 ? agg.totalGameTotalKills / agg.gameTotalKillsCount : null;

            return {
                id: team.id,
                name: team.name,
                shortName: team.shortName || team.name,
                logo: team.logo,
                winRate,
                gameWinRate,
                matchCount: agg.matchCount,
                matchWins: agg.matchWins,
                bo1WinRate: calcRate(agg.bo1MatchWins, agg.bo1MatchCount),
                bo1MatchCount: agg.bo1MatchCount,
                bo1MatchWins: agg.bo1MatchWins,
                bo3WinRate: calcRate(agg.bo3MatchWins, agg.bo3MatchCount),
                bo3MatchCount: agg.bo3MatchCount,
                bo3MatchWins: agg.bo3MatchWins,
                bo5WinRate: calcRate(agg.bo5MatchWins, agg.bo5MatchCount),
                bo5MatchCount: agg.bo5MatchCount,
                bo5MatchWins: agg.bo5MatchWins,
                gameCount: agg.gameCount,
                gameWins: agg.gameWins,
                kda,
                avgKills,
                avgDeaths,
                avgAssists,
                avgDurationSec,
                avgTotalKills,
            };
        })
        .filter((r): r is TeamRow => !!r);

    let rows: TeamRow[] = matchRows;
    if (rows.length === 0) {
        const snapshotCandidates = await prisma.playerStatSnapshot.findMany({
            where: {
                seasonYear: selectedYear,
                ...(selectedTournamentBundle
                    ? selectedTournamentBundle.matchAliases.length > 0
                        ? { tournamentName: { in: selectedTournamentBundle.matchAliases } }
                        : { tournamentName: '__NO_MATCH__' }
                    : {}),
            },
            select: {
                league: true,
                tournamentName: true,
                teamName: true,
                teamShortName: true,
                mappedTeamName: true,
                role: true,
                games: true,
                wins: true,
                winRatePct: true,
                avgKills: true,
                avgDeaths: true,
                avgAssists: true,
                updatedAt: true,
                syncedAt: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { games: 'desc' }],
        });

        rows = buildFallbackRowsFromSnapshots(snapshotCandidates, teams, selectedRegion, selectedTournamentBundle);
    }

    rows = rows.sort((a, b) => {
        const av = getSortValue(a, selectedSortKey);
        const bv = getSortValue(b, selectedSortKey);

        if (av !== bv) return selectedOrder === 'asc' ? av - bv : bv - av;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.gameWinRate !== a.gameWinRate) return b.gameWinRate - a.gameWinRate;
        if (b.kda !== a.kda) return b.kda - a.kda;
        return a.shortName.localeCompare(b.shortName);
    });

    const hasDuration = rows.some((r) => r.avgDurationSec !== null);

    return (
        <div className='space-y-5'>

            <TeamsFilters
                selectedRegion={selectedRegion}
                selectedYear={selectedYear}
                selectedSplit={selectedSplit}
                selectedSortKey={selectedSortKey}
                selectedOrder={selectedOrder}
                regionOptions={regionOptions}
                yearOptions={yearOptions}
                splitOptionsByRegionYear={splitOptionsByRegionYear}
            />

            <TeamsStatsTableClient
                rows={rows}
                hasDuration={hasDuration}
                selectedRegion={selectedRegion}
                initialSortKey={selectedSortKey}
                initialOrder={selectedOrder}
            />
        </div>
    );
}






