import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncPreMatchOddsPayload } from '@/lib/odds-sync';

const EXPECTED_TOKEN = String(process.env.ODDS_SYNC_TOKEN || '').trim();

function getProvidedToken(request: Request): string {
  const authHeader = String(request.headers.get('authorization') || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return String(bearerMatch[1] || '').trim();
  }
  return String(request.headers.get('x-odds-sync-token') || '').trim();
}

export async function POST(request: Request) {
  try {
    const providedToken = getProvidedToken(request);
    if (EXPECTED_TOKEN && providedToken !== EXPECTED_TOKEN) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const result = await syncPreMatchOddsPayload(payload || {});

    revalidatePath('/');
    revalidatePath(`/match/${result.matchId}`);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[odds-sync] upsert failed', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'odds sync failed',
      },
      { status: Number(error?.status) || 500 },
    );
  }
}
