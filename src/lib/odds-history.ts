export type OddsType = 'WINNER' | 'HANDICAP' | 'KILLS' | 'TIME';
export type BetSide = 'LEFT' | 'RIGHT';
export type BetStatus = 'WIN' | 'LOSE' | 'PUSH' | 'PENDING';

export type TeamMetricKey =
    | 'winner'
    | 'handicap'
    | 'killsAll'
    | 'killsOver'
    | 'killsUnder'
    | 'timeAll'
    | 'timeOver'
    | 'timeUnder';

export interface StoredOddsResult {
    id: string;
    matchId: string;
    gameNumber: number;
    type: OddsType;
    side: BetSide;
    threshold: number | null;
    selectionLabel: string;
    detail: string;
    createdAt: string;
    resultValue?: number;
    settledStatus?: BetStatus;
    oddsValue?: number;
    oppositeOddsValue?: number;
    provider?: string;
    actualThreshold?: number | null;
    actualSelectionLabel?: string;
    actualOddsRaw?: number;
    actualOddsNormalized?: number;
    actualOddsFormat?: 'HK' | 'EU';
    actualProvider?: string;
    actualStakeAmount?: number;
    teamAId?: string;
    teamBId?: string;
    teamAName?: string;
    teamBName?: string;
    teamARegion?: string;
    teamBRegion?: string;
    matchStartTime?: string;
    tournament?: string;
    stage?: string;
}

export interface OddsMatchMeta {
    id: string;
    startTime?: string | null;
    tournament?: string | null;
    stage?: string | null;
    format?: string | null;
    winnerId?: string | null;
    gamesCount?: number | null;
    avgGameDurationSec?: number | null;
    avgTotalKills?: number | null;
    teamAAvgKills?: number | null;
    teamBAvgKills?: number | null;
    teamAAvgDeaths?: number | null;
    teamBAvgDeaths?: number | null;
    teamASeriesWins?: number | null;
    teamBSeriesWins?: number | null;
    teamAId?: string | null;
    teamBId?: string | null;
    teamAName?: string | null;
    teamBName?: string | null;
    teamARegion?: string | null;
    teamBRegion?: string | null;
    games?: OddsGameMeta[] | null;
}

export interface OddsGameMeta {
    gameNumber: number;
    winnerId?: string | null;
    duration?: number | null;
    totalKills?: number | null;
    blueKills?: number | null;
    redKills?: number | null;
    blueSideTeamId?: string | null;
    redSideTeamId?: string | null;
}

export interface StatusCounter {
    WIN: number;
    LOSE: number;
    PUSH: number;
    PENDING: number;
}

export interface RecentMatchMetric {
    matchId: string;
    matchLabel: string;
    opponentName: string;
    total: number;
    counter: StatusCounter;
    updatedAt: string;
}

export interface TeamMetricSummary {
    key: TeamMetricKey;
    label: string;
    total: number;
    counter: StatusCounter;
    settledCount: number;
    winRate: number | null;
    recentMatches: RecentMatchMetric[];
}

export interface TeamOddsSummary {
    teamId: string;
    aliasIds: string[];
    teamName: string;
    matchCount: number;
    totalRecords: number;
    overallTotal: number;
    metrics: Record<TeamMetricKey, TeamMetricSummary>;
}

export interface ExactMarketSummary {
    key: string;
    label: string;
    metricKey: TeamMetricKey;
    total: number;
    counter: StatusCounter;
    settledCount: number;
    winRate: number | null;
    averageOdds: number | null;
    expectedUnitReturn: number | null;
    lossRate: number | null;
    averageStake: number | null;
    averageSettlement: number | null;
    averageLineDelta: number | null;
    recentMatches: RecentMatchMetric[];
}

export interface RealOddsFieldRule {
    key: 'stake' | 'status' | 'settlement' | 'odds' | 'provider' | 'line';
    label: string;
    detail: string;
}

export interface RealOddsReadinessSummary {
    totalRecords: number;
    settledRecords: number;
    effectiveRecords: number;
    readyRate: number;
    missingStakeCount: number;
    missingStatusCount: number;
    missingSettlementCount: number;
    missingOddsCount: number;
    missingProviderCount: number;
    missingLineCount: number;
    stage: 'none' | 'boot' | 'usable' | 'calibration' | 'stable';
    stageLabel: string;
    stageMessage: string;
    nextTargetCount: number | null;
}

export const BET_STORAGE_PREFIX = 'virtual-bets:';
export const LEGACY_MANUAL_ODDS_MIGRATION_KEY = 'manual-odds-db-migrated-v1';

export const TEAM_METRIC_LABELS: Record<TeamMetricKey, string> = {
    winner: '胜负盘',
    handicap: '让分盘',
    killsAll: '人头总盘',
    killsOver: '大人头',
    killsUnder: '小人头',
    timeAll: '时间总盘',
    timeOver: '大时间',
    timeUnder: '小时间',
};

export const TEAM_METRIC_ORDER: TeamMetricKey[] = [
    'winner',
    'handicap',
    'killsAll',
    'killsOver',
    'killsUnder',
    'timeAll',
    'timeOver',
    'timeUnder',
];

