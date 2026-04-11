import { promises as fs } from 'fs';
import path from 'path';

import { NextRequest, NextResponse } from 'next/server';

import {
  autoImportLeagueRankAccounts,
  ensurePlaceholderRankCoverage,
  refreshRankProfilesByPlayerIds,
} from '@/lib/player-rank-admin';
import { syncRankAccountsViaRiot } from '@/lib/riot-rank-provider';

export const runtime = 'nodejs';

type AutoImportPayload = {
  regions: string[];
  overwriteExisting: boolean;
  limit?: number;
  playerNames?: string[];
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

function getAutoImportStatePath() {
  return path.join(process.cwd(), 'data', 'rank-auto-import-last.json');
}

async function readAutoImportState(): Promise<AutoImportState> {
  try {
    const raw = await fs.readFile(getAutoImportStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') {
      return {
        startedAt: null,
        heartbeatAt: null,
        finishedAt: null,
        result: null,
        error: null,
        runnerPid: null,
        ...parsed,
      } as AutoImportState;
    }
  } catch {}

  return {
    status: 'idle',
    startedAt: null,
    heartbeatAt: null,
    finishedAt: null,
    result: null,
    error: null,
    runnerPid: null,
  };
}

async function writeAutoImportState(state: AutoImportState) {
  const filePath = getAutoImportStatePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
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
    runnerPid: null,
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
  const writeRunningState = async () => {
    await writeAutoImportState({
      status: 'running',
      startedAt,
      heartbeatAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
      runnerPid: runnerPid ?? null,
    });
  };

  await writeRunningState();
  const heartbeat = setInterval(() => {
    if (stopped) return;
    writeRunningState().catch(() => {});
  }, AUTO_IMPORT_HEARTBEAT_INTERVAL_MS);

  try {
    const autoImport = await autoImportLeagueRankAccounts({
      regions: payload.regions,
      overwriteExisting: payload.overwriteExisting,
      forceRescan: true,
      limit: payload.limit,
      playerNames: payload.playerNames,
    });

    const riot =
      autoImport.touchedPlayerIds.length > 0
        ? await syncRankAccountsViaRiot({ playerIds: autoImport.touchedPlayerIds })
        : null;
    const placeholderCoverage = await ensurePlaceholderRankCoverage({ regions: payload.regions });
    const refreshPlayerIds = Array.from(
      new Set([
        ...(autoImport.touchedPlayerIds || []),
        ...(riot?.touchedPlayerIds || []),
        ...(placeholderCoverage.touchedPlayerIds || []),
      ]),
    );
    const refresh =
      refreshPlayerIds.length > 0
        ? await refreshRankProfilesByPlayerIds(refreshPlayerIds)
        : { success: true, total: 0, refreshed: 0, failed: 0, results: [] };

    const result = {
      success: true,
      autoImport,
      riot,
      placeholderCoverage,
      refresh,
      message: `自动导入完成：新增 ${autoImport.created} 个账号，更新 ${autoImport.updated} 个账号，自动补齐 ${placeholderCoverage.created} 个选手。`,
    };

    await writeAutoImportState({
      status: 'success',
      startedAt,
      heartbeatAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      result,
      error: null,
      runnerPid: null,
    });
  } catch (error) {
    await writeAutoImportState({
      status: 'failed',
      startedAt,
      heartbeatAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      result: null,
      error: error instanceof Error ? error.message : '自动导入任务执行失败。',
      runnerPid: null,
    });
  } finally {
    stopped = true;
    clearInterval(heartbeat);
    runningPromise = null;
  }
}

export async function GET() {
  const state = await normalizeAutoImportState();
  return NextResponse.json({
    success: true,
    running: state.status === 'running',
    ...state,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const regions = Array.isArray(body?.regions)
    ? body.regions.map((item: unknown) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : ['LPL', 'LCK'];
  const overwriteExisting = Boolean(body?.overwriteExisting);
  const limit = body?.limit !== undefined ? Number(body.limit) : undefined;
  const playerNames = Array.isArray(body?.playerNames)
    ? body.playerNames.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : typeof body?.playerNames === 'string'
      ? body.playerNames
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean)
      : [];
  const waitForCompletion = request.nextUrl.searchParams.get('wait') === '1';

  const payload: AutoImportPayload = {
    regions,
    overwriteExisting,
    limit: Number.isFinite(limit) ? limit : undefined,
    playerNames,
  };

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
    return NextResponse.json({
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
    return NextResponse.json({
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
    runnerPid: null,
  });

  // Run in-process so heartbeat/result state stays in the same Node runtime.
  runningPromise = performAutoImport(payload, startedAt, null);
  runningPromise.catch(() => {});

  return NextResponse.json({
    success: true,
    running: true,
    message: '自动导入任务已在后台启动，系统会持续发现并同步主号与小号。',
    startedAt,
    limit: Number.isFinite(limit) ? limit : null,
    playerNames,
  });
}
