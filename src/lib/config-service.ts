import { prisma } from '@/lib/db';
import {
    DEFAULT_CONFIG,
    DEFAULT_STAGE_OPTIONS,
    DEFAULT_STRATEGY_SCORE_WEIGHTS,
    LEGACY_OTHER_REGION_IDS,
    MAJOR3_REGION_ID,
    MAJOR3_REGION_IDS,
    OTHER_REGION_ID,
    WORLDS_REGION_ID,
    normalizeStrategyScorePresetId,
    normalizeStrategyScorePresetOverrides,
    normalizeStrategyScoreWeights,
    type MatchStageOption,
    type RegionConfig,
    type SplitConfig,
    type SystemConfigData,
} from '@/lib/config-shared';

export type {
    MatchStageCategory,
    MatchStageOption,
    PointAdjustment,
    RegionConfig,
    SplitConfig,
    StandingGroup,
    StandingGroupConfig,
    SystemConfigData,
} from '@/lib/config-shared';

export {
    DEFAULT_CONFIG,
    DEFAULT_STAGE_OPTIONS,
    MAJOR3_REGION_ID,
    MAJOR3_REGION_IDS,
    OTHER_REGION_ID,
    WORLDS_REGION_ID,
} from '@/lib/config-shared';

const PREFERRED_FALLBACK_SPLITS: SplitConfig[] = [
    { id: 'Split 1', name: '第一赛段', mapping: '第一赛段', type: 'league', regions: ['LPL', OTHER_REGION_ID] },
    { id: WORLDS_REGION_ID, name: '全球先锋赛', mapping: '全球先锋赛', regions: [WORLDS_REGION_ID], type: 'cup' },
    { id: 'LCK Cup', name: 'LCK杯', mapping: 'LCK杯', regions: ['LCK'], type: 'cup' },
    { id: 'LEC Spring', name: 'lec春季赛', mapping: 'lec春季赛', regions: [OTHER_REGION_ID], type: 'league' },
    { id: 'LCK Regular Season', name: 'lck常规赛', mapping: 'lck常规赛', regions: ['LCK'], type: 'league' },
];

const CLEAN_PREFERRED_FALLBACK_SPLITS: SplitConfig[] = [
    { id: 'Split 1', name: '第一赛段', mapping: '第一赛段', type: 'league', regions: ['LPL', OTHER_REGION_ID] },
    { id: WORLDS_REGION_ID, name: '全球先锋赛', mapping: '全球先锋赛', regions: [WORLDS_REGION_ID], type: 'cup' },
    { id: 'LCK Cup', name: 'LCK杯', mapping: 'LCK杯', regions: ['LCK'], type: 'cup' },
    { id: 'LEC Spring', name: 'lec春季赛', mapping: 'lec春季赛', regions: [OTHER_REGION_ID], type: 'league' },
    { id: 'LCK Regular Season', name: 'lck常规赛', mapping: 'lck常规赛', regions: ['LCK'], type: 'league' },
];

function canonicalizeRegionIdSafe(value?: string | null): string {
    const text = String(value || '').trim();
    const upper = text.toUpperCase();
    if (!text) return '';
    if (upper.includes('MAJOR3') || text.includes('三大赛区')) return MAJOR3_REGION_ID;
    if (upper.includes('LPL')) return 'LPL';
    if (upper.includes('LCK')) return 'LCK';
    if (upper.includes('LEC')) return 'LEC';
    if (['其它赛区', '其他赛区', OTHER_REGION_ID].includes(text) || upper.includes('OTHER')) return OTHER_REGION_ID;
    if (text.includes('国际赛事') || text.includes('全球先锋赛') || text.includes(WORLDS_REGION_ID) || upper.includes('WORLD') || upper.includes('MSI')) {
        return WORLDS_REGION_ID;
    }
    return text;
}

function shouldReplaceLegacyScheduleSplits(splits: SplitConfig[]) {
    const ids = new Set(splits.map((item) => String(item.id || '').trim()));
    return ids.has('Split 2') || ids.has('Split 3') || ids.has('Split 1 Playoffs') || ids.has('S');
}

function canonicalizeRegionId(value?: string | null): string {
    const text = String(value || '').trim();
    const upper = text.toUpperCase();
    if (!text) return '';
    if (upper.includes('MAJOR3') || text.includes('三大赛区')) return MAJOR3_REGION_ID;
    if (upper.includes('LPL')) return 'LPL';
    if (upper.includes('LCK')) return 'LCK';
    if (upper.includes('LEC')) return 'LEC';
    if (LEGACY_OTHER_REGION_IDS.includes(text) || upper.includes('OTHER')) return OTHER_REGION_ID;
    if (text.includes('国际赛事') || text.includes('全球先锋赛') || text.includes(WORLDS_REGION_ID) || upper.includes('WORLD') || upper.includes('MSI')) {
        return WORLDS_REGION_ID;
    }
    return text;
}