export const REAL_ODDS_FIELD_RULES: RealOddsFieldRule[] = [
    { key: 'stake', label: '投注金额', detail: '每条真实记录都要补实际下注金额，后续才能稳定计算单注回报和资金曲线。' },
    { key: 'settlement', label: '结算结果', detail: '已结算记录必须有实际输赢金额，策略中心才会把它计入历史样本。' },
    { key: 'odds', label: '实盘赔率', detail: '统一按 1.x 亚洲盘口径保存与统计。历史旧值 0.8 会按 1.8 解释；盈利倍率固定按 赔率减 1 计算。' },
    { key: 'provider', label: '实盘来源', detail: '记录平台或场景，例如 Pinnacle、赛中、补仓，便于后面回查。' },
    { key: 'line', label: '实盘口线', detail: '让分盘 / 人头盘 / 时间盘最好记录真实买到的盘口线，方便比较盘口偏差。' },
];


const TEAM_NAME_SHORT_ALIASES: Record<string, string> = {
    'bilibili gaming': 'BLG',
    'weibo gaming': 'WBG',
    'top esports': 'TES',
    'jd gaming': 'JDG',
    'invictus gaming': 'IG',
    "anyone's legend": "AL",
    'edward gaming': 'EDG',
    'lng esports': 'LNG',
    'oh my god': 'OMG',
    'ninjas in pyjamas': 'NIP',
    'ultra prime': 'UP',
    'royal never give up': 'RNG',
    'funplus phoenix': 'FPX',
    'thunder talk gaming': 'TT',
    'rare atom': 'RA',
    'team we': 'WE',
    'lgd gaming': 'LGD',
    'g2 esports': 'G2',
    'gen.g': 'GEN',
    'gen.g esports': 'GEN',
    'team secret whales': 'TSW',
    'bnk fearx': 'BFX',
    'oksavingsbank brion': 'BRO',
    'nongshim redforce': 'NS',
    'hanwha life esports': 'HLE',
    'dplus kia': 'DK',
    'kt rolster': 'KT',
    'team vitality': 'VIT',
    'karmine corp': 'KC',
    'movistar koi': 'MKOI',
};

export function getTeamShortDisplayName(name?: string | null): string {
    const source = String(name || '').trim();
    if (!source) return 'UNK';

    const normalized = source.toLowerCase();
    if (TEAM_NAME_SHORT_ALIASES[normalized]) return TEAM_NAME_SHORT_ALIASES[normalized];

    const words = source
        .replace(/[()]/g, ' ')
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (words.length === 1) {
        return words[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'UNK';
    }

    return words
        .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 5)
        .toUpperCase() || 'UNK';
}
export function createCounter(): StatusCounter {
    return { WIN: 0, LOSE: 0, PUSH: 0, PENDING: 0 };
}

export function cloneCounter(counter: StatusCounter): StatusCounter {
    return { ...counter };
}

export function getStorageKey(matchId: string): string {
    return `${BET_STORAGE_PREFIX}${matchId}`;
}

