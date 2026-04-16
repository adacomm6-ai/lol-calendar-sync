import { promises as fs } from 'fs';
import path from 'path';

import { NextRequest, NextResponse } from 'next/server';

import {
  applyRankSyncFailurePolicy,
  archiveDuplicateRankAccounts,
  archiveLowQualityAutoImportedAccounts,
  archivePlaceholderAccountsWithRealEquivalent,
  autoImportLeagueRankAccounts,
  consolidateEquivalentPlayerRankAccounts,
  ensurePlaceholderRankCoverage,
  refreshRankProfilesByPlayerIds,
} from '@/lib/player-rank-admin';
import { getCurrentSeasonRankEffectiveScope } from '@/lib/rank-effective-pool';
import { sanitizeRankTextDeep } from '@/lib/rank-text-normalizer';
import { syncRankAccountsViaRiot } from '@/lib/riot-rank-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AutoImportPayload = {
  regions: string[];
  overwriteExisting: boolean;
  limit?: number;
  playerNames?: string[];
  deepSearch?: boolean;
};

type AutoImportState =
  | {
      status: 'idle';
      startedAt: string | null;
      heartbeatAt: string | null;
      finishedAt: string | null;
      result: Record<string, unknown> | null;
      error: string | null;
      runnerPid: number | null;
    }
  | {
      status: 'running';
      startedAt: string;
      heartbeatAt: string | null;
      finishedAt: string | null;
      result: Record<string, unknown> | null;
      error: string | null;
      runnerPid: number | null;
    }
  | {
      status: 'success' | 'failed';
      startedAt: string;
      heartbeatAt: string | null;
      finishedAt: string;
      result: Record<string, unknown> | null;
      error: string | null;
      runnerPid: number | null;
    };

let runningPromise: Promise<void> | null = null;

const AUTO_IMPORT_RUNNING_TIMEOUT_MS = 90 * 60 * 1000;
const AUTO_IMPORT_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const AUTO_IMPORT_HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
  Pragma: 'no-cache',
  Expires: '0',
};

function getAutoImportStatePath() {
  return path.join(process.cwd(), 'data', 'rank-auto-import-last.json');
}

async function readAutoImportState(): Promise<AutoImportState> {
  try {
    const raw = await fs.readFile(getAutoImportStatePath(), 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') {
      return sanitizeRankTextDeep({
        status: ['idle', 'running', 'success', 'failed'].includes(String(parsed.status)) ? parsed.status : 'idle',
        startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
        heartbeatAt: typeof parsed.heartbeatAt === 'string' ? parsed.heartbeatAt : null,
        finishedAt: typeof parsed.finishedAt === 'string' ? parsed.finishedAt : null,
        result: parsed.result && typeof parsed.result === 'object' ? parsed.result : null,
        error: typeof parsed.error === 'string' ? parsed.error : null,
        runnerPid: Number.isFinite(Number(parsed.runnerPid)) ? Number(parsed.runnerPid) : process.pid,
      }) as AutoImportState;
    }
  } catch {
    // ignore missing or broken state files
  }

  return {
    status: 'idle',
    startedAt: null,
    heartbeatAt: null,
    finishedAt: null,
    result: null,
    error: null,
    runnerPid: process.pid,
  };
}

async function writeAutoImportState(state: AutoImportState) {
  const filePath = getAutoImportStatePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(sanitizeRankTextDeep(state), null, 2), 'utf8');
}

function jsonNoStore(payload: Record<string, unknown>, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(sanitizeRankTextDeep(payload), {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers || {}),
    },
  });
}

