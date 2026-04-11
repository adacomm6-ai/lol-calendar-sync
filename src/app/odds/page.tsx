import OddsStatsClient from './OddsStatsClient';

import { expandRegionScope, getSystemConfig } from '@/lib/config-service';
import { MAJOR3_REGION_ID, OTHER_REGION_ID, WORLDS_REGION_ID, type SplitConfig } from '@/lib/config-shared';
import { prisma } from '@/lib/db';
import { sortByStartTimeDesc } from '@/lib/time-utils';

export const dynamic = 'force-dynamic';

const ALL_SPLITS_ID = '__ALL_SPLITS__';
const ALL_REGIONS_ID = 'ALL';
const STRICT_MAJOR_REGION_IDS = ['LPL', 'LCK', 'LEC'];

function toEpochMs(value: unknown): number | null {
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }

    const text = String(value || '').trim();
    if (!text) return null;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
}

function isInRangeByMs(value: unknown, startMs: number | null, endMsExclusive: number | null) {
    if (startMs === null && endMsExclusive === null) return true;
    const time = toEpochMs(value);
    if (time === null) return true;
    if (startMs !== null && time < startMs) return false;
    if (endMsExclusive !== null && time >= endMsExclusive) return false;
    return true;
}

function upperText(value?: string | null) {
    return String(value || '').trim().toUpperCase();
}

function matchLooksLikeLec(match: {
    tournament?: string | null;
    stage?: string | null;
    teamA?: { region?: string | null } | null;
    teamB?: { region?: string | null } | null;
}) {
    const text = `${match.tournament || ''} ${match.stage || ''}`.toUpperCase();
    return text.includes('LEC') || upperText(match.teamA?.region).includes('LEC') || upperText(match.teamB?.region).includes('LEC');
}

function matchLooksLikeWorlds(match: {
    tournament?: string | null;
    stage?: string | null;
    teamA?: { region?: string | null } | null;
    teamB?: { region?: string | null } | null;
}) {
    const text = `${match.tournament || ''} ${match.stage || ''}`.toUpperCase();
    const rawText = `${match.tournament || ''} ${match.stage || ''}`;
    const teamARegion = upperText(match.teamA?.region);
    const teamBRegion = upperText(match.teamB?.region);

    return (
        text.includes('WORLDS') ||
        text.includes('WORLD') ||
        text.includes('MSI') ||
        text.includes('FIRST STAND') ||
        text.includes('ALL-STAR') ||
        rawText.includes('世界赛') ||
        rawText.includes('全球先锋赛') ||
        rawText.includes('全球总决赛') ||
        teamARegion.includes('WORLDS') ||
        teamBRegion.includes('WORLDS') ||
        teamARegion.includes('WORLD') ||
        teamBRegion.includes('WORLD')
    );
}

function matchBelongsToOddsRegion(
    match: {
        tournament?: string | null;
        stage?: string | null;
        teamA?: { region?: string | null } | null;
        teamB?: { region?: string | null } | null;
    },
    regionId: string,
    scopedRegions: string[],
) {
    const teamARegion = upperText(match.teamA?.region);
    const teamBRegion = upperText(match.teamB?.region);
    const text = `${match.tournament || ''} ${match.stage || ''}`.toUpperCase();
    const hasLpl = teamARegion.includes('LPL') || teamBRegion.includes('LPL') || text.includes('LPL');
    const hasLck = teamARegion.includes('LCK') || teamBRegion.includes('LCK') || text.includes('LCK');
    const hasLec = matchLooksLikeLec(match);
    const hasWorlds = matchLooksLikeWorlds(match);

    if (regionId === ALL_REGIONS_ID) return true;

    if (regionId === MAJOR3_REGION_ID) {
        return hasLpl || hasLck || hasLec || hasWorlds;
    }

    if (regionId === WORLDS_REGION_ID) {
        return hasWorlds;
    }

    if (regionId === OTHER_REGION_ID) {
        if (hasWorlds || hasLec || hasLpl || hasLck) return false;
        return scopedRegions.some((item) => teamARegion.includes(item) || teamBRegion.includes(item) || text.includes(item));
    }

    if (scopedRegions.includes('LEC')) {
        return hasLec;
    }

    return scopedRegions.some((item) => teamARegion.includes(item) || teamBRegion.includes(item) || text.includes(item));
}

function buildSplitKeywordsFromConfig(splitId: string, splits: SplitConfig[]) {
    const splitConfig = splits.find((item) => item.id === splitId);
    const tournamentKeyword = splitConfig?.mapping || splitId;
    return Array.from(
        new Set(
            [splitId, splitConfig?.name, tournamentKeyword]
                .filter((value): value is string => !!value && value.trim().length > 0)
                .map((value) => value.trim()),
        ),
    );
}

function matchBelongsToSplitKeywords(match: { tournament?: string | null; stage?: string | null }, splitKeywords: string[]) {
    if (splitKeywords.length === 0) return true;
    const text = `${match.tournament || ''} ${match.stage || ''}`.toLowerCase();
    return splitKeywords.some((keyword) => text.includes(String(keyword || '').trim().toLowerCase()));
}

