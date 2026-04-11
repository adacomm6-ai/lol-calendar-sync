import {
    TEAM_METRIC_LABELS,
    buildExactMarketSummaries,
    buildTeamOddsSummary,
    createCounter,
    createMatchLookup,
    formatWinRate,
    getGroupedStatusFromRecords,
    getRecordActualOdds,
    getRecordSelectionLabel,
    getStatusFromResultValue,
    getTeamShortDisplayName,
    getWinRate,
    summarizeRealOddsReadiness,
    type OddsMatchMeta,
    type ExactMarketSummary,
    type RealOddsReadinessSummary,
    type StatusCounter,
    type StoredOddsResult,
    type TeamMetricKey,
    type TeamMetricSummary,
    type TeamOddsSummary,
} from '@/lib/odds-history';
import { getStrategyScorePresetById, normalizeStrategyScorePresetId, normalizeStrategyScorePresetOverrides, normalizeStrategyScoreWeights, type StrategyScorePresetId, type StrategyScorePresetOverrides, type StrategyScoreWeightsConfig } from '@/lib/config-shared';

export const STRATEGY_STORAGE_VERSION = 'v2';
const LEGACY_STRATEGY_SETTINGS_STORAGE_KEY = 'odds-daily-strategy-settings';
const LEGACY_STRATEGY_CHOICE_STORAGE_KEY = 'odds-daily-strategy-choice';
const LEGACY_STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY = 'odds-critical-alert-dismissed';
const LEGACY_STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY = 'odds-daily-strategy-alert-snapshot';
const LEGACY_STRATEGY_MATCH_SELECTION_STORAGE_PREFIX = 'odds-daily-strategy-match-selection:';

export const STRATEGY_SETTINGS_STORAGE_KEY = `${LEGACY_STRATEGY_SETTINGS_STORAGE_KEY}:${STRATEGY_STORAGE_VERSION}`;
export const STRATEGY_CHOICE_STORAGE_KEY = `${LEGACY_STRATEGY_CHOICE_STORAGE_KEY}:${STRATEGY_STORAGE_VERSION}`;
export const STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY = `${LEGACY_STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY}:${STRATEGY_STORAGE_VERSION}`;
export const STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY = `${LEGACY_STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY}:${STRATEGY_STORAGE_VERSION}`;
export const STRATEGY_MATCH_SELECTION_STORAGE_PREFIX = `${LEGACY_STRATEGY_MATCH_SELECTION_STORAGE_PREFIX}${STRATEGY_STORAGE_VERSION}:`;

export function clearStrategyStorageState(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
    const exactKeys = new Set([
        LEGACY_STRATEGY_SETTINGS_STORAGE_KEY,
        LEGACY_STRATEGY_CHOICE_STORAGE_KEY,
        LEGACY_STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY,
        LEGACY_STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY,
        STRATEGY_SETTINGS_STORAGE_KEY,
        STRATEGY_CHOICE_STORAGE_KEY,
        STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY,
        STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY,
    ]);
    const prefixes = [LEGACY_STRATEGY_MATCH_SELECTION_STORAGE_PREFIX, STRATEGY_MATCH_SELECTION_STORAGE_PREFIX];

    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key) keys.push(key);
    }

    for (const key of keys) {
        if (exactKeys.has(key) || prefixes.some((prefix) => key.startsWith(prefix))) {
            storage.removeItem(key);
        }
    }
}

export interface StrategyTeamOption {
    id: string;
    name: string;
    shortName?: string | null;
    region?: string | null;
}

export interface StrategySettings {
    dateKey: string;
    dayCutoffTime: string;
    startingCapital: number;
    addedCapital: number;
    dailyTarget: number;
    stopLine: number;
    teamMarketStopLoss: number;
    severeMultiplier: number;
}

export interface StrategyOption {
    id: string;
    label: string;
    riskLabel: string;
    description: string;
    planText: string;
    caution: string;
    suggestedSeriesBudget: number;
    suggestedGameBudget: number;
    suggestedMarketBudget: number;
    suggestedMatches: number;
    oddsSummary: string;
    riskSummary: string;
    basisSummary: string[];
}

export interface StrategyAlert {
    id: string;
    severity: 'info' | 'warning' | 'danger';
    title: string;
    message: string;
}

export interface StrategyRecommendation {
    id: string;
    direction: 'increase' | 'decrease';
    teamName: string;
    region: string;
    metricKey: TeamMetricKey;
    metricLabel: string;
    winRate: number | null;
    total: number;
    reason: string;
    averageOdds?: number | null;
    averagePayout?: number | null;
    breakEvenWinRate?: number | null;
    expectedUnitReturn?: number | null;
    lossRate?: number | null;
    payoutVolatility?: number | null;
}

export interface StrategyExactMarketRecommendation {
    id: string;
    direction: 'increase' | 'decrease';
    teamName: string;
    region: string;
    metricKey: TeamMetricKey;
    metricLabel: string;
    marketLabel: string;
    total: number;
    winRate: number | null;
    averageOdds: number | null;
    expectedUnitReturn: number | null;
    lossRate: number | null;
    averageStake: number | null;
    averageSettlement: number | null;
    averageLineDelta: number | null;
    sampleCount: number;
    reason: string;
    basisSummary: string[];
    totalScore: number;
    scoreBreakdown: StrategyScoreBreakdownItem[];
}

export interface StrategyExactMarketAllocation {
    id: string;
    teamName: string;
    region: string;
    metricKey: TeamMetricKey;
    metricLabel: string;
    marketLabel: string;
    suggestedShare: number;
    suggestedBudget: number;
    suggestedSingleStake: number;
    suggestedHands: number;
    averageOdds: number | null;
    expectedUnitReturn: number | null;
    winRate: number | null;
    lossRate: number | null;
    sampleCount: number;
    averageStake: number | null;
    averageSettlement: number | null;
    averageLineDelta: number | null;
    todayRecordedHands: number;
    todayRecordedTotal: number;
    todayWinStreak: number;
    todayLossStreak: number;
    livePriority: 'positive' | 'negative' | 'idle';
    reason: string;
    basisSummary: string[];
    totalScore: number;
    scoreBreakdown: StrategyScoreBreakdownItem[];
}

export interface TeamDailyBoardItem {
    teamId: string;
    aliasIds: string[];
    teamName: string;
    region: string;
    todayMatchCount: number;
    dailySummary: TeamOddsSummary;
    historySummary: TeamOddsSummary;
    performance: TeamPerformanceSnapshot;
}

export interface RegionDailyBoard {
    region: string;
    teams: TeamDailyBoardItem[];
}

export interface StrategyExplanationItem {
    label: string;
    detail: string;
}

export interface StrategyScoreBreakdownItem {
    label: string;
    value: number;
    detail: string;
    tone: 'positive' | 'negative' | 'neutral';
}

export interface StrategyWeightSnapshotItem {
    label: string;
    value: number;
}

export interface TeamPerformanceSnapshot {
    seriesCount: number;
    seriesWins: number;
    seriesWinRate: number | null;
    weightedSeriesWinRate: number | null;
    sameEventWeightedWinRate: number | null;
    similarOpponentWeightedWinRate: number | null;
    recentSeriesCount: number;
    recentSeriesWins: number;
    recentSeriesWinRate: number | null;
    recentStreakType: 'WIN' | 'LOSE' | null;
    recentStreakCount: number;
    bo1SeriesWinRate: number | null;
    bo3SeriesWinRate: number | null;
    bo5SeriesWinRate: number | null;
    avgSeriesGames: number | null;
    expectedMatchKills: number | null;
    expectedMatchDurationSec: number | null;
    confidenceScore: number | null;
    volatilityScore: number | null;
    opponentName: string | null;
    headToHeadCount: number;
    headToHeadWins: number;
    headToHeadWinRate: number | null;
}

interface TeamStyleProfile {
    teamId: string;
    avgGameDurationSec: number | null;
    avgTotalKills: number | null;
    avgSeriesGames: number | null;
    avgKillsFor: number | null;
    avgKillsAgainst: number | null;
    seriesWinRate: number | null;
    sampleCount: number;
}

function normalizeStyleProfile(profile: TeamStyleProfile | null | undefined): TeamStyleProfile | null {
    if (!profile || typeof profile !== 'object') return null;
    return {
        teamId: String(profile.teamId || ''),
        avgGameDurationSec: Number.isFinite(profile.avgGameDurationSec) ? profile.avgGameDurationSec : null,
        avgTotalKills: Number.isFinite(profile.avgTotalKills) ? profile.avgTotalKills : null,
        avgSeriesGames: Number.isFinite(profile.avgSeriesGames) ? profile.avgSeriesGames : null,
        avgKillsFor: Number.isFinite(profile.avgKillsFor) ? profile.avgKillsFor : null,
        avgKillsAgainst: Number.isFinite(profile.avgKillsAgainst) ? profile.avgKillsAgainst : null,
        seriesWinRate: Number.isFinite(profile.seriesWinRate) ? profile.seriesWinRate : null,
        sampleCount: Number.isFinite(profile.sampleCount) ? profile.sampleCount : 0,
    };
}

export type MarketTypeKey = 'winner' | 'handicap' | 'kills' | 'time';

export interface StrategyMatchOption {
    id: string;
    label: string;
    startTime: string | null;
    strategyDateKey: string;
    format: string | null;
    teamAName: string;
    teamBName: string;
    tournament: string | null;
    stage: string | null;
    selected: boolean;
}

export interface MarketTypeAllocation {
    key: MarketTypeKey;
    label: string;
    presetLabel: string;
    presetSourceLabel: string;
    presetDetail: string;
    weightSnapshot: StrategyWeightSnapshotItem[];
    dailyTotal: number;
    historyTotal: number;
    historyWinRate: number | null;
    modelSummary: string | null;
    basisSummary: string[];
    counter: StatusCounter;
    riskLevel: 'low' | 'medium' | 'high';
    riskText: string;
    suggestedShare: number;
    suggestedRemainingBudget: number;
    suggestedSingleMarketBudget: number;
    suggestedMarkets: number;
    averageOdds: number | null;
    averagePayout: number | null;
    breakEvenWinRate: number | null;
    expectedUnitReturn: number | null;
    lossRate: number | null;
    payoutVolatility: number | null;
    conservativeKelly: number | null;
    lowPayoutRate: number;
    pricedSampleCount: number;
    projectedExpectedMarkets: number;
    recordedMarkets: number;
    remainingMarkets: number;
    totalScore: number;
    scoreBreakdown: StrategyScoreBreakdownItem[];
}

export interface StrategyAlertSnapshot {
    dateKey: string;
    dayCutoffTime: string;
    selectedMatchIds: string[];
    alerts: StrategyAlert[];
    criticalAlerts: StrategyAlert[];
    settledRecordCount: number;
    updatedAt: string;
}

interface OddsPricingInsight {
    pricedSampleCount: number;
    averageOdds: number | null;
    averagePayout: number | null;
    breakEvenWinRate: number | null;
    actualWinRate: number | null;
    lossRate: number | null;
    edge: number | null;
    expectedUnitReturn: number | null;
    payoutVolatility: number | null;
    conservativeKelly: number | null;
    lowPayoutRate: number;
    veryLowPayoutRate: number;
    negativeReturnRate: number;
}

type FormatBucket = 'BO1' | 'BO3' | 'BO5' | 'OTHER';

interface FormatParticipationProfileItem {
    participationRate: number;
    entriesPerGame: number;
    sampleSeries: number;
    sampleGames: number;
    sampleEntries: number;
}

type FormatParticipationProfile = Record<FormatBucket, FormatParticipationProfileItem>;
type FormatMarketParticipationProfile = Record<FormatBucket, Record<MarketTypeKey, FormatParticipationProfileItem>>;

interface MarketSlotProjection {
    expected: number;
    recorded: number;
    remaining: number;
}

interface MatchEnvironmentSummary {
    avgConfidenceGap: number;
    avgExpectedKills: number | null;
    avgExpectedDurationSec: number | null;
    avgVolatilityScore: number;
    sameEventCoverage: number;
    matchCount: number;
}

export interface StrategySampleNotice {
    mode: 'empty' | 'limited' | 'normal';
    stageLabel: string;
    stageMessage: string;
    nextTargetCount: number | null;
    title: string;
    message: string;
    details: string[];
    historyRecordCount: number;
    settledRecordCount: number;
    pricedSampleCount: number;
}

export interface DailyStrategyBoard {
    dateKey: string;
    dayCutoffTime: string;
    totalMatches: number;
    selectedMatches: number;
    settledMatches: number;
    remainingMatches: number;
    expectedGames: number;
    selectedExpectedGames: number;
    settledGames: number;
    remainingGames: number;
    averageMarketsPerGame: number;
    expectedMarketSlots: number;
    remainingMarketSlots: number;
    recordedMarketEntries: number;
    settledRecordCount: number;
    formatBreakdown: {
        BO1: number;
        BO3: number;
        BO5: number;
        OTHER: number;
    };
    formatExpectation: Record<'BO1' | 'BO3' | 'BO5' | 'OTHER', number>;
    startingCapital: number;
    addedCapital: number;
    currentCapital: number;
    dailyTotal: number;
    stopLineGap: number;
    targetGap: number;
    progressRatio: number;
    recommendedStrategyId: string;
    strategies: StrategyOption[];
    alerts: StrategyAlert[];
    criticalAlerts: StrategyAlert[];
    explanations: StrategyExplanationItem[];
    recommendations: {
        increase: StrategyRecommendation[];
        decrease: StrategyRecommendation[];
        exactIncrease: StrategyExactMarketRecommendation[];
        exactDecrease: StrategyExactMarketRecommendation[];
    };
    exactMarketAllocations: StrategyExactMarketAllocation[];
    regionBoards: RegionDailyBoard[];
    dateMatches: StrategyMatchOption[];
    marketTypeAllocations: MarketTypeAllocation[];
    sampleNotice: StrategySampleNotice;
}

const DISPLAY_METRIC_KEYS: TeamMetricKey[] = ['winner', 'handicap', 'killsAll', 'killsOver', 'killsUnder', 'timeAll', 'timeOver', 'timeUnder'];

const MARKET_TYPE_LABELS: Record<MarketTypeKey, string> = {
    winner: '胜负盘',
    handicap: '让分盘',
    kills: '大小盘',
    time: '时间盘',
};

