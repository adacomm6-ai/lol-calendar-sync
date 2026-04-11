import { prisma } from '@/lib/db';

const KNOWN_REGIONS = [
  'LPL',
  'LCK',
  'LEC',
  'LCS',
  'PCS',
  'VCS',
  'CBLOL',
  'LJL',
  'LLA',
] as const;

const TIME_RANGE_WHERE = (startTime: Date) => ({
  effectiveFrom: { lte: startTime },
  OR: [{ effectiveTo: null }, { effectiveTo: { gte: startTime } }],
});

export function normalizeRuleRegion(region: string | null | undefined): string {
  const normalized = (region || '').trim().toUpperCase();
  if (!normalized) return 'GLOBAL';
  return normalized;
}

/**
 * Normalize game version text to a stable dot format.
 *
 * Examples:
 * - "PATCH 26.2" -> "26.02"
 * - "16.2" + effectiveFrom in 2026 -> "26.02" (legacy major fixed)
 * - "15.24" -> "15.24"
 */
export function normalizeGameVersionValue(
  rawVersion: string | null | undefined,
  effectiveFrom?: Date | null,
): string {
  const raw = (rawVersion || '').trim();
  if (!raw) return '';

  const cleaned = raw.replace(/^PATCH\s*/i, '').trim();
  const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return raw;

  let major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return raw;

  // Fix legacy "16.x" style values for 2026+ rules to "26.0x"/"27.0x"/...
  if (effectiveFrom && !Number.isNaN(effectiveFrom.getTime())) {
    const yy = effectiveFrom.getUTCFullYear() % 100;
    if (yy >= 26 && major + 10 === yy) {
      major = yy;
    }
  }

  const minorText = major >= 20 ? String(minor).padStart(2, '0') : String(minor);
  return `${major}.${minorText}`;
}

export function inferMatchRegion(params: {
  tournament?: string | null;
  regionHint?: string | null;
  teamARegion?: string | null;
  teamBRegion?: string | null;
}): string {
  const regionHint = normalizeRuleRegion(params.regionHint);
  if (regionHint !== 'GLOBAL') return regionHint;

  const combined = [
    params.tournament,
    params.teamARegion,
    params.teamBRegion,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  const hit = KNOWN_REGIONS.find((region) => combined.includes(region));
  return hit || 'GLOBAL';
}

export async function resolveGameVersionForMatch(params: {
  startTime?: Date | string | null;
  tournament?: string | null;
  regionHint?: string | null;
  teamARegion?: string | null;
  teamBRegion?: string | null;
}): Promise<string | null> {
  if (!params.startTime) return null;

  const startTime = new Date(params.startTime);
  if (Number.isNaN(startTime.getTime())) return null;

  const region = inferMatchRegion(params);

  if (region !== 'GLOBAL') {
    const regional = await prisma.gameVersionRule.findFirst({
      where: {
        region,
        ...TIME_RANGE_WHERE(startTime),
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (regional?.version) return normalizeGameVersionValue(regional.version, regional.effectiveFrom);
  }

  const globalRule = await prisma.gameVersionRule.findFirst({
    where: {
      region: 'GLOBAL',
      ...TIME_RANGE_WHERE(startTime),
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!globalRule?.version) return null;
  return normalizeGameVersionValue(globalRule.version, globalRule.effectiveFrom);
}

export function hasRuleOverlap(params: {
  incomingFrom: Date;
  incomingTo?: Date | null;
  existingFrom: Date;
  existingTo?: Date | null;
}): boolean {
  const incomingEnd = params.incomingTo || new Date('9999-12-31T23:59:59.999Z');
  const existingEnd = params.existingTo || new Date('9999-12-31T23:59:59.999Z');
  return params.incomingFrom <= existingEnd && params.existingFrom <= incomingEnd;
}
