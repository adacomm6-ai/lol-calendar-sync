import { NextResponse } from 'next/server';

import { syncSinglePlayerRankProfile } from '@/lib/player-rank-admin';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await syncSinglePlayerRankProfile(id);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown player refresh error' },
      { status: 500 },
    );
  }
}