function parseTeamRegions(region?: string | null): string[] {
    return String(region || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

const STRATEGY_MAJOR_REGION_SCOPE = ['LPL', 'LCK', 'OTHER', 'LEC'];

function isStrategyMajorRegion(regionId: string): boolean {
    return regionId === 'MAJOR3';
}

function toBeijingDateKey(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return beijing.toISOString().slice(0, 10);
}

function resolveTeamRegion(team: StrategyTeamOption, selectedRegion: string): string {
    const regions = parseTeamRegions(team.region);
    if (isStrategyMajorRegion(selectedRegion)) {
        const matchedRegion = STRATEGY_MAJOR_REGION_SCOPE.find((region) => regions.includes(region));
        return matchedRegion || regions[0] || '???';
    }
    if (selectedRegion !== 'ALL' && regions.includes(selectedRegion)) return selectedRegion;
    return regions[0] || '???';
}

function normalizeStrategyDayCutoffTime(value?: string | null): string {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '06:00';
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '06:00';
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '06:00';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getStrategyDayCutoffMinutes(dayCutoffTime?: string | null): number {
    const normalized = normalizeStrategyDayCutoffTime(dayCutoffTime);
    const [hourText, minuteText] = normalized.split(':');
    return Number(hourText) * 60 + Number(minuteText);
}

export function getStrategyDateKeyFromIso(value?: string | null, dayCutoffTime?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const cutoffMinutes = getStrategyDayCutoffMinutes(dayCutoffTime);
    const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000 - cutoffMinutes * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
}

export function getStrategyDayWindow(dateKey: string, dayCutoffTime?: string | null): { startMs: number; endMs: number } {
    const normalized = normalizeStrategyDayCutoffTime(dayCutoffTime);
    const [year, month, day] = dateKey.split('-').map(Number);
    const [hourText, minuteText] = normalized.split(':');
    const startMs = Date.UTC(year, (month || 1) - 1, day || 1, Number(hourText) - 8, Number(minuteText), 0, 0);
    return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
}

function getStrategyTeamAliasKey(team: StrategyTeamOption): string {
    const region = resolveTeamRegion(team, 'ALL');
    const display = getTeamShortDisplayName(team.shortName || team.name || team.id);
    return `${region}::${display}`;
}

function buildStrategyTeamAliasMap(teams: StrategyTeamOption[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const team of teams) {
        const key = getStrategyTeamAliasKey(team);
        const list = grouped.get(key) || [];
        list.push(team.id);
        grouped.set(key, list);
    }

    const aliasMap = new Map<string, string[]>();
    for (const ids of grouped.values()) {
        const uniqueIds = Array.from(new Set(ids));
        for (const id of uniqueIds) {
            aliasMap.set(id, uniqueIds);
        }
    }

    return aliasMap;
}

function calcRatio(numerator: number, denominator: number): number | null {
    if (denominator <= 0) return null;
    return Number(((numerator / denominator) * 100).toFixed(1));
}

function normalizeEventKey(value?: string | null): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => !/^20\d{2}$/.test(token))
        .filter((token) => !['stage', 'group', 'regular', 'season'].includes(token))
        .join(' ');
}

function buildMatchEventKey(match?: OddsMatchMeta | null): string {
    if (!match) return '';
    return normalizeEventKey(`${match.tournament || ''} ${match.stage || ''}`.trim());
}

function buildTeamStyleProfiles(matches: OddsMatchMeta[], aliasMap: Map<string, string[]>): Map<string, TeamStyleProfile> {
    const seed = new Map<
        string,
        {
            sampleCount: number;
            durationSum: number;
            durationCount: number;
            totalKillsSum: number;
            totalKillsCount: number;
            seriesGamesSum: number;
            seriesGamesCount: number;
            killsForSum: number;
            killsForCount: number;
            killsAgainstSum: number;
            killsAgainstCount: number;
            seriesWins: number;
            seriesCount: number;
        }
    >();

    const ensure = (teamId: string) => {
        const aliasIds = aliasMap.get(teamId) || [teamId];
        const canonicalId = aliasIds[0] || teamId;
        const current =
            seed.get(canonicalId) ||
            {
                sampleCount: 0,
                durationSum: 0,
                durationCount: 0,
                totalKillsSum: 0,
                totalKillsCount: 0,
                seriesGamesSum: 0,
                seriesGamesCount: 0,
                killsForSum: 0,
                killsForCount: 0,
                killsAgainstSum: 0,
                killsAgainstCount: 0,
                seriesWins: 0,
                seriesCount: 0,
            };
        seed.set(canonicalId, current);
        return { canonicalId, current };
    };

    for (const match of matches) {
        const teamAId = String(match.teamAId || '');
        const teamBId = String(match.teamBId || '');
        if (!teamAId || !teamBId || !match.winnerId) continue;

        if (teamAId === String(match.winnerId)) {
            const { current } = ensure(teamAId);
            current.seriesWins += 1;
        }
        if (teamBId === String(match.winnerId)) {
            const { current } = ensure(teamBId);
            current.seriesWins += 1;
        }

        for (const teamId of [teamAId, teamBId]) {
            const { current } = ensure(teamId);
            current.seriesCount += 1;
            current.sampleCount += 1;
            if (match.avgGameDurationSec !== null && match.avgGameDurationSec !== undefined) {
                current.durationSum += match.avgGameDurationSec;
                current.durationCount += 1;
            }
            if (match.avgTotalKills !== null && match.avgTotalKills !== undefined) {
                current.totalKillsSum += match.avgTotalKills;
                current.totalKillsCount += 1;
            }
            if (match.gamesCount !== null && match.gamesCount !== undefined && match.gamesCount > 0) {
                current.seriesGamesSum += match.gamesCount;
                current.seriesGamesCount += 1;
            }

            const killsFor = teamId === teamAId ? match.teamAAvgKills : match.teamBAvgKills;
            const killsAgainst = teamId === teamAId ? match.teamAAvgDeaths : match.teamBAvgDeaths;
            if (killsFor !== null && killsFor !== undefined) {
                current.killsForSum += killsFor;
                current.killsForCount += 1;
            }
            if (killsAgainst !== null && killsAgainst !== undefined) {
                current.killsAgainstSum += killsAgainst;
                current.killsAgainstCount += 1;
            }
        }
    }

    const profiles = new Map<string, TeamStyleProfile>();
    for (const [teamId, current] of seed.entries()) {
        profiles.set(teamId, {
            teamId,
            avgGameDurationSec: current.durationCount > 0 ? Number((current.durationSum / current.durationCount).toFixed(1)) : null,
            avgTotalKills: current.totalKillsCount > 0 ? Number((current.totalKillsSum / current.totalKillsCount).toFixed(1)) : null,
            avgSeriesGames: current.seriesGamesCount > 0 ? Number((current.seriesGamesSum / current.seriesGamesCount).toFixed(1)) : null,
            avgKillsFor: current.killsForCount > 0 ? Number((current.killsForSum / current.killsForCount).toFixed(1)) : null,
            avgKillsAgainst: current.killsAgainstCount > 0 ? Number((current.killsAgainstSum / current.killsAgainstCount).toFixed(1)) : null,
            seriesWinRate: calcRatio(current.seriesWins, current.seriesCount),
            sampleCount: current.sampleCount,
        });
    }

    return profiles;
}

function getStyleSimilarity(base: TeamStyleProfile | null | undefined, other: TeamStyleProfile | null | undefined): number | null {
    const safeBase = normalizeStyleProfile(base);
    const safeOther = normalizeStyleProfile(other);
    if (!safeBase || !safeOther) return null;
    const pairs: Array<[number | null, number | null, number]> = [
        [safeBase.avgGameDurationSec, safeOther.avgGameDurationSec, 480],
        [safeBase.avgTotalKills, safeOther.avgTotalKills, 18],
        [safeBase.avgSeriesGames, safeOther.avgSeriesGames, 2],
        [safeBase.avgKillsFor, safeOther.avgKillsFor, 10],
        [safeBase.avgKillsAgainst, safeOther.avgKillsAgainst, 10],
        [safeBase.seriesWinRate, safeOther.seriesWinRate, 35],
    ];

    const scored = pairs
        .filter(([left, right]) => left !== null && right !== null)
        .map(([left, right, scale]) => Math.max(0, 1 - Math.abs((left as number) - (right as number)) / scale));

    if (scored.length === 0) return null;
    return Number((scored.reduce((sum, item) => sum + item, 0) / scored.length).toFixed(2));
}

function buildTeamPerformanceSnapshot(params: {
    matches: OddsMatchMeta[];
    teamAliasIds: string[];
    opponentAliasIds?: string[];
    opponentName?: string | null;
    currentMatch?: OddsMatchMeta | null;
    teamStyleMap?: Map<string, TeamStyleProfile>;
}): TeamPerformanceSnapshot {
    const { matches, teamAliasIds, opponentAliasIds = [], opponentName = null, currentMatch = null, teamStyleMap = new Map() } = params;
    const teamIds = new Set(teamAliasIds.filter(Boolean));
    const opponentIds = new Set(opponentAliasIds.filter(Boolean));
    const currentEventKey = buildMatchEventKey(currentMatch);
    const currentFormatBucket = getFormatBucket(currentMatch?.format);
    const teamProfile = normalizeStyleProfile(teamStyleMap.get(teamAliasIds[0] || ''));
    const opponentProfile = normalizeStyleProfile(teamStyleMap.get(opponentAliasIds[0] || ''));
    const relevantMatches = matches
        .filter((match) => {
            if (!match.winnerId) return false;
            return teamIds.has(String(match.teamAId || '')) || teamIds.has(String(match.teamBId || ''));
        })
        .sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime());

    let seriesCount = 0;
    let seriesWins = 0;
    let bo1Count = 0;
    let bo1Wins = 0;
    let bo3Count = 0;
    let bo3Wins = 0;
    let bo5Count = 0;
    let bo5Wins = 0;
    let totalSeriesGames = 0;
    let seriesGamesCount = 0;
    let headToHeadCount = 0;
    let headToHeadWins = 0;
    let weightedWinSum = 0;
    let weightedSeriesSum = 0;
    let sameEventWeightedWinSum = 0;
    let sameEventWeightedSeriesSum = 0;
    let similarOpponentWeightedWinSum = 0;
    let similarOpponentWeightedSeriesSum = 0;
    let weightedKillsSum = 0;
    let weightedKillsWeight = 0;
    let weightedDurationSum = 0;
    let weightedDurationWeight = 0;
    let volatilityAccumulator = 0;
    let volatilityWeight = 0;
    const recentResults: Array<'WIN' | 'LOSE'> = [];

    for (const [index, match] of relevantMatches.entries()) {
        const teamAId = String(match.teamAId || '');
        const teamBId = String(match.teamBId || '');
        if (!teamIds.has(teamAId) && !teamIds.has(teamBId)) continue;
        if (String(match.winnerId || '') !== teamAId && String(match.winnerId || '') !== teamBId) continue;

        const teamWon = teamIds.has(String(match.winnerId || ''));
        const opponentId = teamIds.has(teamAId) ? teamBId : teamAId;
        const historicalOpponentProfile = normalizeStyleProfile(
            teamStyleMap.get((opponentIds.has(opponentId) ? opponentAliasIds[0] : opponentId) || opponentId) || teamStyleMap.get(opponentId),
        );
        const similarity = getStyleSimilarity(opponentProfile, historicalOpponentProfile);
        const isSameEvent = currentEventKey && buildMatchEventKey(match) === currentEventKey;
        const isSameFormat = currentFormatBucket !== 'OTHER' && getFormatBucket(match.format) === currentFormatBucket;
        const recencyWeight = index < 3 ? 1.85 : index < 5 ? 1.55 : index < 10 ? 1.25 : 0.88;
        const eventWeight = isSameEvent ? 1.45 : currentEventKey ? 0.82 : 1;
        const formatWeight = isSameFormat ? 1.12 : 1;
        const similarityWeight = similarity === null ? 1 : 0.85 + similarity * 0.5;
        const weight = Number((recencyWeight * eventWeight * formatWeight * similarityWeight).toFixed(4));
        seriesCount += 1;
        if (teamWon) seriesWins += 1;
        if (recentResults.length < 5) recentResults.push(teamWon ? 'WIN' : 'LOSE');
        weightedSeriesSum += weight;
        if (teamWon) weightedWinSum += weight;
        if (isSameEvent) {
            sameEventWeightedSeriesSum += weight;
            if (teamWon) sameEventWeightedWinSum += weight;
        }
        if (similarity !== null && similarity >= 0.55) {
            similarOpponentWeightedSeriesSum += weight;
            if (teamWon) similarOpponentWeightedWinSum += weight;
        }

        const formatBucket = getFormatBucket(match.format);
        if (formatBucket === 'BO1') {
            bo1Count += 1;
            if (teamWon) bo1Wins += 1;
        } else if (formatBucket === 'BO3') {
            bo3Count += 1;
            if (teamWon) bo3Wins += 1;
        } else if (formatBucket === 'BO5') {
            bo5Count += 1;
            if (teamWon) bo5Wins += 1;
        }

        if (Number.isFinite(match.gamesCount) && Number(match.gamesCount) > 0) {
            totalSeriesGames += Number(match.gamesCount);
            seriesGamesCount += 1;
        }

        const teamKills = teamIds.has(teamAId) ? match.teamAAvgKills : match.teamBAvgKills;
        const teamDeaths = teamIds.has(teamAId) ? match.teamAAvgDeaths : match.teamBAvgDeaths;
        const avgTotalKills = match.avgTotalKills;
        const avgGameDurationSec = match.avgGameDurationSec;
        if (teamKills != null) {
            weightedKillsSum += teamKills * weight;
            weightedKillsWeight += weight;
        }
        if (avgGameDurationSec != null) {
            weightedDurationSum += avgGameDurationSec * weight;
            weightedDurationWeight += weight;
        }
        if (teamKills != null && teamDeaths != null && avgTotalKills != null) {
            const volatilityRaw = Math.abs(teamKills - teamDeaths) + Math.max(avgTotalKills - 24, 0) * 0.4 + Math.max((avgGameDurationSec ?? 0) - 2100, 0) / 180;
            volatilityAccumulator += volatilityRaw * weight;
            volatilityWeight += weight;
        }

        if (
            opponentIds.size > 0 &&
            ((teamIds.has(teamAId) && opponentIds.has(teamBId)) || (teamIds.has(teamBId) && opponentIds.has(teamAId)))
        ) {
            headToHeadCount += 1;
            if (teamWon) headToHeadWins += 1;
        }
    }

    let recentStreakType: 'WIN' | 'LOSE' | null = null;
    let recentStreakCount = 0;
    for (const result of recentResults) {
        if (recentStreakType === null) {
            recentStreakType = result;
            recentStreakCount = 1;
            continue;
        }
        if (result !== recentStreakType) break;
        recentStreakCount += 1;
    }

    const recentSeriesCount = recentResults.length;
    const recentSeriesWins = recentResults.filter((item) => item === 'WIN').length;
    const expectedMatchKills =
        teamProfile?.avgKillsFor != null && opponentProfile?.avgKillsFor != null && teamProfile?.avgKillsAgainst != null && opponentProfile?.avgKillsAgainst != null
            ? Number((((teamProfile.avgKillsFor + opponentProfile.avgKillsFor + teamProfile.avgKillsAgainst + opponentProfile.avgKillsAgainst) / 2)).toFixed(1))
            : weightedKillsWeight > 0 && opponentProfile?.avgKillsFor != null
              ? Number((((weightedKillsSum / weightedKillsWeight) + opponentProfile.avgKillsFor) * 0.5).toFixed(1))
              : null;
    const expectedMatchDurationSec =
        teamProfile?.avgGameDurationSec != null && opponentProfile?.avgGameDurationSec != null
            ? Math.round((teamProfile.avgGameDurationSec + opponentProfile.avgGameDurationSec) / 2)
            : weightedDurationWeight > 0
              ? Math.round(weightedDurationSum / weightedDurationWeight)
              : null;
    const volatilityScore = volatilityWeight > 0 ? Number((volatilityAccumulator / volatilityWeight).toFixed(2)) : null;
    const confidenceBase = (weightedSeriesSum > 0 ? weightedWinSum / weightedSeriesSum : 0.5) * 100;
    const confidenceScore = Number((Math.min(Math.max(confidenceBase + (sameEventWeightedSeriesSum > 0 ? 6 : 0) + (similarOpponentWeightedSeriesSum > 0 ? 4 : 0), 5), 95)).toFixed(1));

    return {
        seriesCount,
        seriesWins,
        seriesWinRate: calcRatio(seriesWins, seriesCount),
        weightedSeriesWinRate: weightedSeriesSum > 0 ? Number(((weightedWinSum / weightedSeriesSum) * 100).toFixed(1)) : null,
        sameEventWeightedWinRate: sameEventWeightedSeriesSum > 0 ? Number(((sameEventWeightedWinSum / sameEventWeightedSeriesSum) * 100).toFixed(1)) : null,
        similarOpponentWeightedWinRate: similarOpponentWeightedSeriesSum > 0 ? Number(((similarOpponentWeightedWinSum / similarOpponentWeightedSeriesSum) * 100).toFixed(1)) : null,
        recentSeriesCount,
        recentSeriesWins,
        recentSeriesWinRate: calcRatio(recentSeriesWins, recentSeriesCount),
        recentStreakType,
        recentStreakCount,
        bo1SeriesWinRate: calcRatio(bo1Wins, bo1Count),
        bo3SeriesWinRate: calcRatio(bo3Wins, bo3Count),
        bo5SeriesWinRate: calcRatio(bo5Wins, bo5Count),
        avgSeriesGames: seriesGamesCount > 0 ? Number((totalSeriesGames / seriesGamesCount).toFixed(1)) : null,
        expectedMatchKills,
        expectedMatchDurationSec,
        confidenceScore,
        volatilityScore,
        opponentName,
        headToHeadCount,
        headToHeadWins,
        headToHeadWinRate: calcRatio(headToHeadWins, headToHeadCount),
    };
}

export function getDateKeyFromIso(value?: string | null): string {
    return toBeijingDateKey(value);
}

export function getRecordDateKey(record: StoredOddsResult, matchMeta?: OddsMatchMeta): string {

    return getDateKeyFromIso(matchMeta?.startTime || record.matchStartTime || record.createdAt);
}

export function getRecordStrategyDateKey(record: StoredOddsResult, matchMeta?: OddsMatchMeta, dayCutoffTime?: string | null): string {
    return getStrategyDateKeyFromIso(matchMeta?.startTime || record.matchStartTime || record.createdAt, dayCutoffTime);
}

export function normalizeHundredAmount(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    const normalized = Number(value);
    if (normalized === 0) return 0;
    const scaled = Math.abs(normalized) < 100 ? normalized * 100 : normalized;
    return Math.round(scaled / 100) * 100;
}

export function normalizeStrategySettings(settings: StrategySettings): StrategySettings {
    return {
        ...settings,
        dayCutoffTime: normalizeStrategyDayCutoffTime(settings.dayCutoffTime),
        startingCapital: normalizeHundredAmount(settings.startingCapital, 50000),
        addedCapital: normalizeHundredAmount(settings.addedCapital, 0),
        dailyTarget: normalizeHundredAmount(settings.dailyTarget, 10000),
        stopLine: normalizeHundredAmount(settings.stopLine, 0),
        teamMarketStopLoss: Math.abs(normalizeHundredAmount(settings.teamMarketStopLoss, 4000)),
        severeMultiplier: Number.isFinite(settings.severeMultiplier) ? Math.max(Number(settings.severeMultiplier), 1.2) : 1.8,
    };
}

export function createDefaultStrategySettings(dateKey: string): StrategySettings {
    return normalizeStrategySettings({
        dateKey,
        dayCutoffTime: '06:00',
        startingCapital: 50000,
        addedCapital: 0,
        dailyTarget: 10000,
        stopLine: 0,
        teamMarketStopLoss: 4000,
        severeMultiplier: 1.8,
    });
}

export function parseStoredStrategySettings(raw: string | null, fallbackDate: string): StrategySettings {
    const fallback = createDefaultStrategySettings(fallbackDate);
    if (!raw) return fallback;

    try {
        const parsed = JSON.parse(raw);
        const nextDate = typeof parsed?.dateKey === 'string' && parsed.dateKey ? parsed.dateKey : fallbackDate;
        const legacyStopLine =
            typeof parsed?.stopLine === 'number'
                ? parsed.stopLine
                : typeof parsed?.dailyStopLoss === 'number'
                  ? -Math.abs(parsed.dailyStopLoss)
                  : fallback.stopLine;

        return normalizeStrategySettings({
            dateKey: nextDate,
            dayCutoffTime: typeof parsed?.dayCutoffTime === 'string' ? parsed.dayCutoffTime : fallback.dayCutoffTime,
            startingCapital: typeof parsed?.startingCapital === 'number' ? parsed.startingCapital : fallback.startingCapital,
            addedCapital: typeof parsed?.addedCapital === 'number' ? parsed.addedCapital : fallback.addedCapital,
            dailyTarget: typeof parsed?.dailyTarget === 'number' ? parsed.dailyTarget : fallback.dailyTarget,
            stopLine: legacyStopLine,
            teamMarketStopLoss: typeof parsed?.teamMarketStopLoss === 'number' ? parsed.teamMarketStopLoss : fallback.teamMarketStopLoss,
            severeMultiplier: typeof parsed?.severeMultiplier === 'number' ? parsed.severeMultiplier : fallback.severeMultiplier,
        });
    } catch {
        return fallback;
    }
}

export function getStrategyMatchSelectionStorageKey(scopeKey: string, dateKey: string, dayCutoffTime?: string | null): string {
    const cutoffKey = normalizeStrategyDayCutoffTime(dayCutoffTime).replace(':', '');
    return `${STRATEGY_MATCH_SELECTION_STORAGE_PREFIX}${scopeKey}:${dateKey}:${cutoffKey}`;
}

export function parseStoredMatchSelection(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
        return [];
    }
}

function getExpectedGamesByFormat(format?: string | null): number {
    const text = String(format || '').toUpperCase();
    const match = text.match(/BO\s*(\d+)/);
    const numeric = Number(match?.[1] || 0);
    if (numeric === 1) return 1;
    if (numeric === 3) return 2.5;
    if (numeric === 5) return 4;
    return 3;
}

function getFormatBucket(format?: string | null): FormatBucket {
    const text = String(format || '').toUpperCase();
    if (text.includes('BO1')) return 'BO1';
    if (text.includes('BO3')) return 'BO3';
    if (text.includes('BO5')) return 'BO5';
    return 'OTHER';
}

function getActualSeriesGames(match?: OddsMatchMeta | null): number | null {
    const value = Number(match?.gamesCount);
    if (Number.isFinite(value) && value > 0) return value;
    return null;
}

function createFormatExpectationSeed() {
    return {
        BO1: [] as number[],
        BO3: [] as number[],
        BO5: [] as number[],
        OTHER: [] as number[],
    };
}

function buildFormatExpectation(matches: OddsMatchMeta[]) {
    const seed = createFormatExpectationSeed();

    for (const match of matches) {
        const actualGames = getActualSeriesGames(match);
        if (!actualGames) continue;
        const bucket = getFormatBucket(match.format);
        seed[bucket].push(actualGames);
    }

    const avg = (values: number[], fallback: number) => {
        if (values.length === 0) return fallback;
        const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
        return Math.round(mean * 10) / 10;
    };

    return {
        BO1: avg(seed.BO1, 1),
        BO3: avg(seed.BO3, 2.5),
        BO5: avg(seed.BO5, 4),
        OTHER: avg(seed.OTHER, 3),
    };
}

function getExpectedSeriesGames(match: OddsMatchMeta, formatExpectation: Record<'BO1' | 'BO3' | 'BO5' | 'OTHER', number>) {
    const actualGames = getActualSeriesGames(match);
    if (actualGames !== null) return actualGames;
    return formatExpectation[getFormatBucket(match.format)];
}

function createParticipationSeed(): Record<FormatBucket, { seriesGames: number; engagedGames: number; entries: number; seriesCount: number }> {
    return {
        BO1: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
        BO3: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
        BO5: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
        OTHER: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
    };
}

function createMarketParticipationSeed(): Record<FormatBucket, Record<MarketTypeKey, { seriesGames: number; engagedGames: number; entries: number; seriesCount: number }>> {
    const createItem = () => ({ seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 });
    return {
        BO1: { winner: createItem(), handicap: createItem(), kills: createItem(), time: createItem() },
        BO3: { winner: createItem(), handicap: createItem(), kills: createItem(), time: createItem() },
        BO5: { winner: createItem(), handicap: createItem(), kills: createItem(), time: createItem() },
        OTHER: { winner: createItem(), handicap: createItem(), kills: createItem(), time: createItem() },
    };
}

