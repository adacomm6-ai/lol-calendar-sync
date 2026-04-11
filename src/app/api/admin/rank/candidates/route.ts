import { NextResponse } from 'next/server';

import { getRankAdminCandidates } from '@/lib/player-rank-admin';

export async function GET() {
  try {
    const candidates = await getRankAdminCandidates();
    return NextResponse.json({ candidates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown rank candidates error' },
      { status: 500 },
    );
  }
}
