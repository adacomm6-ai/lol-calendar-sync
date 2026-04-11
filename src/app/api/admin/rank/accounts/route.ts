import { NextRequest, NextResponse } from 'next/server';

import { createRankAccount, getRankAdminAccounts } from '@/lib/player-rank-admin';

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('search') || '';
    const data = await getRankAdminAccounts(search);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown rank accounts error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const created = await createRankAccount({
      playerId: String(body.playerId || ''),
      platform: String(body.platform || ''),
      regionGroup: body.regionGroup ? String(body.regionGroup) : undefined,
      gameName: String(body.gameName || ''),
      tagLine: body.tagLine ? String(body.tagLine) : undefined,
      puuid: body.puuid ? String(body.puuid) : undefined,
      summonerId: body.summonerId ? String(body.summonerId) : undefined,
      isPrimary: Boolean(body.isPrimary),
      isActiveCandidate: Boolean(body.isActiveCandidate),
      status: body.status ? String(body.status) : undefined,
      source: body.source ? String(body.source) : undefined,
      confidence: body.confidence !== undefined ? Number(body.confidence) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    });

    return NextResponse.json({ success: true, account: created });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown create rank account error' },
      { status: 500 },
    );
  }
}