function looksLikeDemacia(value?: string | null): boolean {
    const text = String(value || '').trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    return lower === 'cup' || lower.includes('demacia') || text.includes('德玛西亚');
}

export function expandRegionScope(regionId: string): string[] {
    const canonical = canonicalizeRegionIdSafe(regionId);
    if (canonical === MAJOR3_REGION_ID) return MAJOR3_REGION_IDS;
    return canonical ? [canonical] : [];
}

function sanitizeRegions(input?: RegionConfig[] | null): RegionConfig[] {
    const base: RegionConfig[] = [
        { id: MAJOR3_REGION_ID, name: '三大赛区' },
        { id: 'LPL', name: 'LPL' },
        { id: 'LCK', name: 'LCK' },
        { id: 'LEC', name: 'LEC' },
        { id: OTHER_REGION_ID, name: OTHER_REGION_ID },
        { id: WORLDS_REGION_ID, name: WORLDS_REGION_ID },
    ];

    const merged = [...base, ...(input || [])]
        .map((item) => {
            const id = canonicalizeRegionId(item?.id || item?.name);
            const name =
                id === MAJOR3_REGION_ID
                    ? '三大赛区'
                    : id === OTHER_REGION_ID
                      ? OTHER_REGION_ID
                      : id === WORLDS_REGION_ID
                        ? WORLDS_REGION_ID
                        : String(item?.name || id).trim();
            return { id, name };
        })
        .filter((item) => item.id.length > 0);

    const deduped = new Map<string, RegionConfig>();
    for (const item of merged) {
        if (!deduped.has(item.id)) deduped.set(item.id, item);
    }
    return [...deduped.values()];
}

function sanitizeSplits(input?: SplitConfig[] | null): SplitConfig[] {
    const source = (input && input.length > 0 ? input : DEFAULT_CONFIG.splits)
        .filter((item) => !looksLikeDemacia(item.id) && !looksLikeDemacia(item.name) && !looksLikeDemacia(item.mapping))
        .map((item) => ({
            ...item,
            id: String(item.id || '').trim(),
            name: String(item.name || item.id || '').trim(),
            mapping: String(item.mapping || item.id || '').trim(),
            regions: item.regions?.map((region) => canonicalizeRegionId(region)).filter(Boolean),
        }))
        .filter((item) => item.id.length > 0 && item.name.length > 0 && item.mapping.length > 0);

    const deduped = new Map<string, SplitConfig>();
    for (const item of source) {
        if (!deduped.has(item.id)) deduped.set(item.id, item);
    }
    return [...deduped.values()];
}

function sanitizeRegionsSafe(input?: RegionConfig[] | null): RegionConfig[] {
    const base: RegionConfig[] = [
        { id: MAJOR3_REGION_ID, name: '三大赛区' },
        { id: 'LPL', name: 'LPL' },
        { id: 'LCK', name: 'LCK' },
        { id: 'LEC', name: 'LEC' },
        { id: OTHER_REGION_ID, name: OTHER_REGION_ID },
        { id: WORLDS_REGION_ID, name: WORLDS_REGION_ID },
    ];

    const merged = [...base, ...(input || [])]
        .map((item) => {
            const id = canonicalizeRegionIdSafe(item?.id || item?.name);
            const name =
                id === MAJOR3_REGION_ID
                    ? '三大赛区'
                    : id === OTHER_REGION_ID
                      ? OTHER_REGION_ID
                      : id === WORLDS_REGION_ID
                        ? WORLDS_REGION_ID
                        : String(item?.name || id).trim();
            return { id, name };
        })
        .filter((item) => item.id.length > 0);

    const deduped = new Map<string, RegionConfig>();
    for (const item of merged) {
        if (!deduped.has(item.id)) deduped.set(item.id, item);
    }
    return [...deduped.values()];
}

function sanitizeSplitsSafe(input?: SplitConfig[] | null): SplitConfig[] {
    const source = (input && input.length > 0 ? input : DEFAULT_CONFIG.splits)
        .filter((item) => !looksLikeDemacia(item.id) && !looksLikeDemacia(item.name) && !looksLikeDemacia(item.mapping))
        .map((item) => ({
            ...item,
            id: String(item.id || '').trim(),
            name: String(item.name || item.id || '').trim(),
            mapping: String(item.mapping || item.id || '').trim(),
            regions: item.regions?.map((region) => canonicalizeRegionIdSafe(region)).filter(Boolean),
        }))
        .filter((item) => item.id.length > 0 && item.name.length > 0 && item.mapping.length > 0);

    const deduped = new Map<string, SplitConfig>();
    for (const item of source) {
        if (!deduped.has(item.id)) deduped.set(item.id, item);
    }
    return [...deduped.values()];
}

