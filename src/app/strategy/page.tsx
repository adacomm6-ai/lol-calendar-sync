import StrategyCenterClient from './StrategyCenterClient';

import { MAJOR3_REGION_ID, OTHER_REGION_ID, WORLDS_REGION_ID, expandRegionScope, getSystemConfig } from '@/lib/config-service';
import { getCachedTeams } from '@/lib/data-cache';
import { prisma } from '@/lib/db';
import { sortByStartTimeDesc } from '@/lib/time-utils';
import { normalizeStrategyScoreWeights, type SplitConfig } from '@/lib/config-shared';

export const dynamic = 'force-dynamic';
const ALL_SPLITS_ID = '__ALL_SPLITS__';
const STRICT_MAJOR_REGION_IDS = ['LPL', 'LCK', 'LEC'];

function parseRegions(value?: string | null) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
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
    return (
        text.includes('WORLDS') ||
        text.includes('WORLD') ||
        text.includes('MSI') ||
        text.includes('FIRST STAND') ||
        text.includes('ALL-STAR') ||
        rawText.includes('世界赛') ||
        rawText.includes('全球先锋赛') ||
        rawText.includes('全球总决赛') ||
        upperText(match.teamA?.region).includes('WORLDS') ||
        upperText(match.teamB?.region).includes('WORLDS') ||
        upperText(match.teamA?.region).includes('WORLD') ||
        upperText(match.teamB?.region).includes('WORLD')
    );
}

