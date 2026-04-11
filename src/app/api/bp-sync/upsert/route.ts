import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { clearBpGamePayload, syncBpGamePayload } from '@/lib/bp-sync';

const EXPECTED_TOKEN = String(process.env.BP_SYNC_TOKEN || '').trim();

function getProvidedToken(request: Request): string {
  const authHeader = String(request.headers.get('authorization') || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return String(bearerMatch[1] || '').trim();
  }
  return String(request.headers.get('x-bp-sync-token') || '').trim();
}

export async function POST(request: Request) {
  try {
    const providedToken = getProvidedToken(request);
    if (EXPECTED_TOKEN && providedToken !== EXPECTED_TOKEN) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const action = String(payload?.action || '').trim().toLowerCase();
    const result = action === 'clear_game'
      ? await clearBpGamePayload(payload || {})
      : await syncBpGamePayload(payload || {});

    revalidatePath('/');
    revalidatePath(`/match/${result.matchId}`);

    return NextResponse.json({
      ok: true,
      matchId: result.matchId,
      gameId: result.gameId,
      matchAction: result.matchAction,
      gameAction: result.gameAction,
      matchReason: result.matchReason,
    });
  } catch (error: any) {
    console.error('[bp-sync] upsert failed', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'bp sync failed',
      },
      { status: Number(error?.status) || 500 },
    );
  }
}