export function createStoredOddsId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseResultNumber(value: string): number | undefined {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeUnifiedOdds(raw?: number | null): number | null {
    if (!Number.isFinite(raw)) return null;
    const numeric = Number(raw);
    if (numeric <= 0) return null;
    const asian = numeric < 1 ? numeric + 1 : numeric;
    return Number(asian.toFixed(3));
}

function isSettledStatus(status?: BetStatus): status is 'WIN' | 'LOSE' | 'PUSH' {
    return status === 'WIN' || status === 'LOSE' || status === 'PUSH';
}

function hasRealStake(record: StoredOddsResult) {
    return Number.isFinite(record.actualStakeAmount) && Number(record.actualStakeAmount) >= 0;
}

function hasRealSettlement(record: StoredOddsResult) {
    return Number.isFinite(record.resultValue);
}

function hasRealOdds(record: StoredOddsResult) {
    return (Number.isFinite(record.actualOddsRaw) && Number(record.actualOddsRaw) > 0) || (Number.isFinite(record.actualOddsNormalized) && Number(record.actualOddsNormalized) > 0);
}

function hasRealProvider(record: StoredOddsResult) {
    return Boolean(String(record.actualProvider || record.provider || '').trim());
}

function hasRealLine(record: StoredOddsResult) {
    if (record.type === 'WINNER') return true;
    return Number.isFinite(record.actualThreshold) || Number.isFinite(record.threshold);
}

function getRealOddsSampleStage(effectiveRecords: number): Pick<RealOddsReadinessSummary, 'stage' | 'stageLabel' | 'stageMessage' | 'nextTargetCount'> {
    if (effectiveRecords <= 0) {
        return {
            stage: 'none',
            stageLabel: '无有效样本',
            stageMessage: '当前还没有可用于策略回测的真实样本，系统只能按比赛与队伍模型保守估算。',
            nextTargetCount: 20,
        };
    }
    if (effectiveRecords < 20) {
        return {
            stage: 'boot',
            stageLabel: '起步阶段',
            stageMessage: '真实样本刚开始积累，当前更适合看流程是否稳定，不适合据此调权重。',
            nextTargetCount: 20,
        };
    }
    if (effectiveRecords < 50) {
        return {
            stage: 'usable',
            stageLabel: '基础参考',
            stageMessage: '已经可以观察大方向，但还不适合做细颗粒度盘口结论。',
            nextTargetCount: 50,
        };
    }
    if (effectiveRecords < 100) {
        return {
            stage: 'calibration',
            stageLabel: '可校准阶段',
            stageMessage: '样本量已经能支持分盘口类型观察，可以开始做第一轮保守校准。',
            nextTargetCount: 100,
        };
    }
    return {
        stage: 'stable',
        stageLabel: '稳定样本',
        stageMessage: '样本量已经达到相对稳定阶段，更适合做预设调优和回测校准。',
        nextTargetCount: null,
    };
}

export function summarizeRealOddsReadiness(records: StoredOddsResult[]): RealOddsReadinessSummary {
    let settledRecords = 0;
    let effectiveRecords = 0;
    let missingStakeCount = 0;
    let missingStatusCount = 0;
    let missingSettlementCount = 0;
    let missingOddsCount = 0;
    let missingProviderCount = 0;
    let missingLineCount = 0;

    for (const record of records) {
        const status = record.settledStatus || getStatusFromResultValue(record.resultValue);
        const settled = isSettledStatus(status);
        const missingStake = !hasRealStake(record);
        const missingStatus = !status;
        const missingSettlement = settled && !hasRealSettlement(record);
        const missingOdds = !hasRealOdds(record);
        const missingProvider = !hasRealProvider(record);
        const missingLine = !hasRealLine(record);

        if (settled) settledRecords += 1;
        if (missingStake) missingStakeCount += 1;
        if (missingStatus) missingStatusCount += 1;
        if (missingSettlement) missingSettlementCount += 1;
        if (missingOdds) missingOddsCount += 1;
        if (missingProvider) missingProviderCount += 1;
        if (missingLine) missingLineCount += 1;

        if (settled && !missingStake && !missingSettlement && !missingOdds && !missingProvider && !missingLine) {
            effectiveRecords += 1;
        }
    }

    const stageInfo = getRealOddsSampleStage(effectiveRecords);
    return {
        totalRecords: records.length,
        settledRecords,
        effectiveRecords,
        readyRate: records.length === 0 ? 0 : effectiveRecords / records.length,
        missingStakeCount,
        missingStatusCount,
        missingSettlementCount,
        missingOddsCount,
        missingProviderCount,
        missingLineCount,
        ...stageInfo,
    };
}

export function detectOddsFormat(raw?: number | null): 'HK' | 'EU' | null {
    if (!Number.isFinite(raw)) return null;
    const numeric = Number(raw);
    if (numeric <= 0) return null;
    return numeric >= 1.2 ? 'EU' : 'HK';
}

export function getRecordActualOdds(record: StoredOddsResult): number | null {
    if (Number.isFinite(record.actualOddsRaw)) return normalizeUnifiedOdds(record.actualOddsRaw);
    if (Number.isFinite(record.actualOddsNormalized)) return Number(record.actualOddsNormalized);
    if (Number.isFinite(record.oddsValue)) return normalizeUnifiedOdds(record.oddsValue);
    return null;
}

export function getProfitMultiplierFromOdds(raw?: number | null): number | null {
    const numeric = normalizeUnifiedOdds(raw);
    if (numeric === null) return null;
    const profit = numeric - 1;
    if (!Number.isFinite(profit) || profit < 0) return null;
    return Number(profit.toFixed(2));
}

export function calculateResultValueFromStake(stakeAmount?: number | null, status?: BetStatus | null, oddsValue?: number | null): number | undefined {
    if (status === 'PENDING') return undefined;
    if (!Number.isFinite(stakeAmount) || Number(stakeAmount) < 0) return undefined;

    const stake = Number(stakeAmount);
    if (status === 'PUSH') return 0;
    if (status === 'LOSE') return Number((-stake).toFixed(2));
    if (status === 'WIN') {
        const profit = getProfitMultiplierFromOdds(oddsValue);
        if (profit === null) return undefined;
        return Number((stake * profit).toFixed(2));
    }
    return undefined;
}

function resolveHandicapScores(game: OddsGameMeta, teamAId?: string | null) {
    if (!teamAId) return null;

    if (teamAId === game.blueSideTeamId) {
        return {
            scoreA: Number(game.blueKills || 0),
            scoreB: Number(game.redKills || 0),
        };
    }

    if (teamAId === game.redSideTeamId) {
        return {
            scoreA: Number(game.redKills || 0),
            scoreB: Number(game.blueKills || 0),
        };
    }

    return null;
}

function resolveWinnerIdFromGame(game?: OddsGameMeta | null): string | null {
    if (!game) return null;

    const rawWinnerId = String(game.winnerId || '').trim();
    if (rawWinnerId) {
        const normalized = rawWinnerId.toUpperCase();
        if (normalized === 'BLUE') return game.blueSideTeamId || rawWinnerId;
        if (normalized === 'RED') return game.redSideTeamId || rawWinnerId;
        return rawWinnerId;
    }

    const blueKills = Number(game.blueKills ?? NaN);
    const redKills = Number(game.redKills ?? NaN);
    if (!Number.isFinite(blueKills) || !Number.isFinite(redKills) || blueKills === redKills) {
        return null;
    }

    if (blueKills > redKills) return game.blueSideTeamId || 'BLUE';
    return game.redSideTeamId || 'RED';
}

function hasCompletedGameForSettlement(game?: OddsGameMeta | null): boolean {
    if (!game) return false;

    const rawWinnerId = String(game.winnerId || '').trim();
    if (rawWinnerId) return true;

    const duration = Number(game.duration ?? 0);
    const totalKills = Number(game.totalKills ?? NaN);
    const combinedKills = Number(game.blueKills ?? 0) + Number(game.redKills ?? 0);

    if (!Number.isFinite(duration) || duration <= 0) return false;
    if (Number.isFinite(totalKills) && totalKills > 0) return true;
    if (combinedKills > 0) return true;

    return false;
}

export function resolveAutoSettlementStatusFromGame({
    type,
    side,
    threshold,
    teamAId,
    teamBId,
    game,
}: {
    type: OddsType;
    side: BetSide;
    threshold?: number | null;
    teamAId?: string | null;
    teamBId?: string | null;
    game?: OddsGameMeta | null;
}): BetStatus {
    if (!game) return 'PENDING';
    if (!hasCompletedGameForSettlement(game)) return 'PENDING';
    const resolvedWinnerId = resolveWinnerIdFromGame(game);

    if (type === 'WINNER') {
        const selectedTeamId = side === 'LEFT' ? teamAId : teamBId;
        if (!selectedTeamId || !resolvedWinnerId) return 'PENDING';
        return resolvedWinnerId === selectedTeamId ? 'WIN' : 'LOSE';
    }

    const numericThreshold = Number(threshold ?? 0);

    if (type === 'KILLS') {
        const totalKills = Number(game.totalKills || 0) || Number(game.blueKills || 0) + Number(game.redKills || 0);
        if (!Number.isFinite(totalKills) || totalKills <= 0) return 'PENDING';
        if (totalKills === numericThreshold) return 'PUSH';
        if (side === 'LEFT') return totalKills > numericThreshold ? 'WIN' : 'LOSE';
        return totalKills < numericThreshold ? 'WIN' : 'LOSE';
    }

    if (type === 'TIME') {
        if (!Number.isFinite(game.duration) || Number(game.duration) <= 0) return 'PENDING';
        const minutes = Number(game.duration) / 60;
        if (minutes === numericThreshold) return 'PUSH';
        if (side === 'LEFT') return minutes > numericThreshold ? 'WIN' : 'LOSE';
        return minutes < numericThreshold ? 'WIN' : 'LOSE';
    }

    if (type === 'HANDICAP') {
        const scores = resolveHandicapScores(game, teamAId);
        if (!scores) return 'PENDING';
        const leftAdjusted = scores.scoreA + numericThreshold;
        if (leftAdjusted === scores.scoreB) return 'PUSH';
        if (side === 'LEFT') return leftAdjusted > scores.scoreB ? 'WIN' : 'LOSE';
        return leftAdjusted < scores.scoreB ? 'WIN' : 'LOSE';
    }

    return 'PENDING';
}

export function resolveAutoSettlementStatusFromMatch({
    matchMeta,
    gameNumber,
    type,
    side,
    threshold,
    teamAId,
    teamBId,
}: {
    matchMeta?: OddsMatchMeta | null;
    gameNumber: number;
    type: OddsType;
    side: BetSide;
    threshold?: number | null;
    teamAId?: string | null;
    teamBId?: string | null;
}): BetStatus {
    const game = matchMeta?.games?.find((item) => item.gameNumber === gameNumber);
    return resolveAutoSettlementStatusFromGame({
        type,
        side,
        threshold,
        teamAId,
        teamBId,
        game,
    });
}

export function reconcileStoredOddsRecordFromGames(
    record: StoredOddsResult,
    games?: OddsGameMeta[] | null,
): StoredOddsResult {
    const game = games?.find((item) => item.gameNumber === record.gameNumber);
    const threshold = getRecordActualThreshold(record);
    const settledStatus = resolveAutoSettlementStatusFromGame({
        type: record.type,
        side: record.side,
        threshold,
        teamAId: record.teamAId,
        teamBId: record.teamBId,
        game,
    });

    let resultValue = record.resultValue;
    if (settledStatus === 'PENDING') {
        resultValue = undefined;
    } else if (Number.isFinite(record.actualStakeAmount) && Number(record.actualStakeAmount) >= 0) {
        resultValue = calculateResultValueFromStake(record.actualStakeAmount, settledStatus, record.actualOddsRaw);
    } else if (settledStatus === 'PUSH') {
        resultValue = 0;
    }

    return {
        ...record,
        settledStatus,
        resultValue,
    };
}

export function getRecordActualThreshold(record: StoredOddsResult): number | null {
    if (record.actualThreshold === null) return null;
    if (Number.isFinite(record.actualThreshold)) return Number(record.actualThreshold);
    if (record.threshold === null) return null;
    return Number.isFinite(record.threshold) ? Number(record.threshold) : null;
}

export function getRecordSelectionLabel(record: StoredOddsResult): string {
    if (record.actualSelectionLabel?.trim()) return record.actualSelectionLabel.trim();
    if (record.selectionLabel?.trim()) return record.selectionLabel.trim();
    return '';
}

export function getRecordProviderLabel(record: StoredOddsResult): string {
    return record.actualProvider?.trim() || record.provider?.trim() || '';
}

export function getStatusFromResultValue(resultValue?: number): BetStatus {
    if (!Number.isFinite(resultValue)) return 'PENDING';
    if ((resultValue as number) > 0) return 'WIN';
    if ((resultValue as number) < 0) return 'LOSE';
    return 'PUSH';
}

export function getGroupedStatusFromRecords(records: StoredOddsResult[]): BetStatus {
    if (records.length === 0) return 'PENDING';

    let total = 0;
    let hasNumeric = false;
    let hasPush = false;

    for (const record of records) {
        if (Number.isFinite(record.resultValue)) {
            total += Number(record.resultValue);
            hasNumeric = true;
            continue;
        }

        const status = record.settledStatus || getStatusFromResultValue(record.resultValue);
        if (status === 'PUSH') hasPush = true;
    }

    if (hasNumeric) {
        if (total > 0) return 'WIN';
        if (total < 0) return 'LOSE';
        return 'PUSH';
    }

    return hasPush ? 'PUSH' : 'PENDING';
}

export function formatSignedNumber(value: number): string {
    const normalized = Math.abs(value) < 0.05 ? 0 : value;
    if (normalized > 0) return `+${normalized.toFixed(1)}`;
    if (normalized < 0) return `${normalized.toFixed(1)}`;
    return '0.0';
}

export function formatAmountNumber(value: number): string {
    const normalized = Math.abs(value) < 0.05 ? 0 : value;
    return normalized.toFixed(1);
}

export function formatCounter(counter: StatusCounter): string {
    const total = counter.WIN + counter.LOSE + counter.PUSH + counter.PENDING;
    if (total === 0) return '-';
    return `赢${counter.WIN} / 输${counter.LOSE} / 走${counter.PUSH} / 待${counter.PENDING}`;
}

export function formatWinRate(value: number | null): string {
    if (value === null) return '-';
    return `${value.toFixed(1)}%`;
}

export function getWinRate(counter: StatusCounter): number | null {
    const decided = counter.WIN + counter.LOSE;
    if (decided === 0) return null;
    return (counter.WIN / decided) * 100;
}

export function bumpCounter(counter: StatusCounter, status: BetStatus) {
    counter[status] += 1;
}

export function normalizeStoredOdds(raw: any, fallbackMatchId: string): StoredOddsResult | null {
    if (!raw || typeof raw !== 'object') return null;

    const type = String(raw.type || '').toUpperCase() as OddsType;
    const side = String(raw.side || '').toUpperCase() as BetSide;
    const gameNumber = Number(raw.gameNumber);
    const resultValue = Number(raw.resultValue);
    const oddsValue = Number(raw.oddsValue);
    const oppositeOddsValue = Number(raw.oppositeOddsValue);
    const actualThreshold = Number(raw.actualThreshold);
    const actualOddsRaw = Number(raw.actualOddsRaw);
    const actualOddsNormalized = Number(raw.actualOddsNormalized);
    const actualStakeAmount = Number(raw.actualStakeAmount);

    if (!['WINNER', 'HANDICAP', 'KILLS', 'TIME'].includes(type)) return null;
    if (!['LEFT', 'RIGHT'].includes(side)) return null;
    if (!Number.isFinite(gameNumber) || gameNumber <= 0) return null;

    return {
        id: typeof raw.id === 'string' ? raw.id : createStoredOddsId(),
        matchId: typeof raw.matchId === 'string' ? raw.matchId : fallbackMatchId,
        gameNumber,
        type,
        side,
        threshold: raw.threshold === null || raw.threshold === undefined ? null : Number(raw.threshold),
        selectionLabel: typeof raw.selectionLabel === 'string' ? raw.selectionLabel : '',
        detail: typeof raw.detail === 'string' ? raw.detail : '',
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
        resultValue: Number.isFinite(resultValue) ? resultValue : undefined,
        settledStatus:
            raw.settledStatus === 'WIN' || raw.settledStatus === 'LOSE' || raw.settledStatus === 'PUSH' || raw.settledStatus === 'PENDING'
                ? raw.settledStatus
                : getStatusFromResultValue(Number.isFinite(resultValue) ? resultValue : undefined),
        oddsValue: Number.isFinite(oddsValue) && oddsValue > 0 ? oddsValue : undefined,
        oppositeOddsValue: Number.isFinite(oppositeOddsValue) && oppositeOddsValue > 0 ? oppositeOddsValue : undefined,
        provider: typeof raw.provider === 'string' ? raw.provider : undefined,
        actualThreshold: raw.actualThreshold === null || raw.actualThreshold === undefined ? undefined : (Number.isFinite(actualThreshold) ? actualThreshold : undefined),
        actualSelectionLabel: typeof raw.actualSelectionLabel === 'string' ? raw.actualSelectionLabel : undefined,
        actualOddsRaw: Number.isFinite(actualOddsRaw) && actualOddsRaw > 0 ? actualOddsRaw : undefined,
        actualOddsNormalized: Number.isFinite(actualOddsNormalized) && actualOddsNormalized > 0 ? actualOddsNormalized : undefined,
        actualOddsFormat: raw.actualOddsFormat === 'HK' || raw.actualOddsFormat === 'EU' ? raw.actualOddsFormat : undefined,
        actualProvider: typeof raw.actualProvider === 'string' ? raw.actualProvider : undefined,
        actualStakeAmount: Number.isFinite(actualStakeAmount) && actualStakeAmount >= 0 ? actualStakeAmount : undefined,
        teamAId: typeof raw.teamAId === 'string' ? raw.teamAId : undefined,
        teamBId: typeof raw.teamBId === 'string' ? raw.teamBId : undefined,
        teamAName: typeof raw.teamAName === 'string' ? raw.teamAName : undefined,
        teamBName: typeof raw.teamBName === 'string' ? raw.teamBName : undefined,
        teamARegion: typeof raw.teamARegion === 'string' ? raw.teamARegion : undefined,
        teamBRegion: typeof raw.teamBRegion === 'string' ? raw.teamBRegion : undefined,
        matchStartTime: typeof raw.matchStartTime === 'string' ? raw.matchStartTime : undefined,
        tournament: typeof raw.tournament === 'string' ? raw.tournament : undefined,
        stage: typeof raw.stage === 'string' ? raw.stage : undefined,
    };
}

export function loadLegacyStoredOddsForMatch(matchId: string): StoredOddsResult[] {
    if (typeof window === 'undefined') return [];

    try {
        const raw = window.localStorage.getItem(getStorageKey(matchId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => normalizeStoredOdds(item, matchId))
            .filter((item): item is StoredOddsResult => item !== null);
    } catch {
        return [];
    }
}

export function loadAllLegacyStoredOdds(): StoredOddsResult[] {
    if (typeof window === 'undefined') return [];

    const records: StoredOddsResult[] = [];
    const storage = window.localStorage;

    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !key.startsWith(BET_STORAGE_PREFIX)) continue;

        const matchId = key.slice(BET_STORAGE_PREFIX.length);
        const raw = storage.getItem(key);
        if (!raw) continue;

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) continue;

            for (const item of parsed) {
                const normalized = normalizeStoredOdds(item, matchId);
                if (normalized) records.push(normalized);
            }
        } catch {            // Ignore malformed entries.
        }
    }

    return records;
}

