import {
    STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY,
    STRATEGY_CHOICE_STORAGE_KEY,
    STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY,
    STRATEGY_MATCH_SELECTION_STORAGE_PREFIX,
    STRATEGY_SETTINGS_STORAGE_KEY,
    normalizeStrategySettings,
    parseStoredMatchSelection,
    parseStoredStrategySettings,
    type StrategyAlertSnapshot,
    type StrategySettings,
} from '@/lib/odds-strategy';

export const STRATEGY_SCOPE_STATE_ROW_PREFIX = 'strategy-state:';
export const STRATEGY_RUNTIME_STATE_ROW_ID = 'strategy-runtime';
export const STRATEGY_STATE_DB_MIGRATION_KEY = 'strategy-state-db-migrated-v1';

const LEGACY_STRATEGY_SETTINGS_STORAGE_KEY = 'odds-daily-strategy-settings';
const LEGACY_STRATEGY_CHOICE_STORAGE_KEY = 'odds-daily-strategy-choice';
const LEGACY_STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY = 'odds-critical-alert-dismissed';
const LEGACY_STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY = 'odds-daily-strategy-alert-snapshot';
const LEGACY_STRATEGY_MATCH_SELECTION_STORAGE_PREFIX = 'odds-daily-strategy-match-selection:';

type StorageLike = Pick<Storage, 'getItem' | 'length' | 'key'>;

export interface StrategyScopeState {
    settings: StrategySettings;
    selectedStrategyId: string;
    matchSelections: Record<string, string[]>;
    updatedAt: string;
}

export interface StrategyRuntimeState {
    dismissedCriticalKey: string;
    alertSnapshot: StrategyAlertSnapshot | null;
    updatedAt: string;
}

export interface StrategyLegacyMigrationPayload {
    settings?: StrategySettings | null;
    selectedStrategyId?: string | null;
    dismissedCriticalKey?: string | null;
    matchSelections?: Record<string, string[]> | null;
    alertSnapshot?: StrategyAlertSnapshot | null;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeStringArrayMap(value: unknown): Record<string, string[]> {
    if (!isObjectLike(value)) return {};
    const next: Record<string, string[]> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!Array.isArray(raw)) continue;
        const items = raw.filter((item): item is string => typeof item === 'string');
        if (items.length > 0) next[key] = items;
    }
    return next;
}

function sanitizeAlertSnapshot(value: unknown): StrategyAlertSnapshot | null {
    if (!isObjectLike(value)) return null;
    return {
        dateKey: typeof value.dateKey === 'string' ? value.dateKey : '',
        dayCutoffTime: typeof value.dayCutoffTime === 'string' ? value.dayCutoffTime : '06:00',
        selectedMatchIds: Array.isArray(value.selectedMatchIds)
            ? value.selectedMatchIds.filter((item): item is string => typeof item === 'string')
            : [],
        alerts: Array.isArray(value.alerts) ? value.alerts : [],
        criticalAlerts: Array.isArray(value.criticalAlerts) ? value.criticalAlerts : [],
        settledRecordCount: typeof value.settledRecordCount === 'number' ? value.settledRecordCount : 0,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    };
}

function parseJson(raw: string | null): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function readStorageValue(storage: StorageLike, currentKey: string, legacyKey?: string) {
    return storage.getItem(currentKey) ?? (legacyKey ? storage.getItem(legacyKey) : null);
}

export function buildStrategyScopeStateRowId(scopeKey: string) {
    return `${STRATEGY_SCOPE_STATE_ROW_PREFIX}${scopeKey}`;
}

export function createDefaultStrategyScopeState(fallbackDate: string): StrategyScopeState {
    return {
        settings: parseStoredStrategySettings(null, fallbackDate),
        selectedStrategyId: 'balanced',
        matchSelections: {},
        updatedAt: '',
    };
}

export function createDefaultStrategyRuntimeState(): StrategyRuntimeState {
    return {
        dismissedCriticalKey: '',
        alertSnapshot: null,
        updatedAt: '',
    };
}

