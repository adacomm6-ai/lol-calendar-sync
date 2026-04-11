export interface RegionConfig {
    id: string;
    name: string;
}

export interface SplitConfig {
    id: string;
    name: string;
    mapping: string;
    regions?: string[];
    type?: 'league' | 'playoff' | 'cup';
}

export type MatchStageCategory = 'regular' | 'playin' | 'playoff' | 'other';

export interface MatchStageOption {
    id: string;
    label: string;
    category: MatchStageCategory;
    enabled?: boolean;
}

export interface StandingGroup {
    name: string;
    cnName: string;
    teams: string[];
}

export interface StandingGroupConfig {
    region: string;
    year: string;
    split: string;
    groups: StandingGroup[];
}

export interface PointAdjustment {
    teamId: string;
    region: string;
    year: string;
    split: string;
    points: number;
    reason: string;
}

export interface StrategyExactRecommendationWeightConfig {
    historicalWinRate: number;
    historicalReturn: number;
    recentTrend: number;
    teamModel: number;
    tempoEnvironment: number;
    riskAdjustment: number;
}

export interface StrategyExactAllocationWeightConfig {
    base: number;
    winRate: number;
    historicalReturn: number;
    historicalPnl: number;
    sampleAndRisk: number;
    dailyForm: number;
    teamModel: number;
    tempoEnvironment: number;
    parentAllocation: number;
    volatilityAdjustment: number;
}

export interface StrategyMarketTypeAllocationWeightConfig {
    base: number;
    historicalWinRate: number;
    historicalPnl: number;
    dailyForm: number;
    pricingReturn: number;
    riskCost: number;
    matchEnvironment: number;
    riskAdjustment: number;
}

export interface StrategyScoreWeightsConfig {
    exactRecommendation: StrategyExactRecommendationWeightConfig;
    exactAllocation: StrategyExactAllocationWeightConfig;
    marketTypeAllocation: StrategyMarketTypeAllocationWeightConfig;
}

export type StrategyMarketTypeKey = 'winner' | 'handicap' | 'kills' | 'time';
export type StrategyScorePresetId = 'balanced' | 'history' | 'live' | 'tempo' | 'custom';
export type StrategyScorePresetOverride = Exclude<StrategyScorePresetId, 'custom'> | 'inherit';
export type StrategyScorePresetOverrides = Record<StrategyMarketTypeKey, StrategyScorePresetOverride>;

export interface StrategyScorePresetOption {
    id: Exclude<StrategyScorePresetId, 'custom'>;
    label: string;
    description: string;
    weights: StrategyScoreWeightsConfig;
}

export interface SystemConfigData {
    regions: RegionConfig[];
    years: string[];
    splits: SplitConfig[];
    defaultRegion: string;
    defaultYear: string;
    defaultSplit: string;
    matchStageOptions?: MatchStageOption[];
    standingsGroups?: StandingGroupConfig[];
    pointAdjustments?: PointAdjustment[];
    strategyScoreWeights?: StrategyScoreWeightsConfig;
    strategyScorePresetId?: StrategyScorePresetId;
    strategyScorePresetOverrides?: StrategyScorePresetOverrides;
}

export const DEFAULT_STRATEGY_SCORE_WEIGHTS: StrategyScoreWeightsConfig = {
    exactRecommendation: {
        historicalWinRate: 1,
        historicalReturn: 1,
        recentTrend: 1,
        teamModel: 1,
        tempoEnvironment: 1,
        riskAdjustment: 1,
    },
    exactAllocation: {
        base: 1,
        winRate: 1,
        historicalReturn: 1,
        historicalPnl: 1,
        sampleAndRisk: 1,
        dailyForm: 1,
        teamModel: 1,
        tempoEnvironment: 1,
        parentAllocation: 1,
        volatilityAdjustment: 1,
    },
    marketTypeAllocation: {
        base: 1,
        historicalWinRate: 1,
        historicalPnl: 1,
        dailyForm: 1,
        pricingReturn: 1,
        riskCost: 1,
        matchEnvironment: 1,
        riskAdjustment: 1,
    },
};

export const DEFAULT_STRATEGY_SCORE_PRESET_OVERRIDES: StrategyScorePresetOverrides = {
    winner: 'inherit',
    handicap: 'inherit',
    kills: 'inherit',
    time: 'inherit',
};

