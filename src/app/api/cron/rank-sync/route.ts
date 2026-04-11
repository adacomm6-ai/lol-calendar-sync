import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

import { recordRankSyncHistory, runRankSyncSkeleton } from '@/lib/player-rank-admin';

export const dynamic = 'force-dynamic';

const RANK_SYNC_RUN_LOCK_TTL_MS = 2 * 60 * 60 * 1000;

function getRankSyncWriteGuardPath() {
  return path.join(process.cwd(), 'data', 'rank-sync-write-guard.json');
}

function getRankSyncRunLockPath() {
  return path.join(process.cwd(), 'data', 'rank-sync-run-lock.json');
}

type RankSyncGuardState = {
  source: string;
  reason: string;
  expiresAt: string;
};

async function readActiveRankSyncWriteGuard() {
  try {
    const raw = await fs.readFile(getRankSyncWriteGuardPath(), 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const expiresAt = new Date(String(parsed?.expiresAt || ''));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return {
      source: String(parsed?.source || 'unknown'),
      reason: String(parsed?.reason || ''),
      expiresAt: expiresAt.toISOString(),
    };
  } catch {
    return null;
  }
}

async function readActiveRankSyncRunLock(): Promise<RankSyncGuardState | null> {
  try {
    const raw = await fs.readFile(getRankSyncRunLockPath(), 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const expiresAt = new Date(String(parsed?.expiresAt || ''));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return {
      source: String(parsed?.source || 'rank-sync'),
      reason: String(parsed?.reason || 'already running'),
      expiresAt: expiresAt.toISOString(),
    };
  } catch {
    return null;
  }
}

async function acquireRankSyncRunLock(): Promise<
  | { acquired: true; token: string }
  | { acquired: false; guard: RankSyncGuardState }
> {
  const filePath = getRankSyncRunLockPath();
  const activeLock = await readActiveRankSyncRunLock();
  if (activeLock) {
    return { acquired: false, guard: activeLock };
  }

  try {
    await fs.unlink(filePath);
  } catch {
    // Missing or already removed lock files are fine.
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const token = `rank-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = {
    token,
    source: 'rank-sync',
    reason: 'cron running',
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RANK_SYNC_RUN_LOCK_TTL_MS).toISOString(),
  };

  try {
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), { encoding: 'utf8', flag: 'wx' });
    return { acquired: true, token };
  } catch {
    const guard = await readActiveRankSyncRunLock();
    return {
      acquired: false,
      guard: guard || {
        source: 'rank-sync',
        reason: 'lock exists',
        expiresAt: new Date(Date.now() + RANK_SYNC_RUN_LOCK_TTL_MS).toISOString(),
      },
    };
  }
}

async function releaseRankSyncRunLock(token: string) {
  const filePath = getRankSyncRunLockPath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (parsed?.token === token) {
      await fs.unlink(filePath);
    }
  } catch {
    // Best effort cleanup.
  }
}

function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice('Bearer '.length).trim();
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get('authorization');
  const bearerToken = extractBearerToken(authHeader);
  const plainToken = req.headers.get('x-cron-secret') || '';

  return bearerToken === secret || plainToken === secret;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const writeGuard = await readActiveRankSyncWriteGuard();

  if (writeGuard) {
    return NextResponse.json(
      {
        success: true,
        skipped: true,
        note: `Rank sync paused by ${writeGuard.source}: ${writeGuard.reason || 'write guard active'}`,
        pausedUntil: writeGuard.expiresAt,
        runAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
      { status: 200 },
    );
  }

  const runLock = await acquireRankSyncRunLock();
  if (!runLock.acquired) {
    return NextResponse.json(
      {
        success: true,
        skipped: true,
        note: `Rank sync skipped: ${runLock.guard.reason}`,
        lockedBy: runLock.guard.source,
        lockedUntil: runLock.guard.expiresAt,
        runAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
      { status: 200 },
    );
  }

  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const result = await runRankSyncSkeleton({
      trigger: 'cron',
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json(
      {
        ...result,
        runAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
      { status: result.success ? 200 : 500 },
    );
  } catch (error) {
    await recordRankSyncHistory({
      id: `cron-${Date.now()}`,
      trigger: 'cron',
      status: 'FAILED',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      refreshedPlayers: 0,
      failedPlayers: 0,
      riotAttempted: 0,
      riotSynced: 0,
      autoImportedCreated: 0,
      autoImportedUpdated: 0,
      note: '定时 Rank 同步失败。',
      error: error instanceof Error ? error.message : 'Unknown rank cron sync error',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown rank cron sync error',
        runAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  } finally {
    await releaseRankSyncRunLock(runLock.token);
  }
}