export function persistLegacyStoredOdds(matchId: string, records: StoredOddsResult[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getStorageKey(matchId), JSON.stringify(records));
    window.dispatchEvent(new Event('virtual-bets-updated'));
}

export function createMatchLookup(matches: OddsMatchMeta[]): Map<string, OddsMatchMeta> {
    return new Map(matches.map((match) => [match.id, match]));
}

function createMetricSummary(key: TeamMetricKey): TeamMetricSummary {
    return {
        key,
        label: TEAM_METRIC_LABELS[key],
        total: 0,
        counter: createCounter(),
        settledCount: 0,
        winRate: null,
        recentMatches: [],
    };
}

function createRecentMatchSummary(matchId: string, matchLabel: string, opponentName: string, updatedAt: string): RecentMatchMetric {
    return {
        matchId,
        matchLabel,
        opponentName,
        total: 0,
        counter: createCounter(),
        updatedAt,
    };
}

function createExactMarketSummary(key: string, label: string, metricKey: TeamMetricKey): ExactMarketSummary {
    return {
        key,
        label,
        metricKey,
        total: 0,
        counter: createCounter(),
        settledCount: 0,
        winRate: null,
        averageOdds: null,
        expectedUnitReturn: null,
        lossRate: null,
        averageStake: null,
        averageSettlement: null,
        averageLineDelta: null,
        recentMatches: [],
    };
}