function parseStringList(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseBooleanFlag(input: unknown) {
  if (typeof input === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(input.trim().toLowerCase());
  }

  return Boolean(input);
}

function getRunningHeartbeatAgeMs(state: AutoImportState) {
  if (state.status !== 'running' || !state.startedAt) return null;
  const lastHeartbeatAt = new Date(state.heartbeatAt || state.startedAt).getTime();
  if (Number.isNaN(lastHeartbeatAt)) return null;
  return Date.now() - lastHeartbeatAt;
}

function isStaleRunningState(state: AutoImportState) {
  if (state.status !== 'running' || !state.startedAt) return false;
  const startedAt = new Date(state.startedAt).getTime();
  if (Number.isNaN(startedAt)) return false;
  if (Date.now() - startedAt > AUTO_IMPORT_RUNNING_TIMEOUT_MS) return true;

  const heartbeatAgeMs = getRunningHeartbeatAgeMs(state);
  return heartbeatAgeMs !== null && heartbeatAgeMs > AUTO_IMPORT_HEARTBEAT_TIMEOUT_MS;
}

async function normalizeAutoImportState() {
  const state = await readAutoImportState();
  if (!isStaleRunningState(state)) return state;

  const heartbeatAgeMs = getRunningHeartbeatAgeMs(state);
  const normalized: AutoImportState = {
    status: 'failed',
    startedAt: state.startedAt || new Date().toISOString(),
    heartbeatAt: state.heartbeatAt || state.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    result: state.result,
    error:
      heartbeatAgeMs !== null && heartbeatAgeMs > AUTO_IMPORT_HEARTBEAT_TIMEOUT_MS
        ? '自动导入任务心跳已中断，系统已自动重置状态。'
        : '自动导入任务整体执行超时，系统已自动重置状态。',
    runnerPid: process.pid,
  };
  await writeAutoImportState(normalized);
  runningPromise = null;
  return normalized;
}

async function performAutoImport(
  payload: AutoImportPayload,
  startedAtOverride?: string,
  runnerPid?: number | null,
) {
  const startedAt = startedAtOverride || new Date().toISOString();
  let stopped = false;
  let queuedHeartbeatWrite: Promise<void> = Promise.resolve();

  const queueRunningStateWrite = (mode: 'initial' | 'heartbeat') => {
    queuedHeartbeatWrite = queuedHeartbeatWrite
      .then(async () => {
        if (stopped) return;
        if (mode === 'initial') {
          await writeAutoImportState({
            status: 'running',
            startedAt,
            heartbeatAt: new Date().toISOString(),
            finishedAt: null,
            result: null,
            error: null,
            runnerPid: runnerPid ?? null,
          });
          return;
        }

        const current = await readAutoImportState();
        if (current.status !== 'running' || current.startedAt !== startedAt) return;

        await writeAutoImportState({
          status: 'running',
          startedAt: current.startedAt,
          heartbeatAt: new Date().toISOString(),
          finishedAt: null,
          result: current.result,
          error: current.error,
          runnerPid: runnerPid ?? null,
        });
      })
      .catch(() => {});

    return queuedHeartbeatWrite;
  };

  await queueRunningStateWrite('initial');
  const heartbeat = setInterval(() => {
    if (stopped) return;
    void queueRunningStateWrite('heartbeat');
  }, AUTO_IMPORT_HEARTBEAT_INTERVAL_MS);

  try {
    const effectiveScope = await getCurrentSeasonRankEffectiveScope({ regions: payload.regions });
    const autoImport = await autoImportLeagueRankAccounts({
      regions: payload.regions,
      overwriteExisting: payload.overwriteExisting,
      forceRescan: true,
      limit: payload.limit,
      playerNames: payload.playerNames,
      deepSearch: payload.deepSearch,
      effectiveScope,
    });
    const lowQualityCleanup = await archiveLowQualityAutoImportedAccounts();
    const duplicateCleanup = await archiveDuplicateRankAccounts();
    const riot =
      autoImport.touchedPlayerIds.length > 0
        ? await syncRankAccountsViaRiot({ playerIds: autoImport.touchedPlayerIds })
        : null;
    const failurePolicy = await applyRankSyncFailurePolicy(riot);
    const equivalentConsolidation = await consolidateEquivalentPlayerRankAccounts({
      regions: payload.regions,
      effectiveScope,
    });
    const placeholderEquivalentCleanup = await archivePlaceholderAccountsWithRealEquivalent({
      regions: payload.regions,
      effectiveScope,
    });
    const placeholderCoverage = await ensurePlaceholderRankCoverage({
      regions: payload.regions,
      effectiveScope,
    });
    const refreshPlayerIds = Array.from(
      new Set([
        ...(autoImport.touchedPlayerIds || []),
        ...(lowQualityCleanup?.touchedPlayerIds || []),
        ...(duplicateCleanup?.touchedPlayerIds || []),
        ...(riot?.touchedPlayerIds || []),
        ...(failurePolicy?.touchedPlayerIds || []),
        ...(equivalentConsolidation?.touchedPlayerIds || []),
        ...(placeholderEquivalentCleanup?.touchedPlayerIds || []),
        ...(placeholderCoverage.touchedPlayerIds || []),
      ]),
    );
    const refresh =
      refreshPlayerIds.length > 0
        ? await refreshRankProfilesByPlayerIds(refreshPlayerIds)
        : { success: true, total: 0, refreshed: 0, failed: 0, results: [] };

    const result = sanitizeRankTextDeep({
      success: true,
      autoImport,
      lowQualityCleanup,
      duplicateCleanup,
      riot,
      failurePolicy,
      equivalentConsolidation,
      placeholderEquivalentCleanup,
      placeholderCoverage,
      refresh,
      message: `自动导入完成：新增 ${autoImport.created} 个账号，更新 ${autoImport.updated} 个账号，自动补齐 ${placeholderCoverage.created} 个选手${payload.deepSearch ? '，并已输出专项深挖来源解释。' : '。'}`,
    });

    stopped = true;
    clearInterval(heartbeat);
    await queuedHeartbeatWrite;
    await writeAutoImportState({
      status: 'success',
      startedAt,
      heartbeatAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      result,
      error: null,
      runnerPid: process.pid,
    });
  } catch (error) {
    stopped = true;
    clearInterval(heartbeat);
    await queuedHeartbeatWrite;
    await writeAutoImportState({
      status: 'failed',
      startedAt,
      heartbeatAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      result: null,
      error: error instanceof Error ? error.message : '自动导入任务执行失败。',
      runnerPid: process.pid,
    });
  } finally {
    stopped = true;
    runningPromise = null;
  }
}

async function handleAutoImportTrigger(payload: AutoImportPayload, waitForCompletion: boolean) {
  const currentState = await normalizeAutoImportState();

  if (waitForCompletion) {
    if (!runningPromise) {
      runningPromise = performAutoImport(
        payload,
        currentState.status === 'running' ? currentState.startedAt : undefined,
        currentState.status === 'running' ? currentState.runnerPid : null,
      );
    }

    await runningPromise;
    const finalState = await normalizeAutoImportState();
    return jsonNoStore({
      success: finalState.status === 'success',
      running: false,
      message:
        finalState.status === 'success'
          ? '自动导入任务已完成。'
          : finalState.error || '自动导入任务执行失败。',
      ...finalState,
    });
  }

  if (currentState.status === 'running') {
    return jsonNoStore({
      success: true,
      running: true,
      message: '自动导入任务正在后台执行，请稍后刷新状态。',
      ...currentState,
    });
  }

  const startedAt = new Date().toISOString();
  await writeAutoImportState({
    status: 'running',
    startedAt,
    heartbeatAt: startedAt,
    finishedAt: null,
    result: null,
    error: null,
    runnerPid: process.pid,
  });

  runningPromise = performAutoImport(payload, startedAt, process.pid);
  runningPromise.catch(() => {});

  return jsonNoStore({
    success: true,
    running: true,
    message: '自动导入任务已在后台启动，系统会持续发现并同步主号与小号。',
    startedAt,
    limit: payload.limit ?? null,
    playerNames: payload.playerNames ?? [],
    deepSearch: payload.deepSearch === true,
  });
}

function parsePayloadFromRequest(request: NextRequest, body?: Record<string, unknown>) {
  const searchParams = request.nextUrl.searchParams;
  const regionInput =
    body?.regions !== undefined && body?.regions !== null
      ? body.regions
      : searchParams.getAll('regions').length > 1
        ? searchParams.getAll('regions')
        : searchParams.get('regions');
  const playerInput =
    body?.playerNames !== undefined && body?.playerNames !== null
      ? body.playerNames
      : body?.players !== undefined && body?.players !== null
        ? body.players
        : searchParams.getAll('playerNames').length > 1
          ? searchParams.getAll('playerNames')
          : searchParams.getAll('players').length > 1
            ? searchParams.getAll('players')
            : searchParams.get('playerNames') || searchParams.get('players');
  const overwriteExistingRaw =
    body?.overwriteExisting !== undefined ? body.overwriteExisting : searchParams.get('overwriteExisting');
  const limitRaw = body?.limit !== undefined ? body.limit : searchParams.get('limit');
  const deepSearchRaw = body?.deepSearch !== undefined ? body.deepSearch : searchParams.get('deepSearch');
  const waitRaw = searchParams.get('wait');
  const triggerRaw = searchParams.get('trigger') || searchParams.get('run') || searchParams.get('start');

  const regions = parseStringList(regionInput)
    .map((item) => item.toUpperCase())
    .filter(Boolean);
  const playerNames = parseStringList(playerInput);
  const limit = limitRaw !== undefined && limitRaw !== null ? Number(limitRaw) : undefined;

  return {
    payload: {
      regions: regions.length > 0 ? regions : ['LPL', 'LCK'],
      overwriteExisting: parseBooleanFlag(overwriteExistingRaw),
      limit: Number.isFinite(limit) ? limit : undefined,
      playerNames,
      deepSearch: parseBooleanFlag(deepSearchRaw) || playerNames.length === 1,
    },
    waitForCompletion: parseBooleanFlag(waitRaw),
    shouldTrigger:
      waitRaw !== null ||
      triggerRaw !== null ||
      playerNames.length > 0 ||
      regions.length > 0 ||
      overwriteExistingRaw !== undefined ||
      limitRaw !== undefined ||
      deepSearchRaw !== undefined,
  };
}

export async function GET(request: NextRequest) {
  const { payload, waitForCompletion, shouldTrigger } = parsePayloadFromRequest(request);

  if (shouldTrigger) {
    return handleAutoImportTrigger(payload, waitForCompletion);
  }

  const state = await normalizeAutoImportState();
  return jsonNoStore({
    success: true,
    running: state.status === 'running',
    ...state,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { payload, waitForCompletion } = parsePayloadFromRequest(request, body);
  return handleAutoImportTrigger(payload, waitForCompletion);
}