export const STRATEGY_SCORE_PRESETS: StrategyScorePresetOption[] = [
    {
        id: 'balanced',
        label: '平衡版',
        description: '保持历史、模型、节奏、当日信号均衡，适合作为默认方案。',
        weights: DEFAULT_STRATEGY_SCORE_WEIGHTS,
    },
    {
        id: 'history',
        label: '历史优先',
        description: '放大历史胜率、历史回报、样本质量，弱化当日手感干扰。',
        weights: {
            exactRecommendation: {
                historicalWinRate: 1.4,
                historicalReturn: 1.35,
                recentTrend: 0.9,
                teamModel: 1.1,
                tempoEnvironment: 0.8,
                riskAdjustment: 1.25,
            },
            exactAllocation: {
                base: 1,
                winRate: 1.35,
                historicalReturn: 1.35,
                historicalPnl: 1.2,
                sampleAndRisk: 1.3,
                dailyForm: 0.65,
                teamModel: 1.05,
                tempoEnvironment: 0.8,
                parentAllocation: 0.95,
                volatilityAdjustment: 1.15,
            },
            marketTypeAllocation: {
                base: 1,
                historicalWinRate: 1.35,
                historicalPnl: 1.2,
                dailyForm: 0.7,
                pricingReturn: 1.35,
                riskCost: 1.3,
                matchEnvironment: 0.85,
                riskAdjustment: 1.2,
            },
        },
    },
    {
        id: 'live',
        label: '临场手感',
        description: '更重视当日输赢、连赢连亏和近期走势，适合做盘中动态分仓。',
        weights: {
            exactRecommendation: {
                historicalWinRate: 0.95,
                historicalReturn: 1,
                recentTrend: 1.45,
                teamModel: 1.05,
                tempoEnvironment: 0.9,
                riskAdjustment: 1.05,
            },
            exactAllocation: {
                base: 1,
                winRate: 0.95,
                historicalReturn: 1,
                historicalPnl: 0.95,
                sampleAndRisk: 0.95,
                dailyForm: 1.6,
                teamModel: 1.05,
                tempoEnvironment: 0.85,
                parentAllocation: 1.1,
                volatilityAdjustment: 1,
            },
            marketTypeAllocation: {
                base: 1,
                historicalWinRate: 0.95,
                historicalPnl: 0.95,
                dailyForm: 1.45,
                pricingReturn: 1,
                riskCost: 0.95,
                matchEnvironment: 0.9,
                riskAdjustment: 1.05,
            },
        },
    },
    {
        id: 'tempo',
        label: '节奏强化',
        description: '更强调击杀节奏、比赛时长和环境波动，适合大小盘和时间盘。',
        weights: {
            exactRecommendation: {
                historicalWinRate: 0.95,
                historicalReturn: 1,
                recentTrend: 1,
                teamModel: 1.05,
                tempoEnvironment: 1.55,
                riskAdjustment: 1,
            },
            exactAllocation: {
                base: 1,
                winRate: 0.9,
                historicalReturn: 1,
                historicalPnl: 0.95,
                sampleAndRisk: 1,
                dailyForm: 0.95,
                teamModel: 1,
                tempoEnvironment: 1.65,
                parentAllocation: 1,
                volatilityAdjustment: 1.1,
            },
            marketTypeAllocation: {
                base: 1,
                historicalWinRate: 0.95,
                historicalPnl: 0.95,
                dailyForm: 0.95,
                pricingReturn: 1,
                riskCost: 1,
                matchEnvironment: 1.55,
                riskAdjustment: 1.05,
            },
        },
    },
];

export function getStrategyScorePresetById(id?: string | null) {
    return STRATEGY_SCORE_PRESETS.find((item) => item.id === id) || null;
}

export function normalizeStrategyScorePresetId(value?: string | null): StrategyScorePresetId {
    if (value === 'custom') return 'custom';
    return getStrategyScorePresetById(value)?.id || 'balanced';
}

export function normalizeStrategyScorePresetOverride(value?: string | null): StrategyScorePresetOverride {
    if (value === 'inherit') return 'inherit';
    return getStrategyScorePresetById(value)?.id || 'inherit';
}

export function normalizeStrategyScorePresetOverrides(input?: Partial<StrategyScorePresetOverrides> | null): StrategyScorePresetOverrides {
    return {
        winner: normalizeStrategyScorePresetOverride(input?.winner),
        handicap: normalizeStrategyScorePresetOverride(input?.handicap),
        kills: normalizeStrategyScorePresetOverride(input?.kills),
        time: normalizeStrategyScorePresetOverride(input?.time),
    };
}

function normalizeWeight(value: unknown, fallback: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Number(numeric.toFixed(2)));
}