function normalizeStageOptions(input?: MatchStageOption[] | null): MatchStageOption[] {
    if (!input || input.length === 0) return DEFAULT_STAGE_OPTIONS;

    const normalized = input
        .map((item) => ({
            id: (item?.id || '').trim(),
            label: (item?.label || item?.id || '').trim(),
            category: item?.category || 'other',
            enabled: item?.enabled !== false,
        }))
        .filter((item) => item.id.length > 0);

    return normalized.length > 0 ? normalized : DEFAULT_STAGE_OPTIONS;
}

function parseStoredConfig(parsed: Partial<SystemConfigData>): SystemConfigData {
    const regions = sanitizeRegionsSafe(parsed.regions);
    const rawSplits = sanitizeSplitsSafe(parsed.splits);
    const splits = rawSplits.length > 0 ? rawSplits : sanitizeSplitsSafe(CLEAN_PREFERRED_FALLBACK_SPLITS);
    const canonicalDefaultRegion = canonicalizeRegionIdSafe(parsed.defaultRegion);
    const defaultRegion = regions.some((r) => r.id === canonicalDefaultRegion)
        ? canonicalDefaultRegion
        : regions[0]?.id || DEFAULT_CONFIG.defaultRegion;
    const defaultSplit = splits.some((s) => s.id === parsed.defaultSplit)
        ? String(parsed.defaultSplit)
        : splits[0]?.id || CLEAN_PREFERRED_FALLBACK_SPLITS[0].id;
    const years = parsed.years && parsed.years.length > 0 ? parsed.years : ['2026'];

    return {
        ...DEFAULT_CONFIG,
        ...parsed,
        regions,
        years,
        splits,
        defaultRegion,
        defaultSplit,
        matchStageOptions: normalizeStageOptions(parsed.matchStageOptions),
        standingsGroups: parsed.standingsGroups || [],
        pointAdjustments: parsed.pointAdjustments || [],
        strategyScoreWeights: normalizeStrategyScoreWeights(parsed.strategyScoreWeights || DEFAULT_STRATEGY_SCORE_WEIGHTS),
        strategyScorePresetId: normalizeStrategyScorePresetId(parsed.strategyScorePresetId),
        strategyScorePresetOverrides: normalizeStrategyScorePresetOverrides(parsed.strategyScorePresetOverrides),
    };
}

export async function getSystemConfig(): Promise<SystemConfigData> {
    try {
        const row = await prisma.systemSettings.findUnique({
            where: { id: 'global' },
        });

        if (row?.data) {
            const parsed = JSON.parse(row.data) as Partial<SystemConfigData>;
            return parseStoredConfig(parsed);
        }
    } catch (e) {
        console.error('Error fetching system config:', e);
    }

    try {
        const rawRows = await prisma.$queryRawUnsafe<Array<{ data: string }>>(
            "SELECT data FROM SystemSettings WHERE id = 'global' LIMIT 1",
        );
        const rawData = String(rawRows?.[0]?.data || '').trim();
        if (rawData) {
            const parsed = JSON.parse(rawData) as Partial<SystemConfigData>;
            return parseStoredConfig(parsed);
        }
    } catch (e) {
        console.error('Error fetching system config via raw query:', e);
    }

    return {
        ...DEFAULT_CONFIG,
        regions: sanitizeRegionsSafe(DEFAULT_CONFIG.regions),
        years: ['2026'],
        splits: sanitizeSplitsSafe(CLEAN_PREFERRED_FALLBACK_SPLITS),
        defaultRegion: 'LPL',
        defaultYear: '2026',
        defaultSplit: 'Split 1',
        matchStageOptions: DEFAULT_STAGE_OPTIONS,
        strategyScoreWeights: normalizeStrategyScoreWeights(DEFAULT_CONFIG.strategyScoreWeights),
        strategyScorePresetId: normalizeStrategyScorePresetId(DEFAULT_CONFIG.strategyScorePresetId),
        strategyScorePresetOverrides: normalizeStrategyScorePresetOverrides(DEFAULT_CONFIG.strategyScorePresetOverrides),
    };
}

export async function saveSystemConfig(config: SystemConfigData) {
    const dataString = JSON.stringify({
        ...config,
        regions: sanitizeRegions(config.regions),
        splits: sanitizeSplits(config.splits),
        defaultRegion: canonicalizeRegionId(config.defaultRegion),
        matchStageOptions: normalizeStageOptions(config.matchStageOptions),
        strategyScoreWeights: normalizeStrategyScoreWeights(config.strategyScoreWeights),
        strategyScorePresetId: normalizeStrategyScorePresetId(config.strategyScorePresetId),
        strategyScorePresetOverrides: normalizeStrategyScorePresetOverrides(config.strategyScorePresetOverrides),
    });

    return await prisma.systemSettings.upsert({
        where: { id: 'global' },
        update: { data: dataString },
        create: { id: 'global', data: dataString },
    });
}