export function parseStoredStrategyScopeState(raw: string | null, fallbackDate: string): StrategyScopeState {
    const fallback = createDefaultStrategyScopeState(fallbackDate);
    const parsed = parseJson(raw);
    if (!isObjectLike(parsed)) return fallback;

    const settingsSource = isObjectLike(parsed.settings) ? parsed.settings : parsed;

    return {
        settings: parseStoredStrategySettings(JSON.stringify(settingsSource), fallbackDate),
        selectedStrategyId:
            typeof parsed.selectedStrategyId === 'string' && parsed.selectedStrategyId.trim().length > 0
                ? parsed.selectedStrategyId.trim()
                : fallback.selectedStrategyId,
        matchSelections: sanitizeStringArrayMap(parsed.matchSelections),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
    };
}

export function parseStoredStrategyRuntimeState(raw: string | null): StrategyRuntimeState {
    const fallback = createDefaultStrategyRuntimeState();
    const parsed = parseJson(raw);
    if (!isObjectLike(parsed)) return fallback;

    return {
        dismissedCriticalKey:
            typeof parsed.dismissedCriticalKey === 'string' ? parsed.dismissedCriticalKey : fallback.dismissedCriticalKey,
        alertSnapshot: sanitizeAlertSnapshot(parsed.alertSnapshot),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
    };
}

export function normalizeStrategyScopeState(input: Partial<StrategyScopeState>, fallbackDate: string): StrategyScopeState {
    return {
        settings: normalizeStrategySettings(input.settings || parseStoredStrategySettings(null, fallbackDate)),
        selectedStrategyId:
            typeof input.selectedStrategyId === 'string' && input.selectedStrategyId.trim().length > 0
                ? input.selectedStrategyId.trim()
                : 'balanced',
        matchSelections: sanitizeStringArrayMap(input.matchSelections),
        updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    };
}

export function normalizeStrategyRuntimeState(input: Partial<StrategyRuntimeState>): StrategyRuntimeState {
    return {
        dismissedCriticalKey:
            typeof input.dismissedCriticalKey === 'string' ? input.dismissedCriticalKey : '',
        alertSnapshot: sanitizeAlertSnapshot(input.alertSnapshot),
        updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    };
}

export function loadLegacyStrategyStateFromStorage(
    storage: StorageLike,
    scopeKey: string,
    fallbackDate: string,
): StrategyLegacyMigrationPayload | null {
    const settingsRaw = readStorageValue(storage, STRATEGY_SETTINGS_STORAGE_KEY, LEGACY_STRATEGY_SETTINGS_STORAGE_KEY);
    const strategyIdRaw = readStorageValue(storage, STRATEGY_CHOICE_STORAGE_KEY, LEGACY_STRATEGY_CHOICE_STORAGE_KEY);
    const dismissedRaw = readStorageValue(
        storage,
        STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY,
        LEGACY_STRATEGY_CRITICAL_ALERT_DISMISSED_STORAGE_KEY,
    );
    const snapshotRaw = readStorageValue(storage, STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY, LEGACY_STRATEGY_ALERT_SNAPSHOT_STORAGE_KEY);

    const selectionPrefixes = [
        `${STRATEGY_MATCH_SELECTION_STORAGE_PREFIX}${scopeKey}:`,
        `${LEGACY_STRATEGY_MATCH_SELECTION_STORAGE_PREFIX}${scopeKey}:`,
    ];
    const matchSelections: Record<string, string[]> = {};
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key || !selectionPrefixes.some((prefix) => key.startsWith(prefix))) continue;
        const value = parseStoredMatchSelection(storage.getItem(key));
        if (value.length > 0) matchSelections[key] = value;
    }

    const payload: StrategyLegacyMigrationPayload = {};
    if (settingsRaw) payload.settings = parseStoredStrategySettings(settingsRaw, fallbackDate);
    if (strategyIdRaw) payload.selectedStrategyId = strategyIdRaw;
    if (dismissedRaw) payload.dismissedCriticalKey = dismissedRaw;
    if (Object.keys(matchSelections).length > 0) payload.matchSelections = matchSelections;
    if (snapshotRaw) payload.alertSnapshot = sanitizeAlertSnapshot(parseJson(snapshotRaw));

    return Object.keys(payload).length > 0 ? payload : null;
}
