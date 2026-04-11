import { NextRequest, NextResponse } from 'next/server';

import { updateRankAccount } from '@/lib/player-rank-admin';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const updated = await updateRankAccount(id, {
      platform: body.platform !== undefined ? String(body.platform) : undefined,
      regionGroup: body.regionGroup !== undefined ? String(body.regionGroup) : undefined,
      gameName: body.gameName !== undefined ? String(body.gameName) : undefined,
      tagLine: body.tagLine !== undefined ? (body.tagLine === null ? null : String(body.tagLine)) : undefined,
      puuid: body.puuid !== undefined ? String(body.puuid) : undefined,
      summonerId: body.summonerId !== undefined ? (body.summonerId === null ? null : String(body.summonerId)) : undefined,
      isPrimary: body.isPrimary !== undefined ? Boolean(body.isPrimary) : undefined,
      isActiveCandidate: body.isActiveCandidate !== undefined ? Boolean(body.isActiveCandidate) : undefined,
      status: body.status !== undefined ? String(body.status) : undefined,
      source: body.source !== undefined ? String(body.source) : undefined,
      confidence: body.confidence !== undefined ? Number(body.confidence) : undefined,
      notes: body.notes !== undefined ? (body.notes === null ? null : String(body.notes)) : undefined,
      lastVerifiedAt: body.lastVerifiedAt !== undefined ? body.lastVerifiedAt : undefined,
    });

    return NextResponse.json({ success: true, account: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown update rank account error' },
      { status: 500 },
    );
  }
}
