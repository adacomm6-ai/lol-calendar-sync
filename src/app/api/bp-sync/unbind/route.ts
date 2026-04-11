import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const matchId = normalizeText(body?.matchId);
    const sourceMatchId = normalizeText(body?.sourceMatchId);

    if (!matchId && !sourceMatchId) {
      return NextResponse.json({ ok: false, message: 'matchId or sourceMatchId is required' }, { status: 400 });
    }

    const where = matchId
      ? { id: matchId }
      : { bpSourceMatchId: sourceMatchId };

    const boundMatches = await prisma.match.findMany({
      where,
      select: {
        id: true,
        bpSourceMatchId: true,
        teamA: { select: { name: true, shortName: true } },
        teamB: { select: { name: true, shortName: true } },
      },
    });

    if (!boundMatches.length) {
      return NextResponse.json({ ok: false, message: '未找到可解除的 BP 绑定' }, { status: 404 });
    }

    await prisma.match.updateMany({
      where: { id: { in: boundMatches.map((match) => match.id) } },
      data: {
        bpSourceMatchId: null,
      },
    });

    return NextResponse.json({
      ok: true,
      releasedCount: boundMatches.length,
      sourceMatchId: sourceMatchId || boundMatches[0]?.bpSourceMatchId || null,
      releasedMatches: boundMatches.map((match) => ({
        id: match.id,
        label: `${match.teamA?.shortName || match.teamA?.name || 'Unknown'} vs ${match.teamB?.shortName || match.teamB?.name || 'Unknown'}`,
      })),
    });
  } catch (error: any) {
    console.error('[bp-sync] unbind failed', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'unbind failed',
      },
      { status: 500 },
    );
  }
}