function matchBelongsToStrategyRegion(
    match: {
        tournament?: string | null;
        stage?: string | null;
        teamA?: { region?: string | null } | null;
        teamB?: { region?: string | null } | null;
    },
    selectedRegion: string,
    scopedRegions: string[],
) {
    if (selectedRegion === 'ALL') return true;

    const teamRegions = [...parseRegions(match.teamA?.region), ...parseRegions(match.teamB?.region)].map((item) => item.toUpperCase());
    const text = `${match.tournament || ''} ${match.stage || ''}`.toUpperCase();
    const hasLpl = teamRegions.some((region) => region.includes('LPL')) || text.includes('LPL');
    const hasLck = teamRegions.some((region) => region.includes('LCK')) || text.includes('LCK');
    const hasLec = matchLooksLikeLec(match);
    const hasWorlds = matchLooksLikeWorlds(match);

    if (selectedRegion === MAJOR3_REGION_ID) {
        return hasLpl || hasLck || hasLec || hasWorlds;
    }

    if (selectedRegion === OTHER_REGION_ID) {
        if (hasLpl || hasLck || hasLec || hasWorlds) return false;
        return teamRegions.some((region) => region === OTHER_REGION_ID) || text.includes(OTHER_REGION_ID);
    }

    if (selectedRegion === WORLDS_REGION_ID) {
        return hasWorlds;
    }

    if (scopedRegions.includes('LEC')) {
        return hasLec;
    }

    return teamRegions.some((region) => scopedRegions.includes(region)) || scopedRegions.some((region) => text.includes(region));
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

function matchBelongsToStrategySplit(match: { tournament?: string | null; stage?: string | null }, splitKeywords: string[]) {
    if (splitKeywords.length === 0) return true;
    const text = `${match.tournament || ''} ${match.stage || ''}`;
    return splitKeywords.some((keyword) => text.includes(keyword));
}

function toEpochMs(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : null;
}

function isInRangeByMs(value: Date | string | null | undefined, startMs: number | null, endMsExclusive: number | null) {
    if (startMs === null && endMsExclusive === null) return true;
    const time = toEpochMs(value);
    if (time === null) return true;
    if (startMs !== null && time < startMs) return false;
    if (endMsExclusive !== null && time >= endMsExclusive) return false;
    return true;
}

function toFiniteNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

export default async function StrategyPage({
    searchParams,
}: {
    searchParams: Promise<{ region?: string; year?: string; split?: string }>;
}) {
    const config = await getSystemConfig();
    const { region, year, split } = await searchParams;

    const selectedRegion = String(region || MAJOR3_REGION_ID).toUpperCase() === 'LEC' ? OTHER_REGION_ID : (region || MAJOR3_REGION_ID);
    const selectedYear = year || config.defaultYear;
    const requestedSplit = split || ALL_SPLITS_ID;
    const scopedRegions = selectedRegion === MAJOR3_REGION_ID ? [...STRICT_MAJOR_REGION_IDS, WORLDS_REGION_ID] : expandRegionScope(selectedRegion);

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

    const allMatches = await prisma.match.findMany({
        select: {
            id: true,
            startTime: true,
            tournament: true,
            stage: true,
            format: true,
            winnerId: true,
            games: {
                select: {
                    id: true,
                    winnerId: true,
                    duration: true,
                    totalKills: true,
                    blueKills: true,
                    redKills: true,
                    blueSideTeamId: true,
                    redSideTeamId: true,
                },
            },
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

    const regionYearMatches = sortByStartTimeDesc(allMatches).filter((match) => {
        if (!isInRangeByMs(match.startTime, rangeStartMs, rangeEndMs)) return false;
        return matchBelongsToStrategyRegion(match, selectedRegion, scopedRegions);
    });

    const availableSplits = config.splits.filter((split) => {
        const splitKeywords = buildSplitKeywordsFromConfig(split.id, config.splits);
        return regionYearMatches.some((match) => matchBelongsToStrategySplit(match, splitKeywords));
    });

    const effectiveSelectedSplit = requestedSplit === ALL_SPLITS_ID || availableSplits.some((item) => item.id === requestedSplit) ? requestedSplit : ALL_SPLITS_ID;
    const effectiveSplitKeywords = effectiveSelectedSplit === ALL_SPLITS_ID ? [] : buildSplitKeywordsFromConfig(effectiveSelectedSplit, config.splits);

    const matches = regionYearMatches.filter((match) => matchBelongsToStrategySplit(match, effectiveSplitKeywords));

    const allTeams = await getCachedTeams();
    const matchedTeamIds = new Set(matches.flatMap((match) => [match.teamAId, match.teamBId]).filter(Boolean));
    const teams = allTeams.filter((team: any) => matchedTeamIds.has(team.id));

    const matchMeta = matches.map((match) => {
        const games = Array.isArray(match.games) ? match.games : [];
        let totalDurationSec = 0;
        let durationCount = 0;
        let totalKills = 0;
        let totalKillsCount = 0;
        let teamAKillSum = 0;
        let teamBKillSum = 0;
        let teamAKillCount = 0;
        let teamBKillCount = 0;
        let teamASeriesWins = 0;
        let teamBSeriesWins = 0;

        for (const game of games) {
            const duration = toFiniteNumber(game.duration);
            if (duration && duration > 0) {
                totalDurationSec += duration;
                durationCount += 1;
            }

            const computedTotalKills =
                (toFiniteNumber(game.totalKills) ?? 0) > 0
                    ? (toFiniteNumber(game.totalKills) as number)
                    : ((toFiniteNumber(game.blueKills) ?? 0) + (toFiniteNumber(game.redKills) ?? 0));
            if (computedTotalKills > 0) {
                totalKills += computedTotalKills;
                totalKillsCount += 1;
            }

            const blueKills = toFiniteNumber(game.blueKills) ?? 0;
            const redKills = toFiniteNumber(game.redKills) ?? 0;
            if (match.teamAId && game.blueSideTeamId === match.teamAId) {
                teamAKillSum += blueKills;
                teamAKillCount += 1;
            }
            if (match.teamAId && game.redSideTeamId === match.teamAId) {
                teamAKillSum += redKills;
                teamAKillCount += 1;
            }
            if (match.teamBId && game.blueSideTeamId === match.teamBId) {
                teamBKillSum += blueKills;
                teamBKillCount += 1;
            }
            if (match.teamBId && game.redSideTeamId === match.teamBId) {
                teamBKillSum += redKills;
                teamBKillCount += 1;
            }

            if (match.teamAId && game.winnerId === match.teamAId) teamASeriesWins += 1;
            if (match.teamBId && game.winnerId === match.teamBId) teamBSeriesWins += 1;
            if (game.winnerId === 'BLUE') {
                if (match.teamAId && game.blueSideTeamId === match.teamAId) teamASeriesWins += 1;
                if (match.teamBId && game.blueSideTeamId === match.teamBId) teamBSeriesWins += 1;
            }
            if (game.winnerId === 'RED') {
                if (match.teamAId && game.redSideTeamId === match.teamAId) teamASeriesWins += 1;
                if (match.teamBId && game.redSideTeamId === match.teamBId) teamBSeriesWins += 1;
            }
        }

        const teamAAvgKills = teamAKillCount > 0 ? Number((teamAKillSum / teamAKillCount).toFixed(1)) : null;
        const teamBAvgKills = teamBKillCount > 0 ? Number((teamBKillSum / teamBKillCount).toFixed(1)) : null;
        return {
            id: match.id,
            startTime: match.startTime?.toISOString() || null,
            tournament: match.tournament,
            stage: match.stage,
            format: match.format,
            winnerId: match.winnerId,
            gamesCount: games.length || 0,
            avgGameDurationSec: durationCount > 0 ? Math.round(totalDurationSec / durationCount) : null,
            avgTotalKills: totalKillsCount > 0 ? Number((totalKills / totalKillsCount).toFixed(1)) : null,
            teamAAvgKills,
            teamBAvgKills,
            teamAAvgDeaths: teamBAvgKills,
            teamBAvgDeaths: teamAAvgKills,
            teamASeriesWins: teamASeriesWins || null,
            teamBSeriesWins: teamBSeriesWins || null,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            teamAName: match.teamA?.shortName || match.teamA?.name || null,
            teamBName: match.teamB?.shortName || match.teamB?.name || null,
            teamARegion: match.teamA?.region || null,
            teamBRegion: match.teamB?.region || null,
        };
    });

    return (
        <StrategyCenterClient
            teams={teams as any}
            matches={matchMeta}
            regions={config.regions.filter((item) => String(item.id || '').toUpperCase() !== 'LEC')}
            years={config.years}
            splits={availableSplits}
            allSplits={config.splits}
            strategyScoreWeights={normalizeStrategyScoreWeights(config.strategyScoreWeights)}
            strategyScorePresetId={config.strategyScorePresetId}
            strategyScorePresetOverrides={config.strategyScorePresetOverrides}
            selectedRegion={selectedRegion}
            selectedYear={selectedYear}
            selectedSplit={effectiveSelectedSplit}
        />
    );
}