function buildParticipationProfile(records: StoredOddsResult[], matchLookup: Map<string, OddsMatchMeta>, formatExpectation: Record<FormatBucket, number>): FormatParticipationProfile {
    const seed = createParticipationSeed();
    const grouped = new Map<string, StoredOddsResult[]>();

    for (const record of records) {
        if (!Number.isFinite(record.gameNumber) || record.gameNumber <= 0) continue;
        const list = grouped.get(record.matchId) || [];
        list.push(record);
        grouped.set(record.matchId, list);
    }

    for (const [matchId, matchRecords] of grouped.entries()) {
        const meta = matchLookup.get(matchId);
        const bucket = getFormatBucket(meta?.format);
        const uniqueGames = new Set(matchRecords.map((record) => record.gameNumber).filter((value) => Number.isFinite(value) && value > 0));
        const engagedGames = uniqueGames.size;
        if (engagedGames === 0) continue;

        const maxRecordedGame = Math.max(...Array.from(uniqueGames));
        const expectedSeriesGames = meta ? getExpectedSeriesGames(meta, formatExpectation) : maxRecordedGame;
        const seriesGames = Math.max(expectedSeriesGames, engagedGames, maxRecordedGame);

        seed[bucket].seriesGames += seriesGames;
        seed[bucket].engagedGames += engagedGames;
        seed[bucket].entries += matchRecords.length;
        seed[bucket].seriesCount += 1;
    }

    const defaults: Record<FormatBucket, { participationRate: number; entriesPerGame: number }> = {
        BO1: { participationRate: 1, entriesPerGame: 1.2 },
        BO3: { participationRate: 0.82, entriesPerGame: 1.35 },
        BO5: { participationRate: 0.72, entriesPerGame: 1.5 },
        OTHER: { participationRate: 0.8, entriesPerGame: 1.3 },
    };

    const overallSeriesGames = Object.values(seed).reduce((sum, item) => sum + item.seriesGames, 0);
    const overallEngagedGames = Object.values(seed).reduce((sum, item) => sum + item.engagedGames, 0);
    const overallEntries = Object.values(seed).reduce((sum, item) => sum + item.entries, 0);
    const overallParticipationRate = overallSeriesGames > 0 ? Math.min(Math.max(overallEngagedGames / overallSeriesGames, 0.3), 1) : null;
    const overallEntriesPerGame = overallEngagedGames > 0 ? Math.max(overallEntries / overallEngagedGames, 1) : null;

    const buildItem = (bucket: FormatBucket): FormatParticipationProfileItem => {
        const current = seed[bucket];
        const participationRate = current.seriesGames > 0 ? Math.min(Math.max(current.engagedGames / current.seriesGames, 0.3), 1) : overallParticipationRate ?? defaults[bucket].participationRate;
        const entriesPerGame = current.engagedGames > 0 ? Math.max(current.entries / current.engagedGames, 1) : overallEntriesPerGame ?? defaults[bucket].entriesPerGame;

        return {
            participationRate: Number(participationRate.toFixed(2)),
            entriesPerGame: Number(entriesPerGame.toFixed(2)),
            sampleSeries: current.seriesCount,
            sampleGames: current.engagedGames,
            sampleEntries: current.entries,
        };
    };

    return {
        BO1: buildItem('BO1'),
        BO3: buildItem('BO3'),
        BO5: buildItem('BO5'),
        OTHER: buildItem('OTHER'),
    };
}

function buildParticipationProfileByMarket(
    records: StoredOddsResult[],
    matchLookup: Map<string, OddsMatchMeta>,
    formatExpectation: Record<FormatBucket, number>,
    formatProfile: FormatParticipationProfile,
): FormatMarketParticipationProfile {
    const seed = createMarketParticipationSeed();
    const overallSeed: Record<MarketTypeKey, { seriesGames: number; engagedGames: number; entries: number; seriesCount: number }> = {
        winner: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
        handicap: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
        kills: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
        time: { seriesGames: 0, engagedGames: 0, entries: 0, seriesCount: 0 },
    };
    const grouped = new Map<string, StoredOddsResult[]>();

    for (const record of records) {
        if (!Number.isFinite(record.gameNumber) || record.gameNumber <= 0) continue;
        const marketKey = getMarketTypeKey(record);
        const groupKey = `${record.matchId}:${marketKey}`;
        const list = grouped.get(groupKey) || [];
        list.push(record);
        grouped.set(groupKey, list);
    }

    for (const [groupKey, marketRecords] of grouped.entries()) {
        const [matchId, marketKeyRaw] = groupKey.split(':');
        const marketKey = marketKeyRaw as MarketTypeKey;
        const meta = matchLookup.get(matchId);
        const bucket = getFormatBucket(meta?.format);
        const uniqueGames = new Set(marketRecords.map((record) => record.gameNumber).filter((value) => Number.isFinite(value) && value > 0));
        const engagedGames = uniqueGames.size;
        if (engagedGames === 0) continue;

        const maxRecordedGame = Math.max(...Array.from(uniqueGames));
        const expectedSeriesGames = meta ? getExpectedSeriesGames(meta, formatExpectation) : maxRecordedGame;
        const seriesGames = Math.max(expectedSeriesGames, engagedGames, maxRecordedGame);

        seed[bucket][marketKey].seriesGames += seriesGames;
        seed[bucket][marketKey].engagedGames += engagedGames;
        seed[bucket][marketKey].entries += marketRecords.length;
        seed[bucket][marketKey].seriesCount += 1;

        overallSeed[marketKey].seriesGames += seriesGames;
        overallSeed[marketKey].engagedGames += engagedGames;
        overallSeed[marketKey].entries += marketRecords.length;
        overallSeed[marketKey].seriesCount += 1;
    }

    const defaults: Record<MarketTypeKey, { participationRate: number; entriesPerGame: number }> = {
        winner: { participationRate: 0.35, entriesPerGame: 1 },
        handicap: { participationRate: 0.38, entriesPerGame: 1.05 },
        kills: { participationRate: 0.5, entriesPerGame: 1.3 },
        time: { participationRate: 0.45, entriesPerGame: 1.25 },
    };

    const buildItem = (bucket: FormatBucket, marketKey: MarketTypeKey): FormatParticipationProfileItem => {
        const current = seed[bucket][marketKey];
        const overall = overallSeed[marketKey];
        const formatFallback = formatProfile[bucket];
        const overallParticipationRate =
            overall.seriesGames > 0 ? Math.min(Math.max(overall.engagedGames / overall.seriesGames, 0.15), formatFallback.participationRate) : null;
        const overallEntriesPerGame = overall.engagedGames > 0 ? Math.max(overall.entries / overall.engagedGames, 1) : null;
        const participationRate =
            current.seriesGames > 0
                ? Math.min(Math.max(current.engagedGames / current.seriesGames, 0.15), formatFallback.participationRate)
                : overallParticipationRate ?? Math.min(defaults[marketKey].participationRate, formatFallback.participationRate);
        const entriesPerGame =
            current.engagedGames > 0
                ? Math.max(current.entries / current.engagedGames, 1)
                : overallEntriesPerGame ?? defaults[marketKey].entriesPerGame;

        return {
            participationRate: Number(participationRate.toFixed(2)),
            entriesPerGame: Number(entriesPerGame.toFixed(2)),
            sampleSeries: current.seriesCount,
            sampleGames: current.engagedGames,
            sampleEntries: current.entries,
        };
    };

    return {
        BO1: {
            winner: buildItem('BO1', 'winner'),
            handicap: buildItem('BO1', 'handicap'),
            kills: buildItem('BO1', 'kills'),
            time: buildItem('BO1', 'time'),
        },
        BO3: {
            winner: buildItem('BO3', 'winner'),
            handicap: buildItem('BO3', 'handicap'),
            kills: buildItem('BO3', 'kills'),
            time: buildItem('BO3', 'time'),
        },
        BO5: {
            winner: buildItem('BO5', 'winner'),
            handicap: buildItem('BO5', 'handicap'),
            kills: buildItem('BO5', 'kills'),
            time: buildItem('BO5', 'time'),
        },
        OTHER: {
            winner: buildItem('OTHER', 'winner'),
            handicap: buildItem('OTHER', 'handicap'),
            kills: buildItem('OTHER', 'kills'),
            time: buildItem('OTHER', 'time'),
        },
    };
}

function formatProjectedCount(value: number) {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1);
}

function formatDurationMinutes(value?: number | null) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-';
    return `${Math.round(value / 60)} 分钟`;
}

function normalizeOddsValue(value?: number | null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const normalized = numeric < 1 ? numeric + 1 : numeric;
    return Number(normalized.toFixed(2));
}

function getProfitMultiplierFromOdds(oddsValue?: number | null) {
    const normalized = normalizeOddsValue(oddsValue);
    if (normalized === null) return null;
    const payout = normalized - 1;
    if (!Number.isFinite(payout) || payout <= 0) return null;
    return Number(payout.toFixed(2));
}

function buildOddsPricingInsight(records: StoredOddsResult[]): OddsPricingInsight {
    const decidedRecords = records.filter((record) => record.settledStatus === 'WIN' || record.settledStatus === 'LOSE');
    const pricedSamples = decidedRecords
        .map((record) => {
            const actualOdds = getRecordActualOdds(record);
            const odds = normalizeOddsValue(actualOdds);
            const payout = getProfitMultiplierFromOdds(actualOdds);
            if (odds === null || payout === null) return null;
            return {
                odds,
                payout,
                status: record.settledStatus as 'WIN' | 'LOSE',
            };
        })
        .filter((item): item is { odds: number; payout: number; status: 'WIN' | 'LOSE' } => item !== null);

    if (pricedSamples.length === 0) {
        return {
            pricedSampleCount: 0,
            averageOdds: null,
            averagePayout: null,
            breakEvenWinRate: null,
            actualWinRate: null,
            lossRate: null,
            edge: null,
            expectedUnitReturn: null,
            payoutVolatility: null,
            conservativeKelly: null,
            lowPayoutRate: 0,
            veryLowPayoutRate: 0,
            negativeReturnRate: 0,
        };
    }

    const totalOdds = pricedSamples.reduce((sum, item) => sum + item.odds, 0);
    const totalPayout = pricedSamples.reduce((sum, item) => sum + item.payout, 0);
    const actualWinCount = pricedSamples.filter((item) => item.status === 'WIN').length;
    const actualWinRate = (actualWinCount / pricedSamples.length) * 100;
    const lossRate = 100 - actualWinRate;
    const averagePayout = totalPayout / pricedSamples.length;
    const breakEvenWinRate = (1 / (averagePayout + 1)) * 100;
    const unitReturns = pricedSamples.map((item) => (item.status === 'WIN' ? item.payout : -1));
    const expectedUnitReturn = unitReturns.reduce((sum, item) => sum + item, 0) / pricedSamples.length;
    const variance =
        unitReturns.reduce((sum, item) => sum + (item - expectedUnitReturn) ** 2, 0) / pricedSamples.length;
    const payoutVolatility = Math.sqrt(variance);
    const lowPayoutCount = pricedSamples.filter((item) => item.payout <= 0.85).length;
    const veryLowPayoutCount = pricedSamples.filter((item) => item.payout <= 0.7).length;
    const negativeReturnCount = pricedSamples.filter((item) => (item.status === 'WIN' ? item.payout : -1) < 0).length;
    const p = actualWinRate / 100;
    const q = 1 - p;
    const rawKelly = averagePayout > 0 ? (averagePayout * p - q) / averagePayout : 0;
    const sampleConfidence = Math.min(pricedSamples.length / 12, 1);
    const volatilityPenalty = Math.max(0.2, 1 - Math.max(payoutVolatility - 0.9, 0) * 0.45);
    const lowOddsPenalty = Math.max(0.2, 1 - lowPayoutCount / pricedSamples.length * 0.45);
    const conservativeKelly = Math.max(rawKelly, 0) * sampleConfidence * volatilityPenalty * lowOddsPenalty;

    return {
        pricedSampleCount: pricedSamples.length,
        averageOdds: Number((totalOdds / pricedSamples.length).toFixed(2)),
        averagePayout: Number(averagePayout.toFixed(2)),
        breakEvenWinRate: Number(breakEvenWinRate.toFixed(1)),
        actualWinRate: Number(actualWinRate.toFixed(1)),
        lossRate: Number(lossRate.toFixed(1)),
        edge: Number((actualWinRate - breakEvenWinRate).toFixed(1)),
        expectedUnitReturn: Number(expectedUnitReturn.toFixed(2)),
        payoutVolatility: Number(payoutVolatility.toFixed(2)),
        conservativeKelly: Number(conservativeKelly.toFixed(3)),
        lowPayoutRate: pricedSamples.length === 0 ? 0 : lowPayoutCount / pricedSamples.length,
        veryLowPayoutRate: pricedSamples.length === 0 ? 0 : veryLowPayoutCount / pricedSamples.length,
        negativeReturnRate: pricedSamples.length === 0 ? 0 : negativeReturnCount / pricedSamples.length,
    };
}

function getMetricRecentTrend(metric: TeamMetricSummary) {
    const wins = metric.recentMatches.filter((item) => item.total > 0).length;
    const loses = metric.recentMatches.filter((item) => item.total < 0).length;
    const consecutiveLose = metric.recentMatches.length >= 2 && metric.recentMatches.slice(0, 2).every((item) => item.total < 0);
    const consecutiveWin = metric.recentMatches.length >= 2 && metric.recentMatches.slice(0, 2).every((item) => item.total > 0);
    return { wins, loses, consecutiveLose, consecutiveWin };
}

function getRiskLevelLabel(riskLevel: MarketTypeAllocation['riskLevel']) {
    if (riskLevel === 'low') return '低风险';
    if (riskLevel === 'high') return '高风险';
    return '中风险';
}

function roundScoreValue(value: number) {
    return Number(value.toFixed(2));
}

function createScoreBreakdownItem(label: string, value: number, detail: string): StrategyScoreBreakdownItem {
    const normalized = roundScoreValue(value);
    return {
        label,
        value: normalized,
        detail,
        tone: normalized > 0.03 ? 'positive' : normalized < -0.03 ? 'negative' : 'neutral',
    };
}