function recordBelongsToTeamMatch(record: StoredOddsResult, teamIds: Set<string>): boolean {
    const teamAId = String(record.teamAId || '');
    const teamBId = String(record.teamBId || '');
    return teamIds.has(teamAId) || teamIds.has(teamBId);
}

function getMetricKeysForTeam(record: StoredOddsResult, teamIds: Set<string>): TeamMetricKey[] {
    if (!recordBelongsToTeamMatch(record, teamIds)) return [];

    if (record.type === 'WINNER') return ['winner'];
    if (record.type === 'HANDICAP') return ['handicap'];

    if (record.type === 'KILLS') return ['killsAll', record.side === 'LEFT' ? 'killsOver' : 'killsUnder'];
    if (record.type === 'TIME') return ['timeAll', record.side === 'LEFT' ? 'timeOver' : 'timeUnder'];

    return [];
}

function getRecordTimestamp(record: StoredOddsResult, matchMeta?: OddsMatchMeta): string {
    return matchMeta?.startTime || record.matchStartTime || record.createdAt;
}

function getOpponentName(record: StoredOddsResult, teamIds: Set<string>, matchMeta?: OddsMatchMeta): string {
    if (matchMeta) {
        if (teamIds.has(String(matchMeta.teamAId || ''))) return getTeamShortDisplayName(matchMeta.teamBName || record.teamBName || '未知对手');
        if (teamIds.has(String(matchMeta.teamBId || ''))) return getTeamShortDisplayName(matchMeta.teamAName || record.teamAName || '未知对手');
    }

    if (teamIds.has(String(record.teamAId || ''))) return getTeamShortDisplayName(record.teamBName || '未知对手');
    if (teamIds.has(String(record.teamBId || ''))) return getTeamShortDisplayName(record.teamAName || '未知对手');
    return '未知对手';
}

