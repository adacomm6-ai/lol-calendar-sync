import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const EXPECTED_TOKEN = String(process.env.BP_SYNC_TOKEN || '').trim();

function getProvidedToken(request: Request): string {
  const authHeader = String(request.headers.get('authorization') || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return String(bearerMatch[1] || '').trim();
  return String(request.headers.get('x-bp-sync-token') || '').trim();
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function formatBestOf(format: string | null | undefined): number {
  const normalized = normalizeText(format).toUpperCase();
  if (normalized === 'BO1') return 1;
  if (normalized === 'BO5') return 5;
  return 3;
}

export async function GET(request: Request) {
  try {
    const providedToken = getProvidedToken(request);
    if (EXPECTED_TOKEN && providedToken !== EXPECTED_TOKEN) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);
    const hoursBack = Math.min(Math.max(Number(searchParams.get('hoursBack') || 6), 0), 72);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const rollingFromTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const fromTime = startOfToday < rollingFromTime ? startOfToday : rollingFromTime;
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const matches = await prisma.match.findMany({
      where: {
        startTime: { gte: fromTime },
        OR: [
          {
            startTime: {
              gte: startOfToday,
              lt: startOfTomorrow,
            },
            status: { not: 'CANCELLED' },
          },
          {
            startTime: { gte: startOfTomorrow },
            status: { notIn: ['FINISHED', 'COMPLETED', 'CANCELLED'] },
          },
        ],
      },
      include: {
        teamA: { select: { id: true, name: true, shortName: true, region: true } },
        teamB: { select: { id: true, name: true, shortName: true, region: true } },
        games: { select: { id: true, gameNumber: true }, orderBy: { gameNumber: 'asc' } },
      },
      orderBy: [{ startTime: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    return NextResponse.json({
      ok: true,
      count: matches.length,
      matches: matches.map((match) => ({
        matchId: match.id,
        linkedLolMatchId: match.id,
        externalMatchId: match.externalMatchId || null,
        bpSourceMatchId: match.bpSourceMatchId || null,
        importStatus: match.bpSourceMatchId ? 'bound' : 'unbound',
        startTime: match.startTime ? match.startTime.toISOString() : null,
        league: normalizeText(match.tournament),
        stageName: normalizeText(match.stage),
        stagePhase: normalizeText(match.stage),
        bestOf: formatBestOf(match.format),
        format: normalizeText(match.format) || 'BO3',
        status: normalizeText(match.status) || 'SCHEDULED',
        teamA: match.teamA ? {
          id: match.teamA.id,
          name: match.teamA.name,
          shortName: match.teamA.shortName || null,
          region: match.teamA.region || null,
        } : null,
        teamB: match.teamB ? {
          id: match.teamB.id,
          name: match.teamB.name,
          shortName: match.teamB.shortName || null,
          region: match.teamB.region || null,
        } : null,
        games: match.games.map((game) => ({ id: game.id, gameNumber: game.gameNumber })),
      })),
    });
  } catch (error: any) {
    console.error('[bp-sync] future-schedule failed', error);
    return NextResponse.json({ ok: false, message: error?.message || 'future schedule failed' }, { status: 500 });
  }
}