function getAverage(values: Array<number | null | undefined>) {
    const filtered = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    if (filtered.length === 0) return null;
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function getExactLineFavorScore(metricKey: TeamMetricKey, performance: TeamPerformanceSnapshot) {
    if (metricKey === 'winner' || metricKey === 'handicap') {
        const weightedRate = getAverage([
            performance.weightedSeriesWinRate,
            performance.sameEventWeightedWinRate,
            performance.similarOpponentWeightedWinRate,
        ]);
        const headToHeadRate = performance.headToHeadCount > 0 ? performance.headToHeadWinRate : null;
        const confidenceRate = performance.confidenceScore;
        const base = getAverage([weightedRate, headToHeadRate, confidenceRate]);
        if (base === null) {
            return { value: 0, detail: '当前缺少足够的队伍强弱信号，默认不额外加减分。' };
        }
        const value = Math.max(Math.min((base - 50) / 55, 0.38), -0.38);
        return {
            value: roundScoreValue(value),
            detail: `强弱面综合 ${base.toFixed(1)}%，由加权胜率、同赛事、相似对手、交手和置信度共同给分。`,
        };
    }

    if (metricKey === 'killsOver' || metricKey === 'killsUnder') {
        const expectedKills = performance.expectedMatchKills;
        if (expectedKills === null) {
            return { value: 0, detail: '当前缺少击杀节奏预估，暂不追加节奏分。' };
        }
        const center = 26;
        const delta = metricKey === 'killsOver' ? expectedKills - center : center - expectedKills;
        const value = Math.max(Math.min(delta / 8, 0.32), -0.32);
        return {
            value: roundScoreValue(value),
            detail: `预估本场 ${expectedKills} 击杀，和当前大小盘方向的偏离度会直接影响节奏得分。`,
        };
    }

    if (metricKey === 'timeOver' || metricKey === 'timeUnder') {
        const expectedDuration = performance.expectedMatchDurationSec;
        if (expectedDuration === null) {
            return { value: 0, detail: '当前缺少时长预估，暂不追加时长分。' };
        }
        const center = 1980;
        const delta = metricKey === 'timeOver' ? expectedDuration - center : center - expectedDuration;
        const value = Math.max(Math.min(delta / 420, 0.32), -0.32);
        return {
            value: roundScoreValue(value),
            detail: `预估本场 ${formatDurationMinutes(expectedDuration)}，和当前时间盘方向的偏离度会直接影响时长得分。`,
        };
    }

    return { value: 0, detail: '当前盘口方向没有单独的节奏修正，保持中性。' };
}

function buildExactRecommendationScoreSummary(params: {
    team: TeamDailyBoardItem;
    summary: ExactMarketSummary;
    direction: StrategyExactMarketRecommendation['direction'];
    recentPositive: number;
    recentNegative: number;
    weights: StrategyScoreWeightsConfig['exactRecommendation'];
}) {
    const { team, summary, direction, recentPositive, recentNegative, weights } = params;
    const directionFactor = direction === 'increase' ? 1 : -1;
    const performance = team.performance;
    const weightedBase = getAverage([
        performance.weightedSeriesWinRate,
        performance.sameEventWeightedWinRate,
        performance.similarOpponentWeightedWinRate,
    ]);
    const formScore = weightedBase === null ? 0 : Math.max(Math.min(((weightedBase - 50) / 24) * directionFactor, 0.46), -0.46);
    const trendRaw = (recentPositive - recentNegative) * 0.18 * directionFactor;
    const lineFavor = getExactLineFavorScore(summary.metricKey, performance);
    const lineSupport = lineFavor.value * directionFactor;
    const winRateScore = summary.winRate === null ? 0 : Math.max(Math.min(((summary.winRate - 50) / 18) * directionFactor, 0.72), -0.72);
    const returnScore = summary.expectedUnitReturn === null ? 0 : Math.max(Math.min(summary.expectedUnitReturn * 1.1 * directionFactor, 1.1), -1.1);
    const lossSupport =
        summary.lossRate === null
            ? 0
            : direction === 'increase'
              ? Math.max(Math.min((50 - summary.lossRate) / 32, 0.42), -0.42)
              : Math.max(Math.min((summary.lossRate - 50) / 32, 0.42), -0.42);
    const sampleScore = Math.min(summary.settledCount, 6) * 0.05;

    const weightedItems = [
        createScoreBreakdownItem('历史胜率', winRateScore * weights.historicalWinRate, `该盘口历史胜率 ${formatWinRate(summary.winRate)}，直接决定这个档位的基础排序。`),
        createScoreBreakdownItem('历史回报', returnScore * weights.historicalReturn, `单注历史回报 ${summary.expectedUnitReturn?.toFixed(2) || '-'}，正回报抬高加注优先级，负回报抬高减仓优先级。`),
        createScoreBreakdownItem('最近走势', trendRaw * weights.recentTrend, `最近 3 个大场赢 ${recentPositive} 场、输 ${recentNegative} 场，越接近当前方向越加分。`),
        createScoreBreakdownItem('队伍模型', formScore * weights.teamModel, weightedBase === null ? '当前缺少加权胜率与同赛事样本，队伍模型保持中性。' : `队伍加权/同赛事/相似对手综合 ${weightedBase.toFixed(1)}%，用于修正纯盘口历史。`),
        createScoreBreakdownItem('节奏环境', lineSupport * weights.tempoEnvironment, lineFavor.detail),
        createScoreBreakdownItem('风险修正', (lossSupport + sampleScore) * weights.riskAdjustment, `输盘率 ${formatWinRate(summary.lossRate)}，样本 ${summary.settledCount} 条；高质量样本越多，方向判断越稳。`),
    ];
    const totalScore = roundScoreValue(weightedItems.reduce((sum, item) => sum + item.value, 0));
    return { totalScore, scoreBreakdown: weightedItems };
}

function buildExactAllocationScoreSummary(params: {
    team: TeamDailyBoardItem;
    summary: ExactMarketSummary;
    parentAllocation: MarketTypeAllocation;
    today?: ExactMarketSummary;
    todayWinStreak: number;
    todayLossStreak: number;
    weights: StrategyScoreWeightsConfig['exactAllocation'];
}) {
    const { team, summary, parentAllocation, today, todayWinStreak, todayLossStreak, weights } = params;
    const performance = team.performance;
    const lineFavor = getExactLineFavorScore(summary.metricKey, performance);
    const weightedBase = getAverage([
        performance.weightedSeriesWinRate,
        performance.sameEventWeightedWinRate,
        performance.similarOpponentWeightedWinRate,
        performance.headToHeadCount > 0 ? performance.headToHeadWinRate : null,
    ]);
    const todayHands = today ? today.counter.WIN + today.counter.LOSE + today.counter.PUSH + today.counter.PENDING : 0;
    const todayTotal = today?.total || 0;

    const baseScore = 0.35;
    const winRateScore = summary.winRate === null ? 0 : Math.max(summary.winRate - 50, -20) / 30;
    const returnScore = summary.expectedUnitReturn === null ? 0 : summary.expectedUnitReturn * 0.9;
    const pnlScore = summary.total > 0 ? 0.18 : summary.total < 0 ? -0.12 : 0;
    const lossPenalty = summary.lossRate !== null && summary.lossRate >= 50 ? -0.2 : 0;
    const sampleScore = Math.min(summary.settledCount, 6) * 0.05;
    const todayParticipationScore = today ? Math.min(todayHands, 4) * 0.18 : 0;
    const todayPnlScore = today ? (todayTotal > 0 ? 0.15 : todayTotal < 0 ? -0.08 : 0) : 0;
    const streakScore = Math.min(todayWinStreak, 3) * 0.1 - Math.min(todayLossStreak, 3) * 0.18;
    const teamModelScore = weightedBase === null ? 0 : Math.max(Math.min((weightedBase - 50) / 70, 0.28), -0.28);
    const tempoScore = lineFavor.value * 0.55;
    const parentScore = Math.max(Math.min((parentAllocation.suggestedShare - 0.25) * 0.35, 0.18), -0.18) + (parentAllocation.riskLevel === 'low' ? 0.08 : parentAllocation.riskLevel === 'high' ? -0.08 : 0);
    const volatilityScore =
        performance.volatilityScore === null
            ? 0
            : performance.volatilityScore >= 10.5
              ? -0.12
              : performance.volatilityScore <= 7.2
                ? 0.05
                : 0;

    const items = [
        createScoreBreakdownItem('基础分', baseScore * weights.base, '所有具体盘口先给基础进入分，避免样本少时完全失真。'),
        createScoreBreakdownItem('胜率分', winRateScore * weights.winRate, `该盘口历史胜率 ${formatWinRate(summary.winRate)}。`),
        createScoreBreakdownItem('回报分', returnScore * weights.historicalReturn, `单注历史回报 ${summary.expectedUnitReturn?.toFixed(2) || '-'}。`),
        createScoreBreakdownItem('历史盈亏', pnlScore * weights.historicalPnl, `历史总输赢 ${summary.total >= 0 ? '+' : ''}${summary.total}。`),
        createScoreBreakdownItem('样本与风险', (sampleScore + lossPenalty) * weights.sampleAndRisk, `样本 ${summary.settledCount} 条，输盘率 ${formatWinRate(summary.lossRate)}。`),
createScoreBreakdownItem('当日手感', (todayParticipationScore + todayPnlScore + streakScore) * weights.dailyForm, today ? `今日已录 ${todayHands} 手，输赢 ${todayTotal >= 0 ? '+' : ''}${todayTotal}，连赢 ${todayWinStreak} 局，连亏 ${todayLossStreak} 局（按不同小局统计）。` : '今日该盘口还没有下注记录，手感分保持中性。'),
        createScoreBreakdownItem('队伍模型', teamModelScore * weights.teamModel, weightedBase === null ? '当前缺少加权队伍样本，队伍模型保持中性。' : `队伍加权/同赛事/相似对手/交手综合 ${weightedBase.toFixed(1)}%。`),
        createScoreBreakdownItem('节奏环境', tempoScore * weights.tempoEnvironment, lineFavor.detail),
        createScoreBreakdownItem('父级分仓', parentScore * weights.parentAllocation, `继承 ${parentAllocation.label} 类型预算 ${Math.round(parentAllocation.suggestedShare * 100)}%，风险等级 ${getRiskLevelLabel(parentAllocation.riskLevel)}。`),
        createScoreBreakdownItem('波动修正', volatilityScore * weights.volatilityAdjustment, performance.volatilityScore === null ? '当前缺少波动样本，暂不修正。' : `队伍波动分 ${performance.volatilityScore.toFixed(2)}，高波动会压低具体盘口预算。`),
    ];

    const totalScore = roundScoreValue(Math.max(items.reduce((sum, item) => sum + item.value, 0), 0.05));
    return { totalScore, scoreBreakdown: items };
}

function buildExactMarketSignalSummary(team: TeamDailyBoardItem, summary: ExactMarketSummary) {
    const performance = team.performance;
    const marketType = getMarketTypeKeyFromMetric(summary.metricKey);
    const formatRate = (value: number | null | undefined) => formatWinRate(value ?? null);

    const historyLine = `盘口样本 ${summary.settledCount} 条，胜率 ${formatRate(summary.winRate)}，输盘率 ${formatRate(summary.lossRate)}，单注历史回报 ${summary.expectedUnitReturn?.toFixed(2) || '-'}。`;
    const marketLine =
        marketType === 'winner' || marketType === 'handicap'
            ? `队伍加权胜率 ${formatRate(performance.weightedSeriesWinRate)}，同赛事权重 ${formatRate(performance.sameEventWeightedWinRate)}，相似对手修正 ${formatRate(performance.similarOpponentWeightedWinRate)}。`
            : marketType === 'kills'
              ? `预估节奏 ${performance.expectedMatchKills === null ? '-' : `${performance.expectedMatchKills} 击杀`}，近况 ${formatRate(performance.recentSeriesWinRate)}，对阵置信 ${performance.confidenceScore === null ? '-' : `${performance.confidenceScore}%`}。`
              : `预估时长 ${formatDurationMinutes(performance.expectedMatchDurationSec)}，近况 ${formatRate(performance.recentSeriesWinRate)}，对阵置信 ${performance.confidenceScore === null ? '-' : `${performance.confidenceScore}%`}。`;
    const headToHeadLine =
        performance.opponentName && performance.headToHeadCount > 0
            ? `对阵 ${performance.opponentName} 历史 ${performance.headToHeadCount} 场，胜率 ${formatRate(performance.headToHeadWinRate)}，盘口均线偏移 ${summary.averageLineDelta?.toFixed(2) || '-'}。`
            : `盘口均线偏移 ${summary.averageLineDelta?.toFixed(2) || '-'}，平均赔率 ${summary.averageOdds?.toFixed(2) || '-'}，平均结算 ${summary.averageSettlement?.toFixed(2) || '-'}。`;

    return { marketType, historyLine, marketLine, headToHeadLine };
}

function buildExactRecommendationBasisSummary(params: {
    team: TeamDailyBoardItem;
    summary: ExactMarketSummary;
    direction: StrategyExactMarketRecommendation['direction'];
    recentPositive: number;
    recentNegative: number;
}): string[] {
    const { team, summary, direction, recentPositive, recentNegative } = params;
    const { historyLine, marketLine, headToHeadLine } = buildExactMarketSignalSummary(team, summary);
    const trendLine =
        direction === 'increase'
            ? `最近 3 个大场该盘口赢 ${recentPositive} 场、输 ${recentNegative} 场，当前更适合优先观察这个具体档位的放量机会。`
            : `最近 3 个大场该盘口赢 ${recentPositive} 场、输 ${recentNegative} 场，当前更适合先压低这个具体档位的参与强度。`;
    const pricingLine =
        summary.expectedUnitReturn !== null
            ? `赔率与回报口径：平均赔率 ${summary.averageOdds?.toFixed(2) || '-'}，单注历史回报 ${summary.expectedUnitReturn.toFixed(2)}，平均下注 ${summary.averageStake?.toFixed(2) || '-'}。`
            : '赔率样本仍偏少，当前以队伍历史、同赛事覆盖、相似对手修正和比赛节奏信号为主。';

    return [historyLine, marketLine, headToHeadLine, trendLine, pricingLine];
}

function buildExactAllocationBasisSummary(params: {
    team: TeamDailyBoardItem;
    summary: ExactMarketSummary;
    parentAllocation: MarketTypeAllocation;
    suggestedShare: number;
    rawScore: number;
    todayRecordedHands: number;
    todayRecordedTotal: number;
    todayWinStreak: number;
    todayLossStreak: number;
}): string[] {
    const {
        team,
        summary,
        parentAllocation,
        suggestedShare,
        rawScore,
        todayRecordedHands,
        todayRecordedTotal,
        todayWinStreak,
        todayLossStreak,
    } = params;
    const { historyLine, marketLine, headToHeadLine } = buildExactMarketSignalSummary(team, summary);
    const parentLine = `继承 ${parentAllocation.label} 类型预算 ${Math.round(parentAllocation.suggestedShare * 100)}%，当前具体盘口分到 ${Math.round(suggestedShare * 100)}%，父级风险 ${getRiskLevelLabel(parentAllocation.riskLevel)}。`;
    const liveLine =
        todayRecordedHands > 0
                    ? `今日该盘口已录 ${todayRecordedHands} 手，输赢 ${todayRecordedTotal >= 0 ? '+' : ''}${todayRecordedTotal}，连赢 ${todayWinStreak} 局，连亏 ${todayLossStreak} 局（按不同小局统计）。`
            : '今日该盘口还没有实际下注样本，当前预算先按历史质量与模型评分保守投放。';
    const scoreLine =
        summary.expectedUnitReturn !== null
            ? `原始评分 ${rawScore.toFixed(2)}，样本 ${summary.settledCount} 条，平均赔率 ${summary.averageOdds?.toFixed(2) || '-'}，单注历史回报 ${summary.expectedUnitReturn.toFixed(2)}。`
            : `原始评分 ${rawScore.toFixed(2)}，样本 ${summary.settledCount} 条；赔率样本不足时，优先继承父级分仓与队伍历史信号。`;

    return [parentLine, historyLine, marketLine, headToHeadLine, liveLine, scoreLine];
}

function getMetricKeysForRecord(record: StoredOddsResult, teamId: string): TeamMetricKey[] {
    if (record.type === 'WINNER' && ((record.side === 'LEFT' && record.teamAId === teamId) || (record.side === 'RIGHT' && record.teamBId === teamId))) {
        return ['winner'];
    }
    if (record.type === 'HANDICAP' && ((record.side === 'LEFT' && record.teamAId === teamId) || (record.side === 'RIGHT' && record.teamBId === teamId))) {
        return ['handicap'];
    }
    const involvesTeam = record.teamAId === teamId || record.teamBId === teamId;
    if (!involvesTeam) return [];
    if (record.type === 'KILLS') return ['killsAll', record.side === 'LEFT' ? 'killsOver' : 'killsUnder'];
    if (record.type === 'TIME') return ['timeAll', record.side === 'LEFT' ? 'timeOver' : 'timeUnder'];
    return [];
}

function getRecommendationCandidates(regionBoards: RegionDailyBoard[], historyRecords: StoredOddsResult[]): DailyStrategyBoard['recommendations'] {
    const increase: StrategyRecommendation[] = [];
    const decrease: StrategyRecommendation[] = [];

    for (const regionBoard of regionBoards) {
        for (const team of regionBoard.teams) {
            for (const metricKey of DISPLAY_METRIC_KEYS) {
                const metric = team.historySummary.metrics[metricKey];
                const decidedCount = metric.counter.WIN + metric.counter.LOSE;
                if (decidedCount < 3) continue;

                const trend = getMetricRecentTrend(metric);
                const form = team.performance;
                const metricLabel = TEAM_METRIC_LABELS[metricKey];
                const metricRecords = historyRecords.filter((record) => team.aliasIds.some((aliasId) => getMetricKeysForRecord(record, aliasId).includes(metricKey)));
                const pricing = buildOddsPricingInsight(metricRecords);
                const positiveEdge = pricing.edge !== null && pricing.edge >= 4;
                const negativeEdge = pricing.edge !== null && pricing.edge <= -4;
                const lowPayoutPressure = pricing.lowPayoutRate >= 0.5;
                const positiveReturn = pricing.expectedUnitReturn !== null && pricing.expectedUnitReturn > 0;
                const negativeReturn = pricing.expectedUnitReturn !== null && pricing.expectedUnitReturn < 0;
                const highLossRate = pricing.lossRate !== null && pricing.lossRate >= 48;
                const highVolatility = pricing.payoutVolatility !== null && pricing.payoutVolatility >= 0.95;
                const strongSeriesForm = (form.recentSeriesWinRate ?? 0) >= 60 || (form.seriesWinRate ?? 0) >= 58;
                const weakSeriesForm = (form.recentSeriesWinRate ?? 100) <= 40 || (form.seriesWinRate ?? 100) <= 45;
                const sameOpponentAdvantage = form.headToHeadCount >= 2 && (form.headToHeadWinRate ?? 0) >= 60;
                const sameOpponentDisadvantage = form.headToHeadCount >= 2 && (form.headToHeadWinRate ?? 100) <= 40;
                const weightedAdvantage = (form.weightedSeriesWinRate ?? 0) >= 58 || (form.sameEventWeightedWinRate ?? 0) >= 60 || (form.similarOpponentWeightedWinRate ?? 0) >= 58;
                const weightedDisadvantage = (form.weightedSeriesWinRate ?? 100) <= 42 || (form.sameEventWeightedWinRate ?? 100) <= 40 || (form.similarOpponentWeightedWinRate ?? 100) <= 42;
                const pricingReason =
                    pricing.pricedSampleCount > 0 && pricing.breakEvenWinRate !== null
                        ? `按 1.x 亚洲盘换算后的盈亏平衡胜率约 ${formatWinRate(pricing.breakEvenWinRate)}，实际胜率 ${formatWinRate(pricing.actualWinRate)}，输盘率 ${formatWinRate(pricing.lossRate)}。`
                        : '当前历史样本赔率不足，先按输赢和胜率做保守判断。';
                const formReason = `队伍大场历史胜率 ${formatWinRate(form.seriesWinRate)}，加权胜率 ${formatWinRate(form.weightedSeriesWinRate)}，近 ${form.recentSeriesCount || 0} 场大场胜率 ${formatWinRate(form.recentSeriesWinRate)}。`;
                const headToHeadReason =
                    form.opponentName && form.headToHeadCount > 0
                        ? ` 对阵 ${form.opponentName} 历史 ${form.headToHeadCount} 场，胜率 ${formatWinRate(form.headToHeadWinRate)}。`
                        : '';
                const environmentReason =
                    form.expectedMatchKills !== null || form.expectedMatchDurationSec !== null
                        ? ` 预估本场节奏 ${form.expectedMatchKills === null ? '-' : `${form.expectedMatchKills} 击杀`} / ${form.expectedMatchDurationSec === null ? '-' : `${Math.round(form.expectedMatchDurationSec / 60)} 分钟`}，置信 ${form.confidenceScore === null ? '-' : `${form.confidenceScore}%`}。`
                        : '';

                if (
                    (metric.winRate || 0) >= 60 &&
                    metric.total > 0 &&
                    (trend.wins >= 2 || strongSeriesForm || sameOpponentAdvantage || weightedAdvantage) &&
                    !negativeEdge &&
                    !highLossRate &&
                    !highVolatility &&
                    !sameOpponentDisadvantage &&
                    !weightedDisadvantage &&
                    (!lowPayoutPressure || positiveReturn)
                ) {
                    increase.push({
                        id: `${team.teamId}-${metricKey}-increase`,
                        direction: 'increase',
                        teamName: team.teamName,
                        region: regionBoard.region,
                        metricKey,
                        metricLabel,
                        winRate: metric.winRate,
                        total: metric.total,
                        averageOdds: pricing.averageOdds,
                        averagePayout: pricing.averagePayout,
                        breakEvenWinRate: pricing.breakEvenWinRate,
                        expectedUnitReturn: pricing.expectedUnitReturn,
                        lossRate: pricing.lossRate,
                        payoutVolatility: pricing.payoutVolatility,
                        reason: `盘口历史胜率 ${formatWinRate(metric.winRate)}，最近 3 个大场赢 ${trend.wins} 场。${formReason}${headToHeadReason}${environmentReason}${pricingReason}${positiveReturn ? ` 单注历史回报约 ${pricing.expectedUnitReturn?.toFixed(2)}。` : ''}${pricing.conservativeKelly !== null ? ` 建议单注仓位系数约 ${(pricing.conservativeKelly * 100).toFixed(1)}%。` : ''}`,
                    });
                }

                if (
                    ((metric.winRate || 0) <= 40 && metric.total < 0 && (trend.loses >= 2 || trend.consecutiveLose)) ||
                    negativeEdge ||
                    highLossRate ||
                    highVolatility ||
                    weakSeriesForm ||
                    sameOpponentDisadvantage ||
                    weightedDisadvantage ||
                    (lowPayoutPressure && negativeReturn)
                ) {
                    decrease.push({
                        id: `${team.teamId}-${metricKey}-decrease`,
                        direction: 'decrease',
                        teamName: team.teamName,
                        region: regionBoard.region,
                        metricKey,
                        metricLabel,
                        winRate: metric.winRate,
                        total: metric.total,
                        averageOdds: pricing.averageOdds,
                        averagePayout: pricing.averagePayout,
                        breakEvenWinRate: pricing.breakEvenWinRate,
                        expectedUnitReturn: pricing.expectedUnitReturn,
                        lossRate: pricing.lossRate,
                        payoutVolatility: pricing.payoutVolatility,
                        reason: `盘口历史胜率 ${formatWinRate(metric.winRate)}，最近 3 个大场输 ${trend.loses} 场。${formReason}${headToHeadReason}${environmentReason}${pricingReason}${negativeReturn ? ` 单注历史回报约 ${pricing.expectedUnitReturn?.toFixed(2)}，建议优先减仓。` : '建议优先减仓。'}${highVolatility ? ' 当前单注回报波动偏大，不适合放大仓位。' : ''}`,
                    });
                }
            }
        }
    }

    const sorter = (a: StrategyRecommendation, b: StrategyRecommendation) => {
        const scoreA = a.expectedUnitReturn ?? (a.direction === 'increase' ? -999 : 999);
        const scoreB = b.expectedUnitReturn ?? (b.direction === 'increase' ? -999 : 999);
        if (a.direction === 'increase') {
            if (scoreB !== scoreA) return scoreB - scoreA;
            return (b.winRate ?? 0) - (a.winRate ?? 0);
        }
        if (scoreA !== scoreB) return scoreA - scoreB;
        return (a.winRate ?? 100) - (b.winRate ?? 100);
    };

    return {
        increase: increase.sort(sorter).slice(0, 6),
        decrease: decrease.sort(sorter).slice(0, 6),
        exactIncrease: [],
        exactDecrease: [],
    };
}

function getExactRecommendationCandidates(
    regionBoards: RegionDailyBoard[],
    historyRecords: StoredOddsResult[],
    matchLookup: Map<string, OddsMatchMeta>,
    strategyScoreWeights: StrategyScoreWeightsConfig,
    strategyScorePresetOverrides?: StrategyScorePresetOverrides,
): Pick<DailyStrategyBoard['recommendations'], 'exactIncrease' | 'exactDecrease'> {
    const exactIncrease: StrategyExactMarketRecommendation[] = [];
    const exactDecrease: StrategyExactMarketRecommendation[] = [];
    const resolveWeights = createStrategyScoreWeightResolver(strategyScoreWeights, strategyScorePresetOverrides);

    for (const regionBoard of regionBoards) {
        for (const team of regionBoard.teams) {
            const summaries = buildExactMarketSummaries(
                historyRecords.filter((record) => team.aliasIds.includes(String(record.teamAId || '')) || team.aliasIds.includes(String(record.teamBId || ''))),
                { id: team.teamId, name: team.teamName, shortName: team.teamName, aliasIds: team.aliasIds },
                matchLookup,
            );

            for (const summary of summaries) {
                const recentPositive = summary.recentMatches.filter((item) => item.total > 0).length;
                const recentNegative = summary.recentMatches.filter((item) => item.total < 0).length;
                const positiveReturn = summary.expectedUnitReturn !== null && summary.expectedUnitReturn > 0;
                const negativeReturn = summary.expectedUnitReturn !== null && summary.expectedUnitReturn < 0;
                const strongWinRate = summary.winRate !== null && summary.winRate >= 58;
                const weakWinRate = summary.winRate !== null && summary.winRate <= 42;
                const highLossRate = summary.lossRate !== null && summary.lossRate >= 52;

                const baseItem: Omit<StrategyExactMarketRecommendation, 'id' | 'direction' | 'reason' | 'basisSummary' | 'totalScore' | 'scoreBreakdown'> = {
                    teamName: team.teamName,
                    region: regionBoard.region,
                    metricKey: summary.metricKey,
                    metricLabel: TEAM_METRIC_LABELS[summary.metricKey],
                    marketLabel: summary.label,
                    total: summary.total,
                    winRate: summary.winRate,
                    averageOdds: summary.averageOdds,
                    expectedUnitReturn: summary.expectedUnitReturn,
                    lossRate: summary.lossRate,
                    averageStake: summary.averageStake,
                    averageSettlement: summary.averageSettlement,
                    averageLineDelta: summary.averageLineDelta,
                    sampleCount: summary.settledCount,
                };

                if (summary.settledCount >= 2 && strongWinRate && positiveReturn && recentPositive >= 1) {
                    const scoreSummary = buildExactRecommendationScoreSummary({
                        team,
                        summary,
                        direction: 'increase',
                        recentPositive,
                        recentNegative,
                        weights: resolveWeights(summary.metricKey).exactRecommendation,
                    });
                    exactIncrease.push({
                        ...baseItem,
                        id: `${team.teamId}-${summary.key}-exact-increase`,
                        direction: 'increase',
                        reason: `${summary.label} 历史胜率 ${formatWinRate(summary.winRate)}，单注历史回报 ${summary.expectedUnitReturn?.toFixed(2) || '-'}，最近 3 个大场赢 ${recentPositive} 场，可作为具体盘口优先加注候选。`,
                        basisSummary: buildExactRecommendationBasisSummary({
                            team,
                            summary,
                            direction: 'increase',
                            recentPositive,
                            recentNegative,
                        }),
                        totalScore: scoreSummary.totalScore,
                        scoreBreakdown: scoreSummary.scoreBreakdown,
                    });
                }

                if (summary.settledCount >= 2 && ((weakWinRate && recentNegative >= 1) || negativeReturn || highLossRate)) {
                    const scoreSummary = buildExactRecommendationScoreSummary({
                        team,
                        summary,
                        direction: 'decrease',
                        recentPositive,
                        recentNegative,
                        weights: resolveWeights(summary.metricKey).exactRecommendation,
                    });
                    exactDecrease.push({
                        ...baseItem,
                        id: `${team.teamId}-${summary.key}-exact-decrease`,
                        direction: 'decrease',
                        reason: `${summary.label} 历史胜率 ${formatWinRate(summary.winRate)}，单注历史回报 ${summary.expectedUnitReturn?.toFixed(2) || '-'}，输盘率 ${formatWinRate(summary.lossRate)}，建议优先减少这个具体盘口档位的投注。`,
                        basisSummary: buildExactRecommendationBasisSummary({
                            team,
                            summary,
                            direction: 'decrease',
                            recentPositive,
                            recentNegative,
                        }),
                        totalScore: scoreSummary.totalScore,
                        scoreBreakdown: scoreSummary.scoreBreakdown,
                    });
                }
            }
        }
    }

    const sorter = (a: StrategyExactMarketRecommendation, b: StrategyExactMarketRecommendation) => {
        const scoreA = a.expectedUnitReturn ?? (a.direction === 'increase' ? -999 : 999);
        const scoreB = b.expectedUnitReturn ?? (b.direction === 'increase' ? -999 : 999);
        if (a.direction === 'increase') {
            if (scoreB !== scoreA) return scoreB - scoreA;
            return (b.winRate ?? 0) - (a.winRate ?? 0);
        }
        if (scoreA !== scoreB) return scoreA - scoreB;
        return (a.winRate ?? 100) - (b.winRate ?? 100);
    };

    return {
        exactIncrease: exactIncrease.sort(sorter).slice(0, 8),
        exactDecrease: exactDecrease.sort(sorter).slice(0, 8),
    };
}

function buildExactMarketAllocations(params: {
    regionBoards: RegionDailyBoard[];
    historyRecords: StoredOddsResult[];
    dailyRecords: StoredOddsResult[];
    matchLookup: Map<string, OddsMatchMeta>;
    marketTypeAllocations: MarketTypeAllocation[];
    strategyScoreWeights: StrategyScoreWeightsConfig;
    strategyScorePresetOverrides?: StrategyScorePresetOverrides;
}): StrategyExactMarketAllocation[] {
    const { regionBoards, historyRecords, dailyRecords, matchLookup, marketTypeAllocations, strategyScoreWeights, strategyScorePresetOverrides } = params;
    const allocationByType = new Map<MarketTypeKey, MarketTypeAllocation>(marketTypeAllocations.map((item) => [item.key, item]));
    const exactAllocations: StrategyExactMarketAllocation[] = [];
    const resolveWeights = createStrategyScoreWeightResolver(strategyScoreWeights, strategyScorePresetOverrides);

    for (const regionBoard of regionBoards) {
        for (const team of regionBoard.teams) {
            const summaries = buildExactMarketSummaries(
                historyRecords.filter((record) => team.aliasIds.includes(String(record.teamAId || '')) || team.aliasIds.includes(String(record.teamBId || ''))),
                { id: team.teamId, name: team.teamName, shortName: team.teamName, aliasIds: team.aliasIds },
                matchLookup,
            );
            const dailySummaries = buildExactMarketSummaries(
                dailyRecords.filter((record) => team.aliasIds.includes(String(record.teamAId || '')) || team.aliasIds.includes(String(record.teamBId || ''))),
                { id: team.teamId, name: team.teamName, shortName: team.teamName, aliasIds: team.aliasIds },
                matchLookup,
            );
            const dailyByKey = new Map<string, ExactMarketSummary>(dailySummaries.map((summary) => [summary.key, summary]));
            const todayLossStreakByKey = getTodayExactMarketStreaks(dailyRecords, team.aliasIds, matchLookup, 'LOSE');
            const todayWinStreakByKey = getTodayExactMarketStreaks(dailyRecords, team.aliasIds, matchLookup, 'WIN');

            const groupedByType = new Map<MarketTypeKey, ExactMarketSummary[]>();
            for (const summary of summaries) {
                const marketType = getMarketTypeKeyFromMetric(summary.metricKey);
                const list = groupedByType.get(marketType) || [];
                list.push(summary);
                groupedByType.set(marketType, list);
            }

            for (const [marketType, typeSummaries] of groupedByType.entries()) {
                const parentAllocation = allocationByType.get(marketType);
                if (!parentAllocation || parentAllocation.remainingMarkets <= 0 || parentAllocation.suggestedRemainingBudget <= 0) continue;

                const scored = typeSummaries
                    .filter((summary) => summary.settledCount >= 1)
                    .map((summary) => {
                        const today = dailyByKey.get(summary.key);
                        const todayWinStreak = todayWinStreakByKey.get(summary.key) || 0;
                        const todayLossStreak = todayLossStreakByKey.get(summary.key) || 0;
                        const allocationScore = buildExactAllocationScoreSummary({
                            team,
                            summary,
                            parentAllocation,
                            today,
                            todayWinStreak,
                            todayLossStreak,
                            weights: resolveWeights(summary.metricKey).exactAllocation,
                        });
                        return {
                            summary,
                            score: allocationScore.totalScore,
                            scoreBreakdown: allocationScore.scoreBreakdown,
                            today,
                            todayWinStreak,
                            todayLossStreak,
                        };
                    })
                    .sort((a, b) => b.score - a.score);

                if (scored.length === 0) continue;

                const limited = scored.slice(0, Math.max(parentAllocation.remainingMarkets, 3));
                const totalScore = limited.reduce((sum, item) => sum + item.score, 0) || limited.length;

                for (const item of limited) {
                    const share = item.score / totalScore;
                    const suggestedBudget = normalizeHundredAmount(parentAllocation.suggestedRemainingBudget * share, 0);
                    const suggestedHands = Math.max(1, Math.round(parentAllocation.remainingMarkets * share));
                    const suggestedSingleStake = suggestedHands > 0 ? normalizeHundredAmount(suggestedBudget / suggestedHands, parentAllocation.suggestedSingleMarketBudget) : parentAllocation.suggestedSingleMarketBudget;
                    const todayRecordedHands = item.today ? item.today.counter.WIN + item.today.counter.LOSE + item.today.counter.PUSH + item.today.counter.PENDING : 0;
                    const todayRecordedTotal = item.today ? item.today.total : 0;
                    const livePriority: StrategyExactMarketAllocation['livePriority'] =
                        todayRecordedHands === 0 ? 'idle' : todayRecordedTotal >= 0 ? 'positive' : 'negative';

                    exactAllocations.push({
                        id: `${team.teamId}-${item.summary.key}-budget`,
                        teamName: team.teamName,
                        region: regionBoard.region,
                        metricKey: item.summary.metricKey,
                        metricLabel: TEAM_METRIC_LABELS[item.summary.metricKey],
                        marketLabel: item.summary.label,
                        suggestedShare: Number(share.toFixed(2)),
                        suggestedBudget,
                        suggestedSingleStake,
                        suggestedHands,
                        averageOdds: item.summary.averageOdds,
                        expectedUnitReturn: item.summary.expectedUnitReturn,
                        winRate: item.summary.winRate,
                        lossRate: item.summary.lossRate,
                        sampleCount: item.summary.settledCount,
                        averageStake: item.summary.averageStake,
                        averageSettlement: item.summary.averageSettlement,
                        averageLineDelta: item.summary.averageLineDelta,
                        todayRecordedHands,
                        todayRecordedTotal,
                        todayWinStreak: item.todayWinStreak,
                        todayLossStreak: item.todayLossStreak,
                        livePriority,
                        reason:
                            item.todayLossStreak >= 2
                ? `${item.summary.label} 按不同小局统计，今天已连续亏损 ${item.todayLossStreak} 局，预算已自动下调，避免继续在同一具体盘口上放大风险。`
                                : item.todayWinStreak >= 2
                    ? `${item.summary.label} 按不同小局统计，今天已连续盈利 ${item.todayWinStreak} 局，预算已优先保留，继续跟踪这条具体盘口的当日手感。`
                                : item.today && item.today.total !== 0
                                  ? `${item.summary.label} 今天已录 ${item.today.counter.WIN + item.today.counter.LOSE + item.today.counter.PUSH + item.today.counter.PENDING} 手，当前输赢 ${item.today.total >= 0 ? '+' : ''}${item.today.total}，预算已优先参考你今天的实际参与情况。`
                                  : item.summary.expectedUnitReturn !== null && item.summary.expectedUnitReturn > 0
                                  ? `${item.summary.label} 的历史单注回报 ${item.summary.expectedUnitReturn.toFixed(2)}，适合在 ${TEAM_METRIC_LABELS[item.summary.metricKey]} 的预算池内优先分到更多资金。`
                                  : `${item.summary.label} 的历史样本 ${item.summary.settledCount} 条，当前先按 ${TEAM_METRIC_LABELS[item.summary.metricKey]} 预算池做保守分配。`,
                        basisSummary: buildExactAllocationBasisSummary({
                            team,
                            summary: item.summary,
                            parentAllocation,
                            suggestedShare: Number(share.toFixed(2)),
                            rawScore: item.score,
                            todayRecordedHands,
                            todayRecordedTotal,
                            todayWinStreak: item.todayWinStreak,
                            todayLossStreak: item.todayLossStreak,
                        }),
                        totalScore: item.score,
                        scoreBreakdown: item.scoreBreakdown,
                    });
                }
            }
        }
    }

    return exactAllocations
        .sort((a, b) => {
            const priorityScore = (value: StrategyExactMarketAllocation['livePriority']) =>
                value === 'positive' ? 3 : value === 'negative' ? 2 : 1;
            const priorityDiff = priorityScore(b.livePriority) - priorityScore(a.livePriority);
            if (priorityDiff !== 0) return priorityDiff;
            if (a.livePriority === 'negative' && b.livePriority === 'negative' && a.todayLossStreak !== b.todayLossStreak) {
                return a.todayLossStreak - b.todayLossStreak;
            }
            if (b.suggestedBudget !== a.suggestedBudget) return b.suggestedBudget - a.suggestedBudget;
            const aReturn = a.expectedUnitReturn ?? -999;
            const bReturn = b.expectedUnitReturn ?? -999;
            if (bReturn !== aReturn) return bReturn - aReturn;
            return (b.winRate ?? 0) - (a.winRate ?? 0);
        })
        .slice(0, 12);
}

function buildMatchEnvironmentSummary(selectedMatches: OddsMatchMeta[], regionBoards: RegionDailyBoard[]): MatchEnvironmentSummary {
    const teamLookup = new Map<string, TeamDailyBoardItem>();
    for (const regionBoard of regionBoards) {
        for (const team of regionBoard.teams) {
            for (const aliasId of team.aliasIds) {
                teamLookup.set(aliasId, team);
            }
        }
    }

    let totalConfidenceGap = 0;
    let confidenceCount = 0;
    let totalExpectedKills = 0;
    let expectedKillsCount = 0;
    let totalExpectedDuration = 0;
    let expectedDurationCount = 0;
    let totalVolatility = 0;
    let volatilityCount = 0;
    let sameEventCoverageSum = 0;
    let sameEventCoverageCount = 0;

    for (const match of selectedMatches) {
        const teamA = teamLookup.get(String(match.teamAId || ''));
        const teamB = teamLookup.get(String(match.teamBId || ''));
        if (!teamA || !teamB) continue;

        const confidenceA = teamA.performance.confidenceScore;
        const confidenceB = teamB.performance.confidenceScore;
        if (confidenceA !== null && confidenceB !== null) {
            totalConfidenceGap += Math.abs(confidenceA - confidenceB);
            confidenceCount += 1;
        }

        const expectedKillsValues = [teamA.performance.expectedMatchKills, teamB.performance.expectedMatchKills].filter((value): value is number => value !== null && value !== undefined);
        if (expectedKillsValues.length > 0) {
            totalExpectedKills += expectedKillsValues.reduce((sum, value) => sum + value, 0) / expectedKillsValues.length;
            expectedKillsCount += 1;
        } else if (match.avgTotalKills !== null && match.avgTotalKills !== undefined) {
            totalExpectedKills += match.avgTotalKills;
            expectedKillsCount += 1;
        }

        const expectedDurationValues = [teamA.performance.expectedMatchDurationSec, teamB.performance.expectedMatchDurationSec].filter((value): value is number => value !== null && value !== undefined);
        if (expectedDurationValues.length > 0) {
            totalExpectedDuration += expectedDurationValues.reduce((sum, value) => sum + value, 0) / expectedDurationValues.length;
            expectedDurationCount += 1;
        } else if (match.avgGameDurationSec !== null && match.avgGameDurationSec !== undefined) {
            totalExpectedDuration += match.avgGameDurationSec;
            expectedDurationCount += 1;
        }

        const volatilityValues = [teamA.performance.volatilityScore, teamB.performance.volatilityScore].filter((value): value is number => value !== null && value !== undefined);
        if (volatilityValues.length > 0) {
            totalVolatility += volatilityValues.reduce((sum, value) => sum + value, 0) / volatilityValues.length;
            volatilityCount += 1;
        }

        const sameEventValues = [teamA.performance.sameEventWeightedWinRate, teamB.performance.sameEventWeightedWinRate].filter((value): value is number => value !== null && value !== undefined);
        if (sameEventValues.length > 0) {
            sameEventCoverageSum += sameEventValues.reduce((sum, value) => sum + value, 0) / sameEventValues.length;
            sameEventCoverageCount += 1;
        }
    }

    return {
        avgConfidenceGap: confidenceCount > 0 ? Number((totalConfidenceGap / confidenceCount).toFixed(1)) : 0,
        avgExpectedKills: expectedKillsCount > 0 ? Number((totalExpectedKills / expectedKillsCount).toFixed(1)) : null,
        avgExpectedDurationSec: expectedDurationCount > 0 ? Math.round(totalExpectedDuration / expectedDurationCount) : null,
        avgVolatilityScore: volatilityCount > 0 ? Number((totalVolatility / volatilityCount).toFixed(2)) : 0,
        sameEventCoverage: sameEventCoverageCount > 0 ? Number((sameEventCoverageSum / sameEventCoverageCount).toFixed(1)) : 0,
        matchCount: selectedMatches.length,
    };
}

function buildStrategyOptions(params: {
    totalMatches: number;
    selectedMatches: number;
    expectedGames: number;
    remainingGames: number;
    remainingMarketSlots: number;
    targetGap: number;
    currentCapital: number;
    stopLine: number;
    oddsProfile: OddsPricingInsight;
    matchEnvironment: MatchEnvironmentSummary;
}): StrategyOption[] {
    const { totalMatches, selectedMatches, expectedGames, remainingGames, remainingMarketSlots, targetGap, currentCapital, stopLine, oddsProfile, matchEnvironment } = params;
    const totalBudgetNeed = Math.max(targetGap, 0);
    const baseSeriesBudget = Math.max(Math.ceil(totalBudgetNeed / Math.max(selectedMatches || totalMatches, 1) / 100) * 100, 100);
    const baseGameBudget = Math.max(Math.ceil(totalBudgetNeed / Math.max(expectedGames, 1) / 100) * 100, 100);
    const baseMarketBudget = Math.max(Math.ceil(totalBudgetNeed / Math.max(remainingMarketSlots, 1) / 100) * 100, 100);
    const safeBudget = Math.max(Math.floor(Math.max(currentCapital - stopLine, 0) / Math.max(remainingMarketSlots, 1) / 100) * 100, 100);

    let pricingFactor = 1;
    const kellyFactor = oddsProfile.conservativeKelly === null ? 0.85 : Math.min(Math.max(oddsProfile.conservativeKelly * 2.2, 0.35), 1.1);
    if (oddsProfile.pricedSampleCount >= 4) {
        if ((oddsProfile.expectedUnitReturn ?? 0) < -0.08 || (oddsProfile.edge ?? 0) <= -6 || (oddsProfile.lossRate ?? 0) >= 52) pricingFactor = 0.7;
        else if ((oddsProfile.expectedUnitReturn ?? 0) < 0 || oddsProfile.lowPayoutRate >= 0.55 || (oddsProfile.payoutVolatility ?? 0) >= 1) pricingFactor = 0.82;
        else if ((oddsProfile.expectedUnitReturn ?? 0) > 0.1 && (oddsProfile.edge ?? 0) >= 5 && (oddsProfile.lossRate ?? 100) <= 42) pricingFactor = 1.08;
    }
    if (matchEnvironment.avgConfidenceGap >= 10) pricingFactor += 0.08;
    if (matchEnvironment.avgConfidenceGap <= 4) pricingFactor -= 0.06;
    if ((matchEnvironment.avgExpectedKills ?? 0) >= 28) pricingFactor += 0.04;
    if ((matchEnvironment.avgExpectedDurationSec ?? 0) >= 2200) pricingFactor += 0.03;
    if (matchEnvironment.avgVolatilityScore >= 10) pricingFactor -= 0.08;
    if (matchEnvironment.sameEventCoverage >= 58) pricingFactor += 0.04;
    pricingFactor = Number((pricingFactor * kellyFactor).toFixed(2));

    const applyFactor = (value: number, factor: number) => Math.max(normalizeHundredAmount(value * factor, 100), 100);
    const seriesBudget = applyFactor(baseSeriesBudget, pricingFactor);
    const gameBudget = applyFactor(baseGameBudget, pricingFactor);
    const marketBudget = applyFactor(baseMarketBudget, pricingFactor);
    const safeMarketBudget = Math.max(Math.min(marketBudget, safeBudget), 100);
    const oddsSummary =
        oddsProfile.pricedSampleCount > 0 && oddsProfile.breakEvenWinRate !== null
            ? `历史有效赔率样本 ${oddsProfile.pricedSampleCount} 条，盈亏平衡胜率约 ${formatWinRate(oddsProfile.breakEvenWinRate)}，实际胜率 ${formatWinRate(oddsProfile.actualWinRate)}，输盘率 ${formatWinRate(oddsProfile.lossRate)}，单注历史回报约 ${oddsProfile.expectedUnitReturn?.toFixed(2)}。`
            : '历史有效赔率样本不足，当前先按输赢和胜率保守估算。';
    const riskSummary =
        oddsProfile.pricedSampleCount > 0
            ? `单注回报波动 ${oddsProfile.payoutVolatility?.toFixed(2) || '-'}，低赔率占比 ${Math.round(oddsProfile.lowPayoutRate * 100)}%，建议保守仓位系数 ${(oddsProfile.conservativeKelly ?? 0).toFixed(3)}。`
            : '赔率样本不足，默认按保守仓位执行。';
    const basisSummary = [
        `强弱置信差 ${matchEnvironment.avgConfidenceGap.toFixed(1)}，同赛事覆盖 ${formatWinRate(matchEnvironment.sameEventCoverage)}。`,
        `预估节奏 ${matchEnvironment.avgExpectedKills === null ? '-' : `${matchEnvironment.avgExpectedKills} 击杀`} / ${formatDurationMinutes(matchEnvironment.avgExpectedDurationSec)}。`,
        `整体波动 ${matchEnvironment.avgVolatilityScore.toFixed(2)}，已选 ${selectedMatches || totalMatches} 个大场，剩余盘口约 ${remainingMarketSlots} 手。`,
        oddsProfile.pricedSampleCount > 0
            ? `赔率样本 ${oddsProfile.pricedSampleCount} 条，单注历史回报 ${oddsProfile.expectedUnitReturn?.toFixed(2) || '-'}，Kelly ${(oddsProfile.conservativeKelly ?? 0).toFixed(3)}。`
            : '赔率样本不足时，先由队伍历史、同赛事覆盖、节奏与波动分共同定权。',
    ];

    return [
        {
            id: 'steady',
            label: '稳健推进',
            riskLabel: '低风险',
            description: `按剩余 ${formatProjectedCount(remainingGames)} 个小场、约 ${remainingMarketSlots} 个盘口机会做保守拆分。`,
            planText: `单个大场预算建议 ${seriesBudget}，单个小场预算 ${applyFactor(gameBudget, 0.8)}，单盘口预算 ${Math.max(Math.min(applyFactor(safeMarketBudget, 0.9), safeBudget), 100)}。`,
            caution: '只保留历史胜率更高、赔率门槛可覆盖的盘口；一旦继续触发预警，直接切回止损保护。',
            suggestedSeriesBudget: seriesBudget,
            suggestedGameBudget: applyFactor(gameBudget, 0.8),
            suggestedMarketBudget: Math.max(Math.min(applyFactor(safeMarketBudget, 0.9), safeBudget), 100),
            suggestedMatches: Math.max(Math.ceil((selectedMatches || totalMatches) * 0.45), 1),
            oddsSummary,
            riskSummary,
            basisSummary,
        },
        {
            id: 'balanced',
            label: '平衡推进',
            riskLabel: '中风险',
            description: '按大场、BO 小场和盘口机会均摊目标，同时结合赔率质量做中性分仓。',
            planText: `单个大场预算 ${seriesBudget}，单个小场预算 ${gameBudget}，单盘口预算 ${marketBudget}。`,
            caution: '优先保留历史胜率高于赔率盈亏平衡线的盘口，低赔率盘不要平均摊仓。',
            suggestedSeriesBudget: seriesBudget,
            suggestedGameBudget: gameBudget,
            suggestedMarketBudget: marketBudget,
            suggestedMatches: Math.max(Math.ceil((selectedMatches || totalMatches) * 0.65), 1),
            oddsSummary,
            riskSummary,
            basisSummary,
        },
        {
            id: 'aggressive',
            label: '进取冲刺',
            riskLabel: '高风险',
            description: '只在目标差额较大、剩余盘口机会足够、且赔率历史回报仍为正时使用。',
            planText: `单个大场预算建议 ${applyFactor(seriesBudget, 1.35)}，单个小场预算 ${applyFactor(gameBudget, 1.25)}，单盘口预算 ${applyFactor(marketBudget, 1.15)}。`,
            caution: '如果历史赔率样本回报已经转负，或者低盈利赔率盘口占比过高，不应继续使用这个策略。',
            suggestedSeriesBudget: applyFactor(seriesBudget, 1.35),
            suggestedGameBudget: applyFactor(gameBudget, 1.25),
            suggestedMarketBudget: applyFactor(marketBudget, 1.15),
            suggestedMatches: Math.max(Math.ceil((selectedMatches || totalMatches) * 0.8), 1),
            oddsSummary,
            riskSummary,
            basisSummary,
        },
        {
            id: 'defense',
            label: '止损保护',
            riskLabel: '极低风险',
            description: '当资金靠近止损线、或赔率回报已经明显转差时，只保留最强盘口。',
            planText: `建议只保留 1 到 2 个大场，单小场预算不超过 ${applyFactor(gameBudget, 0.55)}，单盘口预算不超过 ${applyFactor(safeMarketBudget, 0.55)}。`,
            caution: '如果严重预警已经弹出，默认应暂停，不继续加码。',
            suggestedSeriesBudget: applyFactor(seriesBudget, 0.7),
            suggestedGameBudget: applyFactor(gameBudget, 0.55),
            suggestedMarketBudget: applyFactor(safeMarketBudget, 0.55),
            suggestedMatches: Math.min(2, Math.max(selectedMatches || totalMatches, 1)),
            oddsSummary,
            riskSummary,
            basisSummary,
        },
    ];
}
function getRecommendedStrategyId(currentCapital: number, stopLine: number, targetGap: number, remainingMarketSlots: number, oddsProfile: OddsPricingInsight, matchEnvironment: MatchEnvironmentSummary): string {
    if (currentCapital <= stopLine) return 'defense';
    if (oddsProfile.pricedSampleCount >= 4) {
        if ((oddsProfile.expectedUnitReturn ?? 0) <= -0.08 || (oddsProfile.edge ?? 0) <= -6 || oddsProfile.veryLowPayoutRate >= 0.45 || (oddsProfile.lossRate ?? 0) >= 55) return 'defense';
        if ((oddsProfile.expectedUnitReturn ?? 0) < 0 || oddsProfile.lowPayoutRate >= 0.55 || (oddsProfile.payoutVolatility ?? 0) >= 1) return 'steady';
        if ((oddsProfile.conservativeKelly ?? 0) < 0.06) return 'steady';
        if (
            targetGap > 0 &&
            remainingMarketSlots <= 4 &&
            (oddsProfile.edge ?? 0) >= 5 &&
            (oddsProfile.lossRate ?? 100) <= 40 &&
            matchEnvironment.avgConfidenceGap >= 8 &&
            matchEnvironment.avgVolatilityScore <= 9.5
        ) return 'aggressive';
    }
    if (matchEnvironment.avgVolatilityScore >= 11) return 'steady';
    if (matchEnvironment.avgConfidenceGap >= 10 && (matchEnvironment.sameEventCoverage >= 58 || (matchEnvironment.avgExpectedKills ?? 0) >= 27)) return 'balanced';
    if (targetGap > Math.max(500, Math.abs(stopLine) * 0.35)) return 'balanced';
    if (targetGap > 0) return 'steady';
    return 'balanced';
}

function buildStrategySampleNotice(params: {
    readiness: RealOddsReadinessSummary;
    pricedSampleCount: number;
    selectedMatches: number;
    totalMatches: number;
}): StrategySampleNotice {
    const { readiness, pricedSampleCount, selectedMatches, totalMatches } = params;
    const { totalRecords: historyRecordCount, settledRecords: settledRecordCount, effectiveRecords, stageLabel, stageMessage, nextTargetCount } = readiness;

    if (historyRecordCount === 0) {
        return {
            mode: 'empty',
            stageLabel,
            stageMessage,
            nextTargetCount,
            title: '当前无有效历史投注样本',
            message: '策略中心已切换到无样本降级模式。当前预算、分仓和风险判断只参考比赛日程、队伍真实历史、BO 类型、节奏与环境模型，不代表真实下注结论。',
            details: [
                `已选比赛 ${selectedMatches}/${totalMatches} 场，但当前历史投注记录为 0 条。`,
                `样本阶段：${stageLabel}。${stageMessage}`,
                '优先加注、减仓和具体盘口预算会自动收紧，避免在空样本上给出过强建议。',
                '建议先连续沉淀一段真实投注数据，再逐步恢复历史胜率、回报和连胜连亏信号的权重。',
            ],
            historyRecordCount,
            settledRecordCount,
            pricedSampleCount,
        };
    }

    if (settledRecordCount < 20 || pricedSampleCount < 8) {
        return {
            mode: 'limited',
            stageLabel,
            stageMessage,
            nextTargetCount,
            title: '当前历史样本偏少',
            message: '策略中心已切换到样本不足降级模式。页面仍会给出预算和分仓参考，但历史回报、赔率门槛和具体盘口建议都会按保守口径处理。',
            details: [
                `当前历史记录 ${historyRecordCount} 条，其中已结算 ${settledRecordCount} 条、可用于策略的完整真实样本 ${effectiveRecords} 条、有效赔率样本 ${pricedSampleCount} 条。`,
                `样本阶段：${stageLabel}。${stageMessage}`,
                '样本不足时，系统会更依赖队伍真实历史、同赛事覆盖、BO 类型和比赛节奏模型。',
                '建议先累计更多真实记录，再据此调节预设和具体盘口权重。',
            ],
            historyRecordCount,
            settledRecordCount,
            pricedSampleCount,
        };
    }

    return {
        mode: 'normal',
        stageLabel,
        stageMessage,
        nextTargetCount,
        title: '历史样本已接入',
        message: '当前历史投注样本已达到基础参考标准，策略中心会同时使用历史回报、赔率门槛、节奏环境和队伍模型。',
        details: [
            `当前历史记录 ${historyRecordCount} 条，其中已结算 ${settledRecordCount} 条、可用于策略的完整真实样本 ${effectiveRecords} 条、有效赔率样本 ${pricedSampleCount} 条。`,
            `样本阶段：${stageLabel}。${stageMessage}`,
        ],
        historyRecordCount,
        settledRecordCount,
        pricedSampleCount,
    };
}

function getMarketTypeKey(record: StoredOddsResult): MarketTypeKey {
    if (record.type === 'WINNER') return 'winner';
    if (record.type === 'HANDICAP') return 'handicap';
    if (record.type === 'TIME') return 'time';
    return 'kills';
}

function getMarketTypeKeyFromMetric(metricKey: TeamMetricKey): MarketTypeKey {
    if (metricKey === 'winner') return 'winner';
    if (metricKey === 'handicap') return 'handicap';
    if (metricKey.startsWith('time')) return 'time';
    return 'kills';
}

function createStrategyScoreWeightResolver(globalWeights: StrategyScoreWeightsConfig, presetOverrides?: StrategyScorePresetOverrides) {
    const cache = new Map<MarketTypeKey, StrategyScoreWeightsConfig>();

    return (metricKey: TeamMetricKey) => {
        const marketType = getMarketTypeKeyFromMetric(metricKey);
        const cached = cache.get(marketType);
        if (cached) return cached;
        const weights = resolveStrategyScoreWeightsForMarketType(marketType, globalWeights, presetOverrides);
        cache.set(marketType, weights);
        return weights;
    };
}

function resolveStrategyScoreWeightsForMarketType(
    marketType: MarketTypeKey,
    globalWeights: StrategyScoreWeightsConfig,
    presetOverrides?: StrategyScorePresetOverrides,
) {
    const normalizedOverrides = normalizeStrategyScorePresetOverrides(presetOverrides);
    const overridePresetId = normalizedOverrides[marketType];
    if (overridePresetId !== 'inherit') {
        const preset = getStrategyScorePresetById(overridePresetId);
        if (preset) {
            return normalizeStrategyScoreWeights(preset.weights);
        }
    }
    return globalWeights;
}

function resolveStrategyPresetMetaForMarketType(
    marketType: MarketTypeKey,
    globalPresetId?: string | null,
    presetOverrides?: StrategyScorePresetOverrides,
) {
    const normalizedGlobalPresetId = normalizeStrategyScorePresetId(globalPresetId);
    const normalizedOverrides = normalizeStrategyScorePresetOverrides(presetOverrides);
    const overridePresetId = normalizedOverrides[marketType];

    if (overridePresetId !== 'inherit') {
        const preset = getStrategyScorePresetById(overridePresetId);
        return {
            effectivePresetId: overridePresetId as StrategyScorePresetId,
            presetLabel: preset?.label || '平衡版',
            presetSourceLabel: '独立覆盖',
            presetDetail: `${MARKET_TYPE_LABELS[marketType]} 当前使用独立覆盖预设「${preset?.label || '平衡版'}」，不会跟随全局方案。`,
        };
    }

    const globalPreset = getStrategyScorePresetById(normalizedGlobalPresetId);
    return {
        effectivePresetId: normalizedGlobalPresetId,
        presetLabel: normalizedGlobalPresetId === 'custom' ? '自定义' : globalPreset?.label || '平衡版',
        presetSourceLabel: '跟随全局',
        presetDetail:
            normalizedGlobalPresetId === 'custom'
                ? `${MARKET_TYPE_LABELS[marketType]} 当前跟随全局自定义权重。`
                : `${MARKET_TYPE_LABELS[marketType]} 当前跟随全局方案「${globalPreset?.label || '平衡版'}」。`,
    };
}

function getTodayExactMarketStreaks(
    records: StoredOddsResult[],
    teamAliasIds: string[],
    matchLookup: Map<string, OddsMatchMeta>,
    targetStatus: 'WIN' | 'LOSE',
): Map<string, number> {
    const aliasSet = new Set(teamAliasIds.filter(Boolean));
    const grouped = new Map<string, StoredOddsResult[]>();

    for (const record of records) {
        if (!aliasSet.has(String(record.teamAId || '')) && !aliasSet.has(String(record.teamBId || ''))) continue;
        const metricKeys = teamAliasIds.flatMap((aliasId) => getMetricKeysForRecord(record, aliasId));
        if (metricKeys.length === 0) continue;
        const metricKey = metricKeys[metricKeys.length - 1];
        const label = getRecordSelectionLabel(record) || TEAM_METRIC_LABELS[metricKey];
        const groupKey = `${metricKey}::${label}`;
        const list = grouped.get(groupKey) || [];
        list.push(record);
        grouped.set(groupKey, list);
    }

    const streaks = new Map<string, number>();
    for (const [groupKey, items] of grouped.entries()) {
        const groupedByGame = new Map<string, StoredOddsResult[]>();
        for (const item of items) {
            const bucketKey = `${item.matchId}::${item.gameNumber}`;
            const bucket = groupedByGame.get(bucketKey) || [];
            bucket.push(item);
            groupedByGame.set(bucketKey, bucket);
        }

        const sorted = [...groupedByGame.values()].sort((a, b) => {
            const aHead = a[0];
            const bHead = b[0];
            const aGame = Number.isFinite(aHead?.gameNumber) ? Number(aHead?.gameNumber) : 0;
            const bGame = Number.isFinite(bHead?.gameNumber) ? Number(bHead?.gameNumber) : 0;
            if (aGame !== bGame) return aGame - bGame;
            const at = new Date(matchLookup.get(aHead?.matchId || '')?.startTime || aHead?.createdAt || 0).getTime();
            const bt = new Date(matchLookup.get(bHead?.matchId || '')?.startTime || bHead?.createdAt || 0).getTime();
            if (at !== bt) return at - bt;
            return new Date(aHead?.createdAt || 0).getTime() - new Date(bHead?.createdAt || 0).getTime();
        });

        let streak = 0;
        for (let index = sorted.length - 1; index >= 0; index -= 1) {
            const status = getGroupedStatusFromRecords(sorted[index]);
            if (status !== targetStatus) break;
            streak += 1;
        }
        streaks.set(groupKey, streak);
    }

    return streaks;
}

function createMarketTypeSeed(key: MarketTypeKey) {
    return {
        key,
        label: MARKET_TYPE_LABELS[key],
        dailyTotal: 0,
        historyTotal: 0,
        counter: createCounter(),
        rawScore: 1,
        riskLevel: 'medium' as MarketTypeAllocation['riskLevel'],
        riskText: '等待更多赔率和输赢样本来校准风险。',
        averageOdds: null as number | null,
        averagePayout: null as number | null,
        breakEvenWinRate: null as number | null,
        expectedUnitReturn: null as number | null,
        lossRate: null as number | null,
        payoutVolatility: null as number | null,
        conservativeKelly: null as number | null,
        lowPayoutRate: 0,
        pricedSampleCount: 0,
    };
}

function buildMarketTypeAllocations(params: {
    historyRecords: StoredOddsResult[];
    dailyRecords: StoredOddsResult[];
    selectedTeamIds: Set<string>;
    regionBoards: RegionDailyBoard[];
    remainingMarketSlots: number;
    marketSlotProjectionByType: Record<MarketTypeKey, MarketSlotProjection>;
    suggestedMarketBudget: number;
    settings: StrategySettings;
    matchEnvironment: MatchEnvironmentSummary;
    strategyScoreWeights: StrategyScoreWeightsConfig;
    strategyScorePresetId?: StrategyScorePresetId;
    strategyScorePresetOverrides?: StrategyScorePresetOverrides;
}): MarketTypeAllocation[] {
    const {
        historyRecords,
        dailyRecords,
        selectedTeamIds,
        regionBoards,
        remainingMarketSlots,
        marketSlotProjectionByType,
        suggestedMarketBudget,
        settings,
        matchEnvironment,
        strategyScoreWeights,
        strategyScorePresetId,
        strategyScorePresetOverrides,
    } = params;
    const map = new Map<MarketTypeKey, ReturnType<typeof createMarketTypeSeed>>([
        ['winner', createMarketTypeSeed('winner')],
        ['handicap', createMarketTypeSeed('handicap')],
        ['kills', createMarketTypeSeed('kills')],
        ['time', createMarketTypeSeed('time')],
    ]);

    const useRecord = (record: StoredOddsResult) =>
        selectedTeamIds.size === 0 || selectedTeamIds.has(record.teamAId || '') || selectedTeamIds.has(record.teamBId || '');

    const historyByType = new Map<MarketTypeKey, StoredOddsResult[]>();

    for (const record of historyRecords.filter(useRecord)) {
        const key = getMarketTypeKey(record);
        const bucket = map.get(key);
        if (!bucket) continue;
        const resultValue = Number.isFinite(record.resultValue) ? Number(record.resultValue) : 0;
        bucket.historyTotal += resultValue;
        bucket.counter[getStatusFromResultValue(record.resultValue)] += 1;
        const list = historyByType.get(key) || [];
        list.push(record);
        historyByType.set(key, list);
    }

    for (const record of dailyRecords.filter(useRecord)) {
        const bucket = map.get(getMarketTypeKey(record));
        if (!bucket) continue;
        bucket.dailyTotal += Number.isFinite(record.resultValue) ? Number(record.resultValue) : 0;
    }

    const performanceItems = regionBoards.flatMap((regionBoard) => regionBoard.teams.map((team) => team.performance));
    const averagePerformanceMetric = (selector: (item: TeamPerformanceSnapshot) => number | null, filter?: (item: TeamPerformanceSnapshot) => boolean) => {
        const values = performanceItems
            .filter((item) => (filter ? filter(item) : true))
            .map(selector)
            .filter((value): value is number => value !== null && value !== undefined);
        if (values.length === 0) return null;
        return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
    };
    const avgWeightedSeriesWinRate = averagePerformanceMetric((item) => item.weightedSeriesWinRate);
    const avgRecentSeriesWinRate = averagePerformanceMetric((item) => item.recentSeriesWinRate);
    const avgHeadToHeadWinRate = averagePerformanceMetric((item) => item.headToHeadWinRate, (item) => item.headToHeadCount > 0);
    const avgConfidenceScore = averagePerformanceMetric((item) => item.confidenceScore);

    const values = Array.from(map.values()).map((bucket) => {
        const parentWeights = resolveStrategyScoreWeightsForMarketType(bucket.key, strategyScoreWeights, strategyScorePresetOverrides).marketTypeAllocation;
        const weightSnapshot: StrategyWeightSnapshotItem[] = [
            { label: '基础分', value: parentWeights.base },
            { label: '历史胜率', value: parentWeights.historicalWinRate },
            { label: '历史盈亏', value: parentWeights.historicalPnl },
            { label: '当日手感', value: parentWeights.dailyForm },
            { label: '赔率回报', value: parentWeights.pricingReturn },
            { label: '风险成本', value: parentWeights.riskCost },
            { label: '比赛环境', value: parentWeights.matchEnvironment },
            { label: '风险修正', value: parentWeights.riskAdjustment },
        ];
        const pricing = buildOddsPricingInsight(historyByType.get(bucket.key) || []);
        const winRate = getWinRate(bucket.counter);
        const decided = bucket.counter.WIN + bucket.counter.LOSE;
        const lowWinRate = winRate !== null && winRate < 45;
        const strongWinRate = winRate !== null && winRate >= 58;
        const negativeEdge = pricing.edge !== null && pricing.edge <= -4;
        const positiveEdge = pricing.edge !== null && pricing.edge >= 4;
        const lowPayoutPressure = pricing.lowPayoutRate >= 0.5;
        const highLossRate = pricing.lossRate !== null && pricing.lossRate >= 48;
        const highVolatility = pricing.payoutVolatility !== null && pricing.payoutVolatility >= 0.95;
        const bucketHasDailyExposure = bucket.counter.WIN + bucket.counter.LOSE + bucket.counter.PUSH + bucket.counter.PENDING > 0;
        const heavyDrawdown = settings.teamMarketStopLoss > 0 && bucketHasDailyExposure && bucket.dailyTotal < 0 && bucket.dailyTotal <= -settings.teamMarketStopLoss;
        const severeDrawdown = settings.teamMarketStopLoss > 0 && bucketHasDailyExposure && bucket.dailyTotal < 0 && bucket.dailyTotal <= -(settings.teamMarketStopLoss * settings.severeMultiplier);

        const presetMeta = resolveStrategyPresetMetaForMarketType(bucket.key, strategyScorePresetId, strategyScorePresetOverrides);
        const baseScore = 1;
        const historicalWinRateScore = winRate === null ? 0 : (winRate - 50) / 40;
        const historicalPnlScore = bucket.historyTotal > 0 ? 0.25 : bucket.historyTotal < 0 ? -0.2 : 0;
        const dailyFormScore = bucket.dailyTotal > 0 ? 0.12 : bucket.dailyTotal < 0 ? -0.18 : 0;
        const pricingScore =
            (pricing.expectedUnitReturn === null ? 0 : pricing.expectedUnitReturn * 0.9) +
            (positiveEdge ? 0.25 : negativeEdge ? -0.28 : 0) +
            (pricing.conservativeKelly === null ? 0 : Math.min(pricing.conservativeKelly, 0.18) * 1.6);
        const riskPenalty = (lowPayoutPressure ? -0.18 : 0) + (highLossRate ? -0.22 : 0) + (highVolatility ? -0.16 : 0);
        let environmentScore = 0;
        if (bucket.key === 'winner' || bucket.key === 'handicap') {
            environmentScore += Math.min(matchEnvironment.avgConfidenceGap / 18, 0.35);
            environmentScore += matchEnvironment.sameEventCoverage >= 58 ? 0.08 : 0;
        }
        if (bucket.key === 'kills') {
            environmentScore += (matchEnvironment.avgExpectedKills ?? 24) >= 28 ? 0.32 : (matchEnvironment.avgExpectedKills ?? 24) >= 25 ? 0.14 : -0.05;
            environmentScore += matchEnvironment.avgVolatilityScore >= 8 ? 0.08 : 0;
        }
        if (bucket.key === 'time') {
            environmentScore += (matchEnvironment.avgExpectedDurationSec ?? 1980) >= 2200 ? 0.3 : (matchEnvironment.avgExpectedDurationSec ?? 1980) >= 2050 ? 0.12 : -0.05;
            environmentScore += matchEnvironment.avgVolatilityScore >= 8 ? 0.06 : 0;
        }
        const weightedBaseScore = baseScore * parentWeights.base;
        const weightedHistoricalWinRateScore = historicalWinRateScore * parentWeights.historicalWinRate;
        const weightedHistoricalPnlScore = historicalPnlScore * parentWeights.historicalPnl;
        const weightedDailyFormScore = dailyFormScore * parentWeights.dailyForm;
        const weightedPricingScore = pricingScore * parentWeights.pricingReturn;
        const weightedRiskPenalty = riskPenalty * parentWeights.riskCost;
        const weightedEnvironmentScore = environmentScore * parentWeights.matchEnvironment;
        let rawScore = weightedBaseScore + weightedHistoricalWinRateScore + weightedHistoricalPnlScore + weightedDailyFormScore + weightedPricingScore + weightedRiskPenalty + weightedEnvironmentScore;

        let modelSummary: string | null = null;
        if (pricing.pricedSampleCount === 0) {
            if (bucket.key === 'winner') {
                modelSummary = `无历史下注样本，先按队伍加权胜率 ${formatWinRate(avgWeightedSeriesWinRate)}、近况 ${formatWinRate(avgRecentSeriesWinRate)}、对阵置信 ${avgConfidenceScore === null ? '-' : `${avgConfidenceScore}%`} 建模。`;
            } else if (bucket.key === 'handicap') {
                modelSummary = `无历史下注样本，先按同赛事覆盖 ${formatWinRate(matchEnvironment.sameEventCoverage)}、强弱差 ${matchEnvironment.avgConfidenceGap.toFixed(1)}、交手胜率 ${formatWinRate(avgHeadToHeadWinRate)} 建模。`;
            } else if (bucket.key === 'kills') {
                modelSummary = `无历史下注样本，先按预估 ${matchEnvironment.avgExpectedKills === null ? '-' : `${matchEnvironment.avgExpectedKills} 击杀`}、波动 ${matchEnvironment.avgVolatilityScore.toFixed(2)} 建模。`;
            } else if (bucket.key === 'time') {
                modelSummary = `无历史下注样本，先按预估 ${matchEnvironment.avgExpectedDurationSec === null ? '-' : `${Math.round(matchEnvironment.avgExpectedDurationSec / 60)} 分钟`}、波动 ${matchEnvironment.avgVolatilityScore.toFixed(2)} 建模。`;
            }
        }

        let riskLevel: MarketTypeAllocation['riskLevel'] = 'medium';
        let riskText = '建议按历史胜率、赔率门槛和当日表现做中性分仓。';
        let riskAdjustmentScore = 0;

        if (severeDrawdown || negativeEdge || highLossRate || (lowPayoutPressure && (pricing.expectedUnitReturn ?? 0) < 0)) {
            riskLevel = 'high';
            riskText = severeDrawdown
                ? '今天这一类盘口已经触发严重回撤，优先暂停或大幅减仓。'
                : pricing.pricedSampleCount > 0
                  ? `这类盘口赔率要求胜率约 ${formatWinRate(pricing.breakEvenWinRate)}，实际只有 ${formatWinRate(pricing.actualWinRate)}，输盘率 ${formatWinRate(pricing.lossRate)}，继续下注性价比偏差。`
                  : '这类盘口历史回报偏弱，建议谨慎减仓。';
            riskAdjustmentScore = rawScore * -0.38 * parentWeights.riskAdjustment;
            rawScore += riskAdjustmentScore;
        } else if (heavyDrawdown || lowWinRate || highVolatility) {
            riskLevel = 'high';
            riskText = heavyDrawdown
                ? '今天这一类盘口已经达到回撤阈值，建议立即减仓。'
                : highVolatility
                  ? `这类盘口单注回报波动 ${pricing.payoutVolatility?.toFixed(2) || '-'}，建议收紧这一类盘口预算。`
                  : `历史胜率 ${formatWinRate(winRate)}，建议收紧这一类盘口预算。`;
            riskAdjustmentScore = rawScore * -0.28 * parentWeights.riskAdjustment;
            rawScore += riskAdjustmentScore;
        } else if (strongWinRate && bucket.historyTotal > 0 && decided >= 3 && ((pricing.expectedUnitReturn ?? 0) >= 0 || pricing.pricedSampleCount === 0)) {
            riskLevel = 'low';
            riskText = pricing.pricedSampleCount > 0
                ? `历史胜率 ${formatWinRate(winRate)}，按 1.x 亚洲盘换算后的盈亏平衡胜率约 ${formatWinRate(pricing.breakEvenWinRate)}，保守仓位系数 ${(pricing.conservativeKelly ?? 0).toFixed(3)}，可以作为优先分仓方向。`
                : `历史胜率 ${formatWinRate(winRate)}，且累计输赢为正，可作为优先分仓方向。`;
            riskAdjustmentScore = rawScore * 0.18 * parentWeights.riskAdjustment;
            rawScore += riskAdjustmentScore;
        }

        const floorAdjustmentScore = rawScore < 0.2 ? 0.2 - rawScore : 0;
        rawScore = Math.max(rawScore, 0.2);

        if (pricing.pricedSampleCount === 0 && modelSummary) {
            riskText = riskLevel === 'medium' ? modelSummary : `${riskText} ${modelSummary}`;
        }

        const scoreBreakdown = [
            createScoreBreakdownItem('基础分', weightedBaseScore, `每类盘口先给基础进入分，当前权重 ${parentWeights.base.toFixed(2)}。`),
            createScoreBreakdownItem('历史胜率', weightedHistoricalWinRateScore, `历史胜率 ${formatWinRate(winRate)}，当前权重 ${parentWeights.historicalWinRate.toFixed(2)}。`),
            createScoreBreakdownItem('历史盈亏', weightedHistoricalPnlScore, `历史总输赢 ${bucket.historyTotal >= 0 ? '+' : ''}${bucket.historyTotal.toFixed(0)}，当前权重 ${parentWeights.historicalPnl.toFixed(2)}。`),
            createScoreBreakdownItem('当日手感', weightedDailyFormScore, `当日输赢 ${bucket.dailyTotal >= 0 ? '+' : ''}${bucket.dailyTotal.toFixed(0)}，当前权重 ${parentWeights.dailyForm.toFixed(2)}。`),
            createScoreBreakdownItem('赔率回报', weightedPricingScore, pricing.pricedSampleCount > 0 ? `赔率样本 ${pricing.pricedSampleCount} 条，历史回报 ${pricing.expectedUnitReturn?.toFixed(2) || '-'}，Kelly ${(pricing.conservativeKelly ?? 0).toFixed(3)}，当前权重 ${parentWeights.pricingReturn.toFixed(2)}。` : `当前赔率样本不足，这一项主要由队伍模型和环境信号接管，当前权重 ${parentWeights.pricingReturn.toFixed(2)}。`),
            createScoreBreakdownItem('风险成本', weightedRiskPenalty, `低赔率占比 ${Math.round(pricing.lowPayoutRate * 100)}%，输盘率 ${formatWinRate(pricing.lossRate)}，波动 ${pricing.payoutVolatility?.toFixed(2) || '-'}，当前权重 ${parentWeights.riskCost.toFixed(2)}。`),
            createScoreBreakdownItem('比赛环境', weightedEnvironmentScore, `${bucket.key === 'winner' || bucket.key === 'handicap' ? `强弱差 ${matchEnvironment.avgConfidenceGap.toFixed(1)}，同赛事覆盖 ${formatWinRate(matchEnvironment.sameEventCoverage)}` : bucket.key === 'kills' ? `预估 ${matchEnvironment.avgExpectedKills === null ? '-' : `${matchEnvironment.avgExpectedKills} 击杀`}，波动 ${matchEnvironment.avgVolatilityScore.toFixed(2)}` : `预估 ${formatDurationMinutes(matchEnvironment.avgExpectedDurationSec)}，波动 ${matchEnvironment.avgVolatilityScore.toFixed(2)}`}，当前权重 ${parentWeights.matchEnvironment.toFixed(2)}。`),
            createScoreBreakdownItem('风险档位修正', riskAdjustmentScore + floorAdjustmentScore, `${riskText} 当前权重 ${parentWeights.riskAdjustment.toFixed(2)}。${floorAdjustmentScore > 0 ? ' 同时触发了最低保底分。' : ''}`),
        ];

        const basisSummary = [
            `${presetMeta.presetSourceLabel}：${presetMeta.presetLabel}。${presetMeta.presetDetail}`,
            bucket.key === 'winner' || bucket.key === 'handicap'
                ? `强弱置信差 ${matchEnvironment.avgConfidenceGap.toFixed(1)}，同赛事覆盖 ${formatWinRate(matchEnvironment.sameEventCoverage)}。`
                : bucket.key === 'kills'
                  ? `预估节奏 ${matchEnvironment.avgExpectedKills === null ? '-' : `${matchEnvironment.avgExpectedKills} 击杀`}，波动 ${matchEnvironment.avgVolatilityScore.toFixed(2)}。`
                  : `预估时长 ${formatDurationMinutes(matchEnvironment.avgExpectedDurationSec)}，波动 ${matchEnvironment.avgVolatilityScore.toFixed(2)}。`,
            bucket.key === 'winner' || bucket.key === 'handicap'
                ? `队伍加权胜率 ${formatWinRate(avgWeightedSeriesWinRate)}，近况 ${formatWinRate(avgRecentSeriesWinRate)}，交手 ${formatWinRate(avgHeadToHeadWinRate)}。`
                : `队伍加权胜率 ${formatWinRate(avgWeightedSeriesWinRate)}，近况 ${formatWinRate(avgRecentSeriesWinRate)}，对阵置信 ${avgConfidenceScore === null ? '-' : `${avgConfidenceScore}%`}。`,
            pricing.pricedSampleCount > 0
                ? `赔率样本 ${pricing.pricedSampleCount} 条，单注历史回报 ${pricing.expectedUnitReturn?.toFixed(2) || '-'}，输盘率 ${formatWinRate(pricing.lossRate)}。`
                : '当前无有效历史下注样本，先由队伍历史与比赛环境模型接管分仓。',
            `预计盘口 ${marketSlotProjectionByType[bucket.key].expected} 手，剩余 ${marketSlotProjectionByType[bucket.key].remaining} 手，原始评分 ${rawScore.toFixed(2)}。`,
        ];

        return {
            ...bucket,
            presetLabel: presetMeta.presetLabel,
            presetSourceLabel: presetMeta.presetSourceLabel,
            presetDetail: presetMeta.presetDetail,
            weightSnapshot,
            historyWinRate: winRate,
            modelSummary,
            basisSummary,
            rawScore,
            riskLevel,
            riskText,
            scoreBreakdown,
            averageOdds: pricing.averageOdds,
            averagePayout: pricing.averagePayout,
            breakEvenWinRate: pricing.breakEvenWinRate,
            expectedUnitReturn: pricing.expectedUnitReturn,
            lossRate: pricing.lossRate,
            payoutVolatility: pricing.payoutVolatility,
            conservativeKelly: pricing.conservativeKelly,
            lowPayoutRate: pricing.lowPayoutRate,
            pricedSampleCount: pricing.pricedSampleCount,
        };
    });

    const totalScore = values.reduce((sum, item) => sum + item.rawScore, 0) || values.length;
    const totalProjectedRemaining = Object.values(marketSlotProjectionByType).reduce((sum, item) => sum + item.remaining, 0);
    const totalBudget = Math.max(suggestedMarketBudget * Math.max(remainingMarketSlots, 1), suggestedMarketBudget);

    return values.map((item) => {
        const rawShare = item.rawScore / totalScore;
        const projection = marketSlotProjectionByType[item.key];
        const demandShare = totalProjectedRemaining > 0 ? projection.remaining / totalProjectedRemaining : 1 / values.length;
        const suggestedShare = Number((rawShare * 0.65 + demandShare * 0.35).toFixed(2));
        const suggestedRemainingBudget = normalizeHundredAmount(totalBudget * suggestedShare, 0);
        const suggestedMarkets =
            projection.remaining > 0
                ? Math.max(Math.round(projection.remaining), item.rawScore > 0.9 ? 1 : 0)
                : 0;
        const suggestedSingleMarketBudget = suggestedMarkets > 0 ? normalizeHundredAmount(suggestedRemainingBudget / suggestedMarkets, suggestedMarketBudget) : suggestedMarketBudget;

        return {
            key: item.key,
            label: item.label,
            dailyTotal: normalizeHundredAmount(item.dailyTotal, 0),
            historyTotal: normalizeHundredAmount(item.historyTotal, 0),
            historyWinRate: item.historyWinRate,
            modelSummary: item.modelSummary,
            basisSummary: item.basisSummary,
            counter: item.counter,
            riskLevel: item.riskLevel,
            riskText: item.riskText,
            suggestedShare,
            suggestedRemainingBudget,
            suggestedSingleMarketBudget,
            suggestedMarkets,
            averageOdds: item.averageOdds,
            averagePayout: item.averagePayout,
            breakEvenWinRate: item.breakEvenWinRate,
            expectedUnitReturn: item.expectedUnitReturn,
            lossRate: item.lossRate,
            payoutVolatility: item.payoutVolatility,
            conservativeKelly: item.conservativeKelly,
            lowPayoutRate: item.lowPayoutRate,
            pricedSampleCount: item.pricedSampleCount,
            projectedExpectedMarkets: projection.expected,
            recordedMarkets: projection.recorded,
            remainingMarkets: projection.remaining,
            presetLabel: item.presetLabel,
            presetSourceLabel: item.presetSourceLabel,
            presetDetail: item.presetDetail,
            weightSnapshot: item.weightSnapshot,
            totalScore: roundScoreValue(item.rawScore),
            scoreBreakdown: item.scoreBreakdown,
        };
    });
}

function buildAlerts(params: {
    currentCapital: number;
    dailyTotal: number;
    settings: StrategySettings;
    regionBoards: RegionDailyBoard[];
    marketTypeAllocations: MarketTypeAllocation[];
}): StrategyAlert[] {
    const { currentCapital, dailyTotal, settings, regionBoards, marketTypeAllocations } = params;
    const alerts: StrategyAlert[] = [];
    const severeStopLoss = settings.teamMarketStopLoss * settings.severeMultiplier;
    const severeCapitalBreachLine = settings.stopLine - Math.max(severeStopLoss, 100);
    const marketStopEnabled = settings.teamMarketStopLoss > 0;

    if (dailyTotal < 0 && currentCapital <= settings.stopLine) {
        alerts.push({
            id: 'daily-capital-stop-line',
            severity: currentCapital <= severeCapitalBreachLine ? 'danger' : 'warning',
            title: '当日资金止损预警',
            message: `当前资金已到 ${currentCapital.toFixed(0)}，止损线设为 ${settings.stopLine.toFixed(0)}。建议立即降仓，并优先切换到止损保护。`,
        });
    }

    for (const allocation of marketTypeAllocations) {
        if (!marketStopEnabled || allocation.recordedMarkets <= 0 || allocation.dailyTotal >= 0) continue;

        if (allocation.dailyTotal <= -settings.teamMarketStopLoss) {
            alerts.push({
                id: `market-type-${allocation.key}`,
                severity: allocation.dailyTotal <= -severeStopLoss ? 'danger' : 'warning',
                title: `${allocation.label} 分仓预警`,
                message: allocation.dailyTotal <= -severeStopLoss
                    ? `${allocation.label} 今天累计输赢 ${allocation.dailyTotal.toFixed(0)}，已经跌破严重预警线，建议暂停这一类盘口。`
                    : `${allocation.label} 今天累计输赢 ${allocation.dailyTotal.toFixed(0)}，已经触发回撤阈值，建议缩减这一类盘口预算。`,
            });
        }

        if (
            allocation.pricedSampleCount >= 3 &&
            allocation.expectedUnitReturn !== null &&
            allocation.breakEvenWinRate !== null &&
            allocation.historyWinRate !== null &&
            (allocation.expectedUnitReturn < 0 || allocation.historyWinRate < allocation.breakEvenWinRate)
        ) {
            alerts.push({
                id: `market-type-odds-${allocation.key}`,
                severity: allocation.lowPayoutRate >= 0.5 ? 'warning' : 'info',
                title: `${allocation.label} 赔率门槛提醒`,
                message: `${allocation.label} 的历史有效赔率样本 ${allocation.pricedSampleCount} 条，盈亏平衡胜率约 ${formatWinRate(allocation.breakEvenWinRate)}，实际胜率 ${formatWinRate(allocation.historyWinRate)}，输盘率 ${formatWinRate(allocation.lossRate)}，单注历史回报约 ${allocation.expectedUnitReturn.toFixed(2)}。这类盘口当前不适合扩大投注。`,
            });
        }
    }

    for (const regionBoard of regionBoards) {
        for (const team of regionBoard.teams) {
            for (const metricKey of DISPLAY_METRIC_KEYS) {
                const dailyMetric = team.dailySummary.metrics[metricKey];
                const historyMetric = team.historySummary.metrics[metricKey];
                const dailyMetricHands = dailyMetric.counter.WIN + dailyMetric.counter.LOSE + dailyMetric.counter.PUSH + dailyMetric.counter.PENDING;
                if (!marketStopEnabled || dailyMetricHands <= 0 || dailyMetric.total >= 0 || dailyMetric.total > -settings.teamMarketStopLoss) continue;

                const severe = dailyMetric.total <= -severeStopLoss;
                const trend = getMetricRecentTrend(historyMetric);
                const extraTrend = trend.consecutiveLose ? '并且最近连续输盘，' : '';
                alerts.push({
                    id: `${team.teamId}-${metricKey}-alert`,
                    severity: severe ? 'danger' : 'warning',
                    title: `${team.teamName} ${TEAM_METRIC_LABELS[metricKey]} 预警`,
                    message: severe
                        ? `${team.teamName} 的 ${TEAM_METRIC_LABELS[metricKey]} 今天累计输赢 ${dailyMetric.total.toFixed(0)}，${extraTrend}已经达到严重预警线，建议暂停这个盘口。`
                        : `${team.teamName} 的 ${TEAM_METRIC_LABELS[metricKey]} 今天累计输赢 ${dailyMetric.total.toFixed(0)}，${extraTrend}建议立即降仓并减少继续下注。`,
                });
            }
        }
    }

    if (alerts.length === 0) {
        alerts.push({
            id: 'stable-state',
            severity: 'info',
            title: '当前无严重风险',
            message: '今天的盘口表现暂未触发止损阈值，可以继续按既定策略执行。',
        });
    }

    return alerts.slice(0, 12);
}

function buildExplanations(settings: StrategySettings): StrategyExplanationItem[] {
    const severeLine = settings.teamMarketStopLoss * settings.severeMultiplier;
    return [
        {
            label: '当日初始资金',
            detail: '这是你当天开盘前准备投入的基础资金。系统会用 初始资金 + 追加资金 + 当日输赢，实时计算当前资金。',
        },
        {
            label: '追加资金',
            detail: '如果你中途补仓或继续充值，就把追加金额填在这里。它会直接计入当前资金，所以允许出现先亏再追加资金继续操作的情况。',
        },
        {
            label: '止损线',
            detail: '止损线可以是负数。只要 当前资金 = 初始资金 + 追加资金 + 当日输赢 小于等于止损线，就会触发总预警。',
        },
        {
            label: '单队单盘口阈值',
            detail: `指某支队伍在某个具体盘口上，当天累计输赢触发盘口预警的金额线。比如设置 ${settings.teamMarketStopLoss}，当某队某盘口 <= -${settings.teamMarketStopLoss} 时，会提示减仓。`,
        },
        {
            label: '严重预警倍数',
            detail: `严重预警线 = 单队单盘口阈值 × 严重预警倍数。当前就是 ${settings.teamMarketStopLoss} × ${settings.severeMultiplier} = ${severeLine.toFixed(0)}。达到后会升级成红色覆盖预警。`,
        },
        {
            label: '金额单位',
            detail: '所有金额字段都按 100 为步长录入和统计，系统会自动忽略百元以下单位并四舍五入到最近的整百。',
        },
        {
            label: '赔率收益门槛',
            detail: '策略会同时看历史赔率、赔率对应的盈亏平衡胜率、真实胜率、输盘率、单注历史回报和回报波动。低盈利赔率盘口如果胜率达不到门槛，或者输盘率和波动过高，会自动被降权。',
        },
    ];
}

export function getDefaultStrategyDate(matches: OddsMatchMeta[]): string {
    const todayKey = getStrategyDateKeyFromIso(new Date().toISOString(), '06:00');
    return todayKey;
}

function buildDateMatches(matchesForDate: OddsMatchMeta[], selectedMatchIds: Set<string>, dayCutoffTime: string): StrategyMatchOption[] {
    return matchesForDate.map((match) => ({
        id: match.id,
        label: `${getTeamShortDisplayName(match.teamAName || '队伍A')} 对阵 ${getTeamShortDisplayName(match.teamBName || '队伍B')}`,
        startTime: match.startTime || null,
        strategyDateKey: getStrategyDateKeyFromIso(match.startTime, dayCutoffTime),
        format: match.format || null,
        teamAName: getTeamShortDisplayName(match.teamAName || '队伍A'),
        teamBName: getTeamShortDisplayName(match.teamBName || '队伍B'),
        tournament: match.tournament || null,
        stage: match.stage || null,
        selected: selectedMatchIds.has(match.id),
    }));
}

export function buildDailyStrategyBoard(params: {
    records: StoredOddsResult[];
    matches: OddsMatchMeta[];
    teams: StrategyTeamOption[];
    selectedRegion: string;
    selectedMatchIds: string[];
    settings: StrategySettings;
    strategyScoreWeights?: StrategyScoreWeightsConfig;
    strategyScorePresetId?: StrategyScorePresetId;
    strategyScorePresetOverrides?: StrategyScorePresetOverrides;
}): DailyStrategyBoard {
    const { records, matches, teams, selectedRegion, selectedMatchIds } = params;
    const settings = normalizeStrategySettings(params.settings);
    const strategyScoreWeights = normalizeStrategyScoreWeights(params.strategyScoreWeights);
    const strategyScorePresetId = normalizeStrategyScorePresetId(params.strategyScorePresetId);
    const strategyScorePresetOverrides = normalizeStrategyScorePresetOverrides(params.strategyScorePresetOverrides);
    const matchLookup = createMatchLookup(matches);
    const matchesForDate = matches.filter((match) => getStrategyDateKeyFromIso(match.startTime, settings.dayCutoffTime) === settings.dateKey);
    const effectiveSelectedMatchIds = new Set(
        (selectedMatchIds.length > 0 ? selectedMatchIds : matchesForDate.map((match) => match.id)).filter((id) => matchesForDate.some((match) => match.id === id)),
    );
    const selectedMatches = matchesForDate.filter((match) => effectiveSelectedMatchIds.has(match.id));
    const selectedTeamIds = new Set<string>();
    const teamAliasMap = buildStrategyTeamAliasMap(teams);
    const formatBreakdown = { BO1: 0, BO3: 0, BO5: 0, OTHER: 0 };
    const formatExpectation = buildFormatExpectation(matches);
    const finishedHistoryMatches = matches.filter((match) => !!match.winnerId && getStrategyDateKeyFromIso(match.startTime, settings.dayCutoffTime) <= settings.dateKey);
    const teamStyleMap = buildTeamStyleProfiles(finishedHistoryMatches, teamAliasMap);

    for (const match of selectedMatches) {
        if (match.teamAId) selectedTeamIds.add(match.teamAId);
        if (match.teamBId) selectedTeamIds.add(match.teamBId);
        const bucket = getFormatBucket(match.format);
        formatBreakdown[bucket] += 1;
    }

    const selectedTeamAliasIds = new Set<string>();
    for (const teamId of selectedTeamIds) {
        for (const aliasId of teamAliasMap.get(teamId) || [teamId]) {
            selectedTeamAliasIds.add(aliasId);
        }
    }

    const historyRecords = records.filter((record) => {
        const dateKey = getRecordStrategyDateKey(record, matchLookup.get(record.matchId), settings.dayCutoffTime);
        return !dateKey || dateKey <= settings.dateKey;
    });
    const dailyRecords = historyRecords.filter(
        (record) => getRecordStrategyDateKey(record, matchLookup.get(record.matchId), settings.dayCutoffTime) === settings.dateKey && effectiveSelectedMatchIds.has(record.matchId),
    );
    const selectedHistoryRecords =
        selectedTeamAliasIds.size === 0
            ? historyRecords
            : historyRecords.filter((record) => selectedTeamAliasIds.has(record.teamAId || '') || selectedTeamAliasIds.has(record.teamBId || ''));
    const oddsProfile = buildOddsPricingInsight(selectedHistoryRecords);
    const readiness = summarizeRealOddsReadiness(selectedHistoryRecords);
    const sampleNotice = buildStrategySampleNotice({
        readiness,
        pricedSampleCount: oddsProfile.pricedSampleCount,
        selectedMatches: selectedMatches.length,
        totalMatches: matchesForDate.length,
    });
    const participationProfile = buildParticipationProfile(selectedHistoryRecords, matchLookup, formatExpectation);
    const participationProfileByMarket = buildParticipationProfileByMarket(selectedHistoryRecords, matchLookup, formatExpectation, participationProfile);

    const dailyMatchActivity = new Map<
        string,
        {
            gameKeys: Set<string>;
            entries: number;
            byType: Record<MarketTypeKey, { gameKeys: Set<string>; entries: number }>;
        }
    >();
    for (const record of dailyRecords) {
        const current =
            dailyMatchActivity.get(record.matchId) ||
            {
                gameKeys: new Set<string>(),
                entries: 0,
                byType: {
                    winner: { gameKeys: new Set<string>(), entries: 0 },
                    handicap: { gameKeys: new Set<string>(), entries: 0 },
                    kills: { gameKeys: new Set<string>(), entries: 0 },
                    time: { gameKeys: new Set<string>(), entries: 0 },
                },
            };
        current.entries += 1;
        if (Number.isFinite(record.gameNumber) && record.gameNumber > 0) {
            current.gameKeys.add(`${record.matchId}-${record.gameNumber}`);
        }
        const marketKey = getMarketTypeKey(record);
        current.byType[marketKey].entries += 1;
        if (Number.isFinite(record.gameNumber) && record.gameNumber > 0) {
            current.byType[marketKey].gameKeys.add(`${record.matchId}-${record.gameNumber}`);
        }
        dailyMatchActivity.set(record.matchId, current);
    }

    const participatedGameKeys = new Set<string>();
    for (const activity of dailyMatchActivity.values()) {
        for (const key of activity.gameKeys) participatedGameKeys.add(key);
    }

    let selectedExpectedGames = 0;
    let expectedMarketSlots = 0;
    let recordedMarketEntries = 0;
    const marketSlotProjectionByType: Record<MarketTypeKey, MarketSlotProjection> = {
        winner: { expected: 0, recorded: 0, remaining: 0 },
        handicap: { expected: 0, recorded: 0, remaining: 0 },
        kills: { expected: 0, recorded: 0, remaining: 0 },
        time: { expected: 0, recorded: 0, remaining: 0 },
    };

    for (const match of selectedMatches) {
        const bucket = getFormatBucket(match.format);
        const profile = participationProfile[bucket];
        const activity = dailyMatchActivity.get(match.id);
        const recordedGamesForMatch = activity?.gameKeys.size || 0;
        const recordedEntriesForMatch = activity?.entries || 0;
        const expectedSeriesGames = getExpectedSeriesGames(match, formatExpectation);
        const expectedParticipatedGamesForMatch = Math.max(recordedGamesForMatch, Number((expectedSeriesGames * profile.participationRate).toFixed(1)));
        const expectedEntriesForMatch = Math.max(recordedEntriesForMatch, Math.round(expectedParticipatedGamesForMatch * profile.entriesPerGame));

        selectedExpectedGames += expectedParticipatedGamesForMatch;
        recordedMarketEntries += recordedEntriesForMatch;

        for (const marketKey of ['winner', 'handicap', 'kills', 'time'] as MarketTypeKey[]) {
            const marketProfile = participationProfileByMarket[bucket][marketKey];
            const marketActivity = activity?.byType[marketKey];
            const recordedGamesForType = marketActivity?.gameKeys.size || 0;
            const recordedEntriesForType = marketActivity?.entries || 0;
            const expectedParticipatedGamesForType = Math.max(recordedGamesForType, Number((expectedSeriesGames * marketProfile.participationRate).toFixed(1)));
            const expectedEntriesForType = Math.max(recordedEntriesForType, Math.round(expectedParticipatedGamesForType * marketProfile.entriesPerGame));

            marketSlotProjectionByType[marketKey].expected += expectedEntriesForType;
            marketSlotProjectionByType[marketKey].recorded += recordedEntriesForType;
        }
    }

    for (const marketKey of ['winner', 'handicap', 'kills', 'time'] as MarketTypeKey[]) {
        const projection = marketSlotProjectionByType[marketKey];
        projection.expected = Math.max(Math.round(projection.expected), projection.recorded);
        projection.remaining = Math.max(projection.expected - projection.recorded, 0);
        expectedMarketSlots += projection.expected;
    }

    const averageMarketsPerGame = selectedExpectedGames > 0 ? Math.max(Number((expectedMarketSlots / selectedExpectedGames).toFixed(1)), 1) : 1;
    const settledGames = participatedGameKeys.size;
    const roundedExpectedGames = Math.max(Math.round(selectedExpectedGames * 10) / 10, 0);
    const remainingGames = Math.max(Math.round((roundedExpectedGames - settledGames) * 10) / 10, 0);
    expectedMarketSlots = selectedMatches.length === 0 ? 0 : Math.max(expectedMarketSlots, recordedMarketEntries, selectedMatches.length);
    const remainingMarketSlots = selectedMatches.length === 0 ? 0 : Math.max(expectedMarketSlots - recordedMarketEntries, 0);

    const seenBoardAliasKeys = new Set<string>();
    const teamsForBoard =
        selectedTeamIds.size === 0
            ? []
            : teams.filter((team) => {
                  const teamRegions = parseTeamRegions(team.region);
                  const aliasIds = teamAliasMap.get(team.id) || [team.id];
                  if (isStrategyMajorRegion(selectedRegion)) {
                      if (!STRATEGY_MAJOR_REGION_SCOPE.some((region) => teamRegions.includes(region))) return false;
                  } else if (selectedRegion !== 'ALL' && !teamRegions.includes(selectedRegion)) {
                      return false;
                  }
                  if (!aliasIds.some((aliasId) => selectedTeamIds.has(aliasId))) return false;

                  const aliasKey = [...aliasIds].sort().join('::');
                  if (seenBoardAliasKeys.has(aliasKey)) return false;
                  seenBoardAliasKeys.add(aliasKey);
                  return true;
              });

    const regionMap = new Map<string, TeamDailyBoardItem[]>();
    for (const team of teamsForBoard) {
        const region = resolveTeamRegion(team, selectedRegion);
        const aliasIds = teamAliasMap.get(team.id) || [team.id];
        const todayMatchesForTeam = selectedMatches.filter((match) => aliasIds.includes(String(match.teamAId || '')) || aliasIds.includes(String(match.teamBId || '')));
        const opponentMatch = todayMatchesForTeam.length === 1 ? todayMatchesForTeam[0] : null;
        const opponentId =
            opponentMatch
                ? aliasIds.includes(String(opponentMatch.teamAId || ''))
                    ? String(opponentMatch.teamBId || '')
                    : String(opponentMatch.teamAId || '')
                : '';
        const opponentAliasIds = opponentId ? teamAliasMap.get(opponentId) || [opponentId] : [];
        const opponentName =
            opponentMatch
                ? aliasIds.includes(String(opponentMatch.teamAId || ''))
                    ? opponentMatch.teamBName || null
                    : opponentMatch.teamAName || null
                : null;
        const dailySummary = buildTeamOddsSummary(dailyRecords, { ...team, aliasIds }, matchLookup);
        const historySummary = buildTeamOddsSummary(historyRecords, { ...team, aliasIds }, matchLookup);
        const todayMatchCount = selectedMatches.filter((match) => aliasIds.includes(String(match.teamAId || '')) || aliasIds.includes(String(match.teamBId || ''))).length;
        const performance = buildTeamPerformanceSnapshot({
            matches: finishedHistoryMatches,
            teamAliasIds: aliasIds,
            opponentAliasIds,
            opponentName,
            currentMatch: opponentMatch,
            teamStyleMap,
        });

        const item: TeamDailyBoardItem = {
            teamId: team.id,
            aliasIds,
            teamName: historySummary.teamName || getTeamShortDisplayName(team.name),
            region,
            todayMatchCount,
            dailySummary,
            historySummary,
            performance,
        };

        const bucket = regionMap.get(region) || [];
        bucket.push(item);
        regionMap.set(region, bucket);
    }

    const regionBoards: RegionDailyBoard[] = Array.from(regionMap.entries())
        .map(([region, regionTeams]) => ({
            region,
            teams: regionTeams.sort((a, b) => {
                if (b.dailySummary.overallTotal !== a.dailySummary.overallTotal) return b.dailySummary.overallTotal - a.dailySummary.overallTotal;
                if (b.historySummary.overallTotal !== a.historySummary.overallTotal) return b.historySummary.overallTotal - a.historySummary.overallTotal;
                return a.teamName.localeCompare(b.teamName);
            }),
        }))
        .sort((a, b) => a.region.localeCompare(b.region));

    const settledDailyRecords = dailyRecords.filter((record) => getStatusFromResultValue(record.resultValue) !== 'PENDING');
    const uniqueSettledMatches = new Set(settledDailyRecords.map((record) => record.matchId));
    const dailyTotal = normalizeHundredAmount(
        dailyRecords.reduce((sum, record) => sum + (Number.isFinite(record.resultValue) ? Number(record.resultValue) : 0), 0),
        0,
    );
    const totalMatches = matchesForDate.length;
    const settledMatches = uniqueSettledMatches.size;
    const remainingMatches = Math.max(selectedMatches.length - settledMatches, 0);
    const currentCapital = normalizeHundredAmount(settings.startingCapital + settings.addedCapital + dailyTotal, 0);
    const targetGap = normalizeHundredAmount(settings.dailyTarget - dailyTotal, 0);
    const stopLineGap = normalizeHundredAmount(currentCapital - settings.stopLine, 0);
    const progressRatio = settings.dailyTarget === 0 ? 0 : dailyTotal / settings.dailyTarget;
    const matchEnvironment = buildMatchEnvironmentSummary(selectedMatches, regionBoards);
    const recommendedStrategyId = getRecommendedStrategyId(currentCapital, settings.stopLine, targetGap, remainingMarketSlots, oddsProfile, matchEnvironment);
    const strategies = buildStrategyOptions({
        totalMatches,
        selectedMatches: selectedMatches.length,
        expectedGames: selectedExpectedGames,
        remainingGames,
        remainingMarketSlots,
        targetGap,
        currentCapital,
        stopLine: settings.stopLine,
        oddsProfile,
        matchEnvironment,
    });
    const activeStrategy = strategies.find((item) => item.id === recommendedStrategyId) || strategies[0];
    const marketTypeAllocations = buildMarketTypeAllocations({
        historyRecords,
        dailyRecords,
        selectedTeamIds: selectedTeamAliasIds,
        regionBoards,
        remainingMarketSlots,
        marketSlotProjectionByType,
        suggestedMarketBudget: activeStrategy?.suggestedMarketBudget || 100,
        settings,
        matchEnvironment,
        strategyScoreWeights,
        strategyScorePresetId,
        strategyScorePresetOverrides,
    });
    const recommendations =
        sampleNotice.mode === 'empty'
            ? {
                  increase: [],
                  decrease: [],
              }
            : getRecommendationCandidates(regionBoards, selectedHistoryRecords);
    const exactRecommendations =
        sampleNotice.mode === 'empty'
            ? {
                  exactIncrease: [],
                  exactDecrease: [],
              }
            : getExactRecommendationCandidates(regionBoards, selectedHistoryRecords, matchLookup, strategyScoreWeights, strategyScorePresetOverrides);
    const exactMarketAllocations =
        sampleNotice.mode === 'empty'
            ? []
            : buildExactMarketAllocations({
                  regionBoards,
                  historyRecords: selectedHistoryRecords,
                  dailyRecords,
                  matchLookup,
                  marketTypeAllocations,
                  strategyScoreWeights,
                  strategyScorePresetOverrides,
              });
    const alerts = buildAlerts({
        currentCapital,
        dailyTotal,
        settings,
        regionBoards,
        marketTypeAllocations,
    });
    const criticalAlerts = alerts.filter((alert) => alert.severity === 'danger');

    return {
        dateKey: settings.dateKey,
        dayCutoffTime: settings.dayCutoffTime,
        totalMatches,
        selectedMatches: selectedMatches.length,
        settledMatches,
        remainingMatches,
        expectedGames: roundedExpectedGames,
        selectedExpectedGames: roundedExpectedGames,
        settledGames,
        remainingGames,
        averageMarketsPerGame,
        expectedMarketSlots,
        remainingMarketSlots,
        recordedMarketEntries,
        settledRecordCount: settledDailyRecords.length,
        formatBreakdown,
        formatExpectation,
        startingCapital: settings.startingCapital,
        addedCapital: settings.addedCapital,
        currentCapital,
        dailyTotal,
        stopLineGap,
        targetGap,
        progressRatio,
        recommendedStrategyId,
        strategies,
        alerts,
        criticalAlerts,
        explanations: buildExplanations(settings),
        recommendations: {
            ...recommendations,
            ...exactRecommendations,
        },
        exactMarketAllocations,
        regionBoards,
        dateMatches: buildDateMatches(matchesForDate, effectiveSelectedMatchIds, settings.dayCutoffTime),
        marketTypeAllocations,
        sampleNotice,
    };
}