function getMatchLabel(record: StoredOddsResult, matchMeta?: OddsMatchMeta): string {
    const teamAName = getTeamShortDisplayName(matchMeta?.teamAName || record.teamAName || '队伍A');
    const teamBName = getTeamShortDisplayName(matchMeta?.teamBName || record.teamBName || '队伍B');
    return `${teamAName} vs ${teamBName}`;
}

export function buildTeamOddsSummary(
    records: StoredOddsResult[],
    team: { id: string; name: string; shortName?: string | null; aliasIds?: string[] },
    matchLookup?: Map<string, OddsMatchMeta>,
): TeamOddsSummary {
    const aliasIds = Array.from(new Set([team.id, ...(team.aliasIds || [])].filter(Boolean)));
    const teamIds = new Set(aliasIds);
    const metrics = Object.fromEntries(TEAM_METRIC_ORDER.map((key) => [key, createMetricSummary(key)])) as Record<TeamMetricKey, TeamMetricSummary>;
    const recentMap = new Map<TeamMetricKey, Map<string, RecentMatchMetric>>();
    const matchIds = new Set<string>();
    let totalRecords = 0;
    let overallTotal = 0;

    for (const record of records) {
        const keys = getMetricKeysForTeam(record, teamIds);
        if (keys.length === 0) continue;

        const matchMeta = matchLookup?.get(record.matchId);
        const status = getStatusFromResultValue(record.resultValue);
        const numericValue = Number.isFinite(record.resultValue) ? (record.resultValue as number) : 0;

        matchIds.add(record.matchId);
        totalRecords += 1;
        overallTotal += numericValue;

        for (const key of keys) {
            const metric = metrics[key];
            metric.total += numericValue;
            bumpCounter(metric.counter, status);
            if (status !== 'PENDING') metric.settledCount += 1;

            let bucket = recentMap.get(key);
            if (!bucket) {
                bucket = new Map<string, RecentMatchMetric>();
                recentMap.set(key, bucket);
            }

            const existing = bucket.get(record.matchId);
            if (existing) {
                existing.total += numericValue;
                bumpCounter(existing.counter, status);
                if (getRecordTimestamp(record, matchMeta) > existing.updatedAt) {
                    existing.updatedAt = getRecordTimestamp(record, matchMeta);
                }
            } else {
                const next = createRecentMatchSummary(
                    record.matchId,
                    getMatchLabel(record, matchMeta),
                    getOpponentName(record, teamIds, matchMeta),
                    getRecordTimestamp(record, matchMeta),
                );
                next.total = numericValue;
                bumpCounter(next.counter, status);
                bucket.set(record.matchId, next);
            }
        }
    }

    for (const key of TEAM_METRIC_ORDER) {
        metrics[key].winRate = getWinRate(metrics[key].counter);

        const bucket = recentMap.get(key);
        if (!bucket) continue;

        metrics[key].recentMatches = Array.from(bucket.values())
            .sort((a, b) => {
                const at = new Date(a.updatedAt).getTime();
                const bt = new Date(b.updatedAt).getTime();
                return bt - at;
            })
            .slice(0, 3)
            .map((item) => ({
                ...item,
                counter: cloneCounter(item.counter),
            }));
    }

    return {
        teamId: team.id,
        aliasIds,
        teamName: String(team.shortName || getTeamShortDisplayName(team.name)).toUpperCase(),
        matchCount: matchIds.size,
        totalRecords,
        overallTotal,
        metrics,
    };
}

