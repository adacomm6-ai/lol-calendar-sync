'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import {
    STRATEGY_RUNTIME_STATE_ROW_ID,
    buildStrategyScopeStateRowId,
    normalizeStrategyRuntimeState,
    normalizeStrategyScopeState,
    parseStoredStrategyRuntimeState,
    parseStoredStrategyScopeState,
    type StrategyLegacyMigrationPayload,
    type StrategyRuntimeState,
    type StrategyScopeState,
} from '@/lib/strategy-state';

async function loadScopeState(scopeKey: string, fallbackDate: string): Promise<StrategyScopeState> {
    const row = await prisma.systemSettings.findUnique({
        where: { id: buildStrategyScopeStateRowId(scopeKey) },
    });
    return parseStoredStrategyScopeState(row?.data || null, fallbackDate);
}

async function loadRuntimeState(): Promise<StrategyRuntimeState> {
    const row = await prisma.systemSettings.findUnique({
        where: { id: STRATEGY_RUNTIME_STATE_ROW_ID },
    });
    return parseStoredStrategyRuntimeState(row?.data || null);
}

export async function fetchStrategyScopeState(scopeKey: string, fallbackDate: string): Promise<StrategyScopeState> {
    return loadScopeState(scopeKey, fallbackDate);
}

export async function saveStrategyScopeState(
    scopeKey: string,
    fallbackDate: string,
    nextState: StrategyScopeState,
): Promise<StrategyScopeState> {
    const normalized = normalizeStrategyScopeState(nextState, fallbackDate);
    const payload: StrategyScopeState = {
        ...normalized,
        updatedAt: new Date().toISOString(),
    };

    await prisma.systemSettings.upsert({
        where: { id: buildStrategyScopeStateRowId(scopeKey) },
        create: {
            id: buildStrategyScopeStateRowId(scopeKey),
            data: JSON.stringify(payload),
        },
        update: {
            data: JSON.stringify(payload),
        },
    });

    revalidatePath('/strategy');
    return payload;
}

export async function fetchStrategyRuntimeState(): Promise<StrategyRuntimeState> {
    return loadRuntimeState();
}

export async function saveStrategyRuntimeState(nextState: StrategyRuntimeState): Promise<StrategyRuntimeState> {
    const normalized = normalizeStrategyRuntimeState(nextState);
    const payload: StrategyRuntimeState = {
        ...normalized,
        updatedAt: new Date().toISOString(),
    };

    await prisma.systemSettings.upsert({
        where: { id: STRATEGY_RUNTIME_STATE_ROW_ID },
        create: {
            id: STRATEGY_RUNTIME_STATE_ROW_ID,
            data: JSON.stringify(payload),
        },
        update: {
            data: JSON.stringify(payload),
        },
    });

    revalidatePath('/strategy');
    return payload;
}

export async function dismissStrategyCriticalAlerts(dismissedCriticalKey: string): Promise<StrategyRuntimeState> {
    const runtime = await loadRuntimeState();
    return saveStrategyRuntimeState({
        ...runtime,
        dismissedCriticalKey,
    });
}

export async function mergeLegacyStrategyState(
    scopeKey: string,
    fallbackDate: string,
    legacy: StrategyLegacyMigrationPayload,
): Promise<{ scopeState: StrategyScopeState; runtimeState: StrategyRuntimeState; merged: boolean }> {
    const hasLegacyPayload =
        !!legacy.settings ||
        !!legacy.selectedStrategyId ||
        !!legacy.dismissedCriticalKey ||
        !!legacy.alertSnapshot ||
        (legacy.matchSelections ? Object.keys(legacy.matchSelections).length > 0 : false);

    const currentScope = await loadScopeState(scopeKey, fallbackDate);
    const currentRuntime = await loadRuntimeState();

    if (!hasLegacyPayload) {
        return { scopeState: currentScope, runtimeState: currentRuntime, merged: false };
    }

    const mergedScope: StrategyScopeState = {
        ...currentScope,
        settings: legacy.settings ? normalizeStrategyScopeState({ settings: legacy.settings }, fallbackDate).settings : currentScope.settings,
        selectedStrategyId:
            typeof legacy.selectedStrategyId === 'string' && legacy.selectedStrategyId.trim().length > 0
                ? legacy.selectedStrategyId.trim()
                : currentScope.selectedStrategyId,
        matchSelections: {
            ...currentScope.matchSelections,
            ...(legacy.matchSelections || {}),
        },
        updatedAt: new Date().toISOString(),
    };

    const mergedRuntime: StrategyRuntimeState = {
        dismissedCriticalKey:
            typeof legacy.dismissedCriticalKey === 'string'
                ? legacy.dismissedCriticalKey
                : currentRuntime.dismissedCriticalKey,
        alertSnapshot: legacy.alertSnapshot || currentRuntime.alertSnapshot,
        updatedAt: new Date().toISOString(),
    };

    await prisma.$transaction([
        prisma.systemSettings.upsert({
            where: { id: buildStrategyScopeStateRowId(scopeKey) },
            create: {
                id: buildStrategyScopeStateRowId(scopeKey),
                data: JSON.stringify(mergedScope),
            },
            update: {
                data: JSON.stringify(mergedScope),
            },
        }),
        prisma.systemSettings.upsert({
            where: { id: STRATEGY_RUNTIME_STATE_ROW_ID },
            create: {
                id: STRATEGY_RUNTIME_STATE_ROW_ID,
                data: JSON.stringify(mergedRuntime),
            },
            update: {
                data: JSON.stringify(mergedRuntime),
            },
        }),
    ]);

    revalidatePath('/strategy');
    return { scopeState: mergedScope, runtimeState: mergedRuntime, merged: true };
}
