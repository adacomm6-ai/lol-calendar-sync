import { NextRequest, NextResponse } from 'next/server';

import { getPlayerRankViewData } from '@/lib/player-rank';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const data = await getPlayerRankViewData(id);

    if (!data) {
      return NextResponse.json({ error: 'Player rank profile not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown player rank error' },
      { status: 500 },
    );
  }
}
