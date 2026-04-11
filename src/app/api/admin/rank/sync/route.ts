import { NextRequest, NextResponse } from 'next/server';

import { recordRankSyncHistory, runRankSyncSkeleton } from '@/lib/player-rank-admin';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body?.limit !== undefined ? Number(body.limit) : undefined;
    const result = await runRankSyncSkeleton({
      trigger: 'manual',
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    await recordRankSyncHistory({
      id: `manual-${Date.now()}`,
      trigger: 'manual',
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
      note: '手动执行 Rank 同步失败。',
      error: error instanceof Error ? error.message : 'Unknown rank sync error',
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown rank sync error' },
      { status: 500 },
    );
  }
}
