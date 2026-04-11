import { NextRequest, NextResponse } from 'next/server';

import { getRankModulePageData } from '@/lib/player-rank';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const data = await getRankModulePageData({
      view: 'rank',
      year: searchParams.get('year') || undefined,
      tournament: searchParams.get('tournament') || undefined,
      search: searchParams.get('search') || undefined,
      region: searchParams.get('region') || undefined,
      role: searchParams.get('role') || undefined,
      activity: searchParams.get('activity') || undefined,
      accountStatus: searchParams.get('accountStatus') || undefined,
      rankSort: searchParams.get('rankSort') || undefined,
      rankOrder: searchParams.get('rankOrder') || undefined,
    });

    return NextResponse.json({
      overview: data.overview,
      highlights: data.highlights,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown rank overview error' },
      { status: 500 },
    );
  }
}
