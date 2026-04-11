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

    if (!matchId) {
      return NextResponse.json({ ok: false, message: 'matchId is required' }, { status: 400 });
    }
    if (!sourceMatchId) {
      return NextResponse.json({ ok: false, message: 'sourceMatchId is required' }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        teamA: { select: { name: true, shortName: true } },
        teamB: { select: { name: true, shortName: true } },
      },
    });

    if (!match) {
      return NextResponse.json({ ok: false, message: 'match not found' }, { status: 404 });
    }

    const conflict = await prisma.match.findFirst({
      where: {
        bpSourceMatchId: sourceMatchId,
        NOT: { id: matchId },
      },
      select: {
        id: true,
        teamA: { select: { name: true, shortName: true } },
        teamB: { select: { name: true, shortName: true } },
      },
    });

    if (conflict) {
      const leftTeam = conflict.teamA?.shortName || conflict.teamA?.name || 'Unknown';
      const rightTeam = conflict.teamB?.shortName || conflict.teamB?.name || 'Unknown';
      return NextResponse.json(
        {
          ok: false,
          message: `该 BP 大场ID 已绑定到另一场比赛：${leftTeam} vs ${rightTeam}`,
          conflictMatchId: conflict.id,
        },
        { status: 409 },
      );
    }

    const updated = await prisma.match.update({
      where: { id: matchId },
      data: {
        bpSourceMatchId: sourceMatchId,
      },
      select: {
        id: true,
        bpSourceMatchId: true,
      },
    });

    return NextResponse.json({
      ok: true,
      matchId: updated.id,
      sourceMatchId: updated.bpSourceMatchId,
    });
  } catch (error: any) {
    console.error('[bp-sync] bind failed', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'bind failed',
      },
      { status: 500 },
    );
  }
}