export function buildExactMarketSummaries(
    records: StoredOddsResult[],
    team: { id: string; name: string; shortName?: string | null; aliasIds?: string[] },
    matchLookup?: Map<string, OddsMatchMeta>,
): ExactMarketSummary[] {
    const teamIds = new Set([team.id, ...(team.aliasIds || [])].filter(Boolean));
    const summaryMap = new Map<string, ExactMarketSummary>();
    const recentMap = new Map<string, Map<string, RecentMatchMetric>>();
    const oddsSamples = new Map<string, Array<{ payout: number; status: BetStatus }>>();
    const stakeSamples = new Map<string, number[]>();
    const settlementSamples = new Map<string, number[]>();
    const lineDeltaSamples = new Map<string, number[]>();

    for (const record of records) {
        const metricKeys = getMetricKeysForTeam(record, teamIds);
        if (metricKeys.length === 0) continue;
        const metricKey = metricKeys[metricKeys.length - 1];
        const label = getRecordSelectionLabel(record) || TEAM_METRIC_LABELS[metricKey];
        const groupKey = `${metricKey}::${label}`;
        const matchMeta = matchLookup?.get(record.matchId);
        const status = getStatusFromResultValue(record.resultValue);
        const numericValue = Number.isFinite(record.resultValue) ? Number(record.resultValue) : 0;
        const existing = summaryMap.get(groupKey) || createExactMarketSummary(groupKey, label, metricKey);

        existing.total += numericValue;
        bumpCounter(existing.counter, status);
        if (status !== 'PENDING') existing.settledCount += 1;

        const recentByMatch = recentMap.get(groupKey) || new Map<string, RecentMatchMetric>();
        const currentRecent =
            recentByMatch.get(record.matchId) ||
            createRecentMatchSummary(record.matchId, getMatchLabel(record, matchMeta), getOpponentName(record, teamIds, matchMeta), getRecordTimestamp(record, matchMeta));
        currentRecent.total += numericValue;
        bumpCounter(currentRecent.counter, status);
        currentRecent.updatedAt = getRecordTimestamp(record, matchMeta);
        recentByMatch.set(record.matchId, currentRecent);
        recentMap.set(groupKey, recentByMatch);

        const normalizedOdds = getRecordActualOdds(record);
        if (normalizedOdds !== null && (status === 'WIN' || status === 'LOSE')) {
            const bucket = oddsSamples.get(groupKey) || [];
            bucket.push({
                payout: normalizedOdds,
                status,
            });
            oddsSamples.set(groupKey, bucket);
        }

        if (Number.isFinite(record.actualStakeAmount) && (record.actualStakeAmount as number) >= 0) {
            const bucket = stakeSamples.get(groupKey) || [];
            bucket.push(Number(record.actualStakeAmount));
            stakeSamples.set(groupKey, bucket);
        }

        if (Number.isFinite(record.resultValue)) {
            const bucket = settlementSamples.get(groupKey) || [];
            bucket.push(Number(record.resultValue));
            settlementSamples.set(groupKey, bucket);
        }

        if (record.type !== 'WINNER' && Number.isFinite(record.actualThreshold) && Number.isFinite(record.threshold)) {
            const bucket = lineDeltaSamples.get(groupKey) || [];
            bucket.push(Number(record.actualThreshold) - Number(record.threshold));
            lineDeltaSamples.set(groupKey, bucket);
        }

        summaryMap.set(groupKey, existing);
    }

    return Array.from(summaryMap.values())
        .map((summary) => {
            summary.winRate = getWinRate(summary.counter);
            const recentMatches = Array.from(recentMap.get(summary.key)?.values() || [])
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 3);
            summary.recentMatches = recentMatches;

            const priced = oddsSamples.get(summary.key) || [];
            if (priced.length > 0) {
                const totalOdds = priced.reduce((sum, item) => sum + item.payout, 0);
                const unitReturns = priced.map((item) => (item.status === 'WIN' ? item.payout : -1));
                const totalReturn = unitReturns.reduce((sum, item) => sum + item, 0);
                const loseCount = priced.filter((item) => item.status === 'LOSE').length;
                summary.averageOdds = Number((totalOdds / priced.length).toFixed(3));
                summary.expectedUnitReturn = Number((totalReturn / priced.length).toFixed(2));
                summary.lossRate = Number(((loseCount / priced.length) * 100).toFixed(1));
            }

            const stakes = stakeSamples.get(summary.key) || [];
            if (stakes.length > 0) {
                summary.averageStake = Number((stakes.reduce((sum, item) => sum + item, 0) / stakes.length).toFixed(2));
            }

            const settlements = settlementSamples.get(summary.key) || [];
            if (settlements.length > 0) {
                summary.averageSettlement = Number((settlements.reduce((sum, item) => sum + item, 0) / settlements.length).toFixed(2));
            }

            const lineDeltas = lineDeltaSamples.get(summary.key) || [];
            if (lineDeltas.length > 0) {
                summary.averageLineDelta = Number((lineDeltas.reduce((sum, item) => sum + item, 0) / lineDeltas.length).toFixed(2));
            }

            return summary;
        })
        .sort((a, b) => {
            const returnDiff = (b.expectedUnitReturn ?? -999) - (a.expectedUnitReturn ?? -999);
            if (returnDiff !== 0) return returnDiff;
            const winRateDiff = (b.winRate ?? 0) - (a.winRate ?? 0);
            if (winRateDiff !== 0) return winRateDiff;
            return Math.abs(b.total) - Math.abs(a.total);
        });
}

