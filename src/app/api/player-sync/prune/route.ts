import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { normalizeText } from '@/lib/player-snapshot';

const EXPECTED_TOKEN = String(process.env.PLAYER_SYNC_TOKEN || process.env.BP_SYNC_TOKEN || '').trim();

type PlayerSnapshotPruneEntry = {
  source?: string | null;
  sourceKeys?: string[] | null;
};

function getProvidedToken(request: Request): string {
  const authHeader = String(request.headers.get('authorization') || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return String(bearerMatch[1] || '').trim();
  }
  return String(request.headers.get('x-player-sync-token') || request.headers.get('x-bp-sync-token') || '').trim();
}

function normalizeSourceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    const key = normalizeText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

export async function POST(request: Request) {
  try {
    const providedToken = getProvidedToken(request);
    if (EXPECTED_TOKEN && providedToken !== EXPECTED_TOKEN) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const pruneEntries = Array.isArray(payload?.prune) ? (payload.prune as PlayerSnapshotPruneEntry[]) : [];
    if (pruneEntries.length === 0) {
      return NextResponse.json({ ok: false, message: 'prune is required' }, { status: 400 });
    }

    const deletedBySource: Array<{ source: string; deletedCount: number; keptCount: number }> = [];
    let totalDeleted = 0;

    for (const entry of pruneEntries) {
      const source = normalizeText(entry?.source);
      if (!source) continue;
      const sourceKeys = normalizeSourceKeys(entry?.sourceKeys);
      const where = sourceKeys.length
        ? {
            source,
            sourceKey: {
              notIn: sourceKeys,
            },
          }
        : { source };
      const result = await prisma.playerStatSnapshot.deleteMany({ where });
      deletedBySource.push({ source, deletedCount: result.count, keptCount: sourceKeys.length });
      totalDeleted += result.count;
    }

    revalidatePath('/analysis');
    revalidatePath('/players');
    revalidateTag('player', 'max');
    revalidateTag('stats', 'max');

    return NextResponse.json({
      ok: true,
      totalDeleted,
      deletedBySource,
    });
  } catch (error: any) {
    console.error('[player-sync] prune failed', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'player snapshot prune failed',
      },
      { status: Number(error?.status) || 500 },
    );
  }
}