export function normalizeStrategyScoreWeights(input?: Partial<StrategyScoreWeightsConfig> | null): StrategyScoreWeightsConfig {
    return {
        exactRecommendation: {
            historicalWinRate: normalizeWeight(input?.exactRecommendation?.historicalWinRate, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactRecommendation.historicalWinRate),
            historicalReturn: normalizeWeight(input?.exactRecommendation?.historicalReturn, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactRecommendation.historicalReturn),
            recentTrend: normalizeWeight(input?.exactRecommendation?.recentTrend, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactRecommendation.recentTrend),
            teamModel: normalizeWeight(input?.exactRecommendation?.teamModel, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactRecommendation.teamModel),
            tempoEnvironment: normalizeWeight(input?.exactRecommendation?.tempoEnvironment, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactRecommendation.tempoEnvironment),
            riskAdjustment: normalizeWeight(input?.exactRecommendation?.riskAdjustment, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactRecommendation.riskAdjustment),
        },
        exactAllocation: {
            base: normalizeWeight(input?.exactAllocation?.base, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.base),
            winRate: normalizeWeight(input?.exactAllocation?.winRate, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.winRate),
            historicalReturn: normalizeWeight(input?.exactAllocation?.historicalReturn, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.historicalReturn),
            historicalPnl: normalizeWeight(input?.exactAllocation?.historicalPnl, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.historicalPnl),
            sampleAndRisk: normalizeWeight(input?.exactAllocation?.sampleAndRisk, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.sampleAndRisk),
            dailyForm: normalizeWeight(input?.exactAllocation?.dailyForm, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.dailyForm),
            teamModel: normalizeWeight(input?.exactAllocation?.teamModel, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.teamModel),
            tempoEnvironment: normalizeWeight(input?.exactAllocation?.tempoEnvironment, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.tempoEnvironment),
            parentAllocation: normalizeWeight(input?.exactAllocation?.parentAllocation, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.parentAllocation),
            volatilityAdjustment: normalizeWeight(input?.exactAllocation?.volatilityAdjustment, DEFAULT_STRATEGY_SCORE_WEIGHTS.exactAllocation.volatilityAdjustment),
        },
        marketTypeAllocation: {
            base: normalizeWeight(input?.marketTypeAllocation?.base, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.base),
            historicalWinRate: normalizeWeight(input?.marketTypeAllocation?.historicalWinRate, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.historicalWinRate),
            historicalPnl: normalizeWeight(input?.marketTypeAllocation?.historicalPnl, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.historicalPnl),
            dailyForm: normalizeWeight(input?.marketTypeAllocation?.dailyForm, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.dailyForm),
            pricingReturn: normalizeWeight(input?.marketTypeAllocation?.pricingReturn, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.pricingReturn),
            riskCost: normalizeWeight(input?.marketTypeAllocation?.riskCost, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.riskCost),
            matchEnvironment: normalizeWeight(input?.marketTypeAllocation?.matchEnvironment, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.matchEnvironment),
            riskAdjustment: normalizeWeight(input?.marketTypeAllocation?.riskAdjustment, DEFAULT_STRATEGY_SCORE_WEIGHTS.marketTypeAllocation.riskAdjustment),
        },
    };
}

export const DEFAULT_STAGE_OPTIONS: MatchStageOption[] = [
    { id: 'Regular Season', label: '常规赛', category: 'regular', enabled: true },
    { id: 'Play-In', label: 'Play-In', category: 'playin', enabled: true },
    { id: 'Group Stage', label: '小组赛', category: 'regular', enabled: true },
    { id: 'Swiss Stage', label: '瑞士轮', category: 'regular', enabled: true },
    { id: 'Playoffs', label: '季后赛', category: 'playoff', enabled: true },
    { id: 'Grand Final', label: '总决赛', category: 'playoff', enabled: true },
];

export const MAJOR3_REGION_ID = 'MAJOR3';
export const MAJOR3_REGION_IDS = ['LPL', 'LCK', 'LEC'];
export const OTHER_REGION_ID = 'OTHER';
export const WORLDS_REGION_ID = 'WORLDS';
export const LEGACY_OTHER_REGION_IDS = ['其它赛区', '其他赛区', 'OTHER'];

export const DEFAULT_CONFIG: SystemConfigData = {
    regions: [
        { id: MAJOR3_REGION_ID, name: '三大赛区' },
        { id: 'LPL', name: 'LPL (中国)' },
        { id: 'LCK', name: 'LCK (韩国)' },
        { id: 'LEC', name: 'LEC (欧洲)' },
        { id: OTHER_REGION_ID, name: OTHER_REGION_ID },
        { id: WORLDS_REGION_ID, name: WORLDS_REGION_ID },
    ],
    years: ['2026'],
    splits: [
        { id: 'Split 1', name: '第一赛段 (Spring)', mapping: '第一赛段', type: 'league', regions: ['LPL', 'LCK', 'LEC', OTHER_REGION_ID] },
        { id: 'Split 1 Playoffs', name: '第一赛段季后赛 (Spring Playoffs)', mapping: '季后赛', type: 'playoff' },
        { id: 'Split 2', name: '第二赛段 (Summer)', mapping: '第二赛段', type: 'league' },
        { id: 'Split 3', name: '第三赛段 (Winter/Cup)', mapping: '第三赛段', type: 'league' },
        { id: WORLDS_REGION_ID, name: '全球先锋赛', mapping: '全球先锋赛', regions: [WORLDS_REGION_ID], type: 'cup' },
        { id: 'S', name: '全球总决赛 (Worlds)', mapping: 'Worlds', type: 'playoff' },
    ],
    defaultRegion: 'LPL',
    defaultYear: '2026',
    defaultSplit: 'Split 1',
    matchStageOptions: DEFAULT_STAGE_OPTIONS,
    strategyScoreWeights: DEFAULT_STRATEGY_SCORE_WEIGHTS,
    strategyScorePresetId: 'balanced',
    strategyScorePresetOverrides: DEFAULT_STRATEGY_SCORE_PRESET_OVERRIDES,
};