export default async function OddsPage({
    searchParams,
}: {
    searchParams: Promise<{ region?: string; year?: string; split?: string }>;
}) {
    const config = await getSystemConfig();
    const { region, year, split } = await searchParams;

    const rawRegion = region || ALL_REGIONS_ID;
    const selectedRegion = String(rawRegion).toUpperCase() === 'LEC' ? OTHER_REGION_ID : rawRegion;
    const selectedYear = year || config.defaultYear;
    const requestedSplit = split || ALL_SPLITS_ID;
    const scopedRegions = selectedRegion === ALL_REGIONS_ID ? [] : expandRegionScope(selectedRegion);

    let rangeStartMs: number | null = null;
    let rangeEndMs: number | null = null;
    if (selectedYear === '2026') {
        rangeStartMs = new Date('2025-11-01T00:00:00.000Z').getTime();
        rangeEndMs = new Date('2027-01-01T00:00:00.000Z').getTime();
    } else {
        const parsedYear = Number.parseInt(selectedYear, 10);
        if (!Number.isNaN(parsedYear)) {
            rangeStartMs = new Date(`${parsedYear}-01-01T00:00:00.000Z`).getTime();
            rangeEndMs = new Date(`${parsedYear + 1}-01-01T00:00:00.000Z`).getTime();
        }
    }

    const matches = await prisma.match.findMany({
        select: {
            id: true,
            startTime: true,
            status: true,
            tournament: true,
            stage: true,
            teamAId: true,
            teamBId: true,
            teamA: {
                select: {
                    id: true,
                    name: true,
                    shortName: true,
                    region: true,
                },
            },
            teamB: {
                select: {
                    id: true,
                    name: true,
                    shortName: true,
                    region: true,
                },
            },
        },
    });

    const regionYearMatches = sortByStartTimeDesc(matches)
        .filter((match) => isInRangeByMs(match.startTime, rangeStartMs, rangeEndMs))
        .filter((match) => matchBelongsToOddsRegion(match, selectedRegion, scopedRegions));

    const availableSplits = config.splits.filter((split) => {
        const splitKeywords = buildSplitKeywordsFromConfig(split.id, config.splits);
        return regionYearMatches.some((match) => matchBelongsToSplitKeywords(match, splitKeywords));
    });

    const selectableSplits = config.splits.filter((item) => {
        const regions = (item.regions || []).map((region) => String(region || '').trim().toUpperCase());
        if (selectedRegion === ALL_REGIONS_ID) return true;
        if (selectedRegion === MAJOR3_REGION_ID) {
            return regions.length === 0 || regions.includes(MAJOR3_REGION_ID) || regions.includes('LPL') || regions.includes('LCK') || regions.includes('LEC') || regions.includes(WORLDS_REGION_ID);
        }
        if (selectedRegion === OTHER_REGION_ID) {
            return regions.length === 0 || regions.includes(OTHER_REGION_ID) || regions.includes('LEC');
        }
        if (selectedRegion === WORLDS_REGION_ID) {
            return regions.length === 0 || regions.includes(WORLDS_REGION_ID);
        }
        return regions.length === 0 || regions.includes(String(selectedRegion || '').trim().toUpperCase());
    });

    const effectiveSelectedSplit =
        requestedSplit === ALL_SPLITS_ID || selectableSplits.some((item) => item.id === requestedSplit) ? requestedSplit : ALL_SPLITS_ID;
    const effectiveSplitKeywords = effectiveSelectedSplit === ALL_SPLITS_ID ? [] : buildSplitKeywordsFromConfig(effectiveSelectedSplit, config.splits);

    const filteredMatches = regionYearMatches.filter((match) => matchBelongsToSplitKeywords(match, effectiveSplitKeywords));

    const teams = Array.from(
        new Map(
            filteredMatches
                .flatMap((match) => [match.teamA, match.teamB])
                .filter((team): team is NonNullable<typeof matches[number]['teamA']> => !!team)
                .map((team) => [team.id, { id: team.id, name: team.name, shortName: team.shortName, region: team.region }]),
        ).values(),
    );

    const matchMeta = filteredMatches.map((match) => ({
        id: match.id,
        startTime: match.startTime?.toISOString() || null,
        tournament: match.tournament,
        stage: match.stage,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        teamAName: match.teamA?.shortName || match.teamA?.name || null,
        teamBName: match.teamB?.shortName || match.teamB?.name || null,
        teamARegion: match.teamA?.region || null,
        teamBRegion: match.teamB?.region || null,
    }));

    return (
        <OddsStatsClient
            teams={teams as any}
            matches={matchMeta}
            regions={[
                { id: ALL_REGIONS_ID, name: '全部' },
                ...config.regions.filter((item) => {
                    const id = String(item.id || '').toUpperCase();
                    return id !== 'LEC';
                }),
            ]}
            years={config.years}
            splits={availableSplits}
            allSplits={config.splits}
            selectedRegion={selectedRegion}
            selectedYear={selectedYear}
            selectedSplit={effectiveSelectedSplit}
            defaultYear={config.defaultYear}
        />
    );
}