export function summarizeGlobalOverUnder(records: StoredOddsResult[]) {
    const summary = {
        killsOver: createMetricSummary('killsOver'),
        killsUnder: createMetricSummary('killsUnder'),
        timeOver: createMetricSummary('timeOver'),
        timeUnder: createMetricSummary('timeUnder'),
    };

    for (const record of records) {
        const status = getStatusFromResultValue(record.resultValue);
        const numericValue = Number.isFinite(record.resultValue) ? (record.resultValue as number) : 0;

        if (record.type === 'KILLS' && record.side === 'LEFT') {
            summary.killsOver.total += numericValue;
            bumpCounter(summary.killsOver.counter, status);
            if (status !== 'PENDING') summary.killsOver.settledCount += 1;
        }
        if (record.type === 'KILLS' && record.side === 'RIGHT') {
            summary.killsUnder.total += numericValue;
            bumpCounter(summary.killsUnder.counter, status);
            if (status !== 'PENDING') summary.killsUnder.settledCount += 1;
        }
        if (record.type === 'TIME' && record.side === 'LEFT') {
            summary.timeOver.total += numericValue;
            bumpCounter(summary.timeOver.counter, status);
            if (status !== 'PENDING') summary.timeOver.settledCount += 1;
        }
        if (record.type === 'TIME' && record.side === 'RIGHT') {
            summary.timeUnder.total += numericValue;
            bumpCounter(summary.timeUnder.counter, status);
            if (status !== 'PENDING') summary.timeUnder.settledCount += 1;
        }
    }

    summary.killsOver.winRate = getWinRate(summary.killsOver.counter);
    summary.killsUnder.winRate = getWinRate(summary.killsUnder.counter);
    summary.timeOver.winRate = getWinRate(summary.timeOver.counter);
    summary.timeUnder.winRate = getWinRate(summary.timeUnder.counter);

    return summary;
}

