import { prisma } from '@/lib/db';
import { normalizeLeagueBucket } from '@/lib/player-snapshot';

const DEFAULT_RANK_EFFECTIVE_REGIONS = ['LPL', 'LCK'] as const;

type EffectiveSnapshotKind = 'league' | 'cup' | 'playoff' | 'world' | 'other';

export type CurrentSeasonRankEffectiveScope = {
  regions: string[];
  latestSeasonByRegion: Record<string, string>;
  scopedSnapshotPlayerIds: string[];
  scopedIdentityKeys: string[];
  preferredPlayerIds: string[];
  preferredKindsByRegion: Record<string, EffectiveSnapshotKind[]>;
};

function normalizeRankEffectiveText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\u4e00-\u9fa5]+/g, '');
}

function normalizeRankEffectiveRole(role: string) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'SUPPORT' || value === 'SUP') return 'SUP';
  if (value === 'JUNGLE' || value === 'JUN') return 'JUN';
  if (value === 'BOTTOM' || value === 'BOT' || value === 'ADC') return 'ADC';
  if (value === 'MIDDLE' || value === 'MID') return 'MID';
  if (value === 'TOP') return 'TOP';
  return value || 'OTHER';
}

export function buildRankEffectiveIdentityKey(input: {
  region?: string | null;
  playerName: string;
  teamName?: string | null;
  teamShortName?: string | null;
  role?: string | null;
}) {
  const regionKey = normalizeRankEffectiveText(String(input.region || ''));
  return [
    regionKey,
    normalizeRankEffectiveText(String(input.playerName || '')),
    normalizeRankEffectiveRole(String(input.role || '')),
    regionKey ? '' : normalizeRankEffectiveText(String(input.teamShortName || input.teamName || '')),
  ].join('::');
}

function classifyEffectiveSnapshotKind(tournamentName: string | null | undefined): EffectiveSnapshotKind {
  const text = String(tournamentName || '').trim().toLowerCase();
  if (!text) return 'other';
  if (/world|worlds|msi|international/.test(text)) return 'world';
  if (/playoff|playoffs/.test(text)) return 'playoff';
  if (/\bcup\b|first stand|legend cup/.test(text)) return 'cup';
  if (/regular|split|spring|summer|winter|season/.test(text)) return 'league';
  return 'other';
}

function normalizeTargetRegions(regions?: string[]) {
  return (regions?.length ? regions : [...DEFAULT_RANK_EFFECTIVE_REGIONS]).map((item) =>
    String(item || '').trim().toUpperCase(),
  );
}

function isLikelyPlaceholderRankAccount(account: {
  gameName?: string | null;
  tagLine?: string | null;
  puuid?: string | null;
  notes?: string | null;
}) {
  const gameName = String(account.gameName || '').trim();
  const tagLine = String(account.tagLine || '').trim();
  const puuid = String(account.puuid || '').trim();
  const notes = String(account.notes || '').trim().toLowerCase();

  return (
    !tagLine ||
    gameName === '待确认映射' ||
    (puuid.startsWith('manual:') && /(placeholder|pending|manual)/i.test(`${gameName}\n${notes}`))
  );
}

function scorePreferredRankPlayerRecord(
  player: {
    id: string;
    updatedAt: Date;
    rankProfileCache: { id: string } | null;
    rankAccounts: Array<{
      isPrimary: boolean;
      isActiveCandidate: boolean;
      confidence: number | null;
      gameName: string;
      tagLine: string | null;
      puuid: string | null;
      notes: string | null;
    }>;
    _count: {
      rankRecentSummaries: number;
      rankSnapshots: number;
    };
  },
  currentSeasonSnapshotPlayerIds: Set<string>,
) {
  const accounts = player.rankAccounts || [];
  const realAccounts = accounts.filter((account) => !isLikelyPlaceholderRankAccount(account));
  const hasCurrentSeasonSnapshot = currentSeasonSnapshotPlayerIds.has(player.id);

  return [
    hasCurrentSeasonSnapshot ? 300000 : 0,
    realAccounts.length > 0 ? 180000 : accounts.length > 0 ? 30000 : 0,
    realAccounts.filter((account) => account.isPrimary).length * 15000,
    realAccounts.filter((account) => account.isActiveCandidate).length * 10000,
    realAccounts.reduce((sum, account) => sum + Number(account.confidence || 0) * 1000, 0),
    accounts.length * 250,
    player.rankProfileCache ? 6000 : 0,
    Number(player._count?.rankRecentSummaries || 0) * 500,
    Number(player._count?.rankSnapshots || 0) * 200,
    new Date(player.updatedAt).getTime() / 1000000000,
  ].reduce((sum, value) => sum + value, 0);
}

export async function getCurrentSeasonRankEffectiveScope(options?: {
  regions?: string[];
}): Promise<CurrentSeasonRankEffectiveScope> {
  const targetRegions = normalizeTargetRegions(options?.regions);
  const latestSeasonByRegion = new Map<string, string>();
  const snapshots = await prisma.playerStatSnapshot.findMany({
    select: {
      playerId: true,
      league: true,
      tournamentName: true,
      seasonYear: true,
    },
  });

  for (const snapshot of snapshots) {
    const snapshotRegion = normalizeLeagueBucket(snapshot.league, snapshot.tournamentName);
    if (!targetRegions.includes(snapshotRegion)) continue;
    const seasonYear = String(snapshot.seasonYear || '').trim();
    if (!seasonYear) continue;
    const previous = latestSeasonByRegion.get(snapshotRegion);
    if (!previous || seasonYear > previous) latestSeasonByRegion.set(snapshotRegion, seasonYear);
  }

  const latestSeasonSnapshots = snapshots
    .map((snapshot) => ({
      ...snapshot,
      region: normalizeLeagueBucket(snapshot.league, snapshot.tournamentName),
      seasonYear: String(snapshot.seasonYear || '').trim(),
      kind: classifyEffectiveSnapshotKind(snapshot.tournamentName),
    }))
    .filter((snapshot) => {
      if (!targetRegions.includes(snapshot.region)) return false;
      const latestSeason = latestSeasonByRegion.get(snapshot.region);
      return Boolean(latestSeason) && snapshot.seasonYear === latestSeason;
    });

  const preferredKindsByRegion = new Map<string, EffectiveSnapshotKind[]>();
  const scopedSnapshotPlayerIds = new Set<string>();

  for (const region of targetRegions) {
    const regionSnapshots = latestSeasonSnapshots.filter((snapshot) => snapshot.region === region);
    if (regionSnapshots.length === 0) continue;

    const hasLeagueLikeSnapshots = regionSnapshots.some((snapshot) => snapshot.kind === 'league' || snapshot.kind === 'other');
    const preferredKinds = hasLeagueLikeSnapshots
      ? (['league', 'other'] as EffectiveSnapshotKind[])
      : (['league', 'other', 'cup', 'playoff', 'world'] as EffectiveSnapshotKind[]);
    const preferredKindSet = new Set(preferredKinds);
    const preferredSnapshots = regionSnapshots.filter((snapshot) => preferredKindSet.has(snapshot.kind));
    const effectiveSnapshots = preferredSnapshots.length > 0 ? preferredSnapshots : regionSnapshots;

    preferredKindsByRegion.set(region, preferredKinds);
    for (const snapshot of effectiveSnapshots) {
      if (snapshot.playerId) scopedSnapshotPlayerIds.add(snapshot.playerId);
    }
  }

  const snapshotPlayers =
    scopedSnapshotPlayerIds.size > 0
      ? await prisma.player.findMany({
          where: {
            id: {
              in: Array.from(scopedSnapshotPlayerIds),
            },
          },
          select: {
            id: true,
            name: true,
            role: true,
            team: {
              select: {
                region: true,
              },
            },
          },
        })
      : [];

  const scopedIdentityKeys = Array.from(
    new Set(
      snapshotPlayers
        .filter((player) => targetRegions.includes(String(player.team?.region || '').trim().toUpperCase()))
        .map((player) =>
          buildRankEffectiveIdentityKey({
            region: player.team?.region,
            playerName: player.name,
            role: player.role,
          }),
        )
        .filter(Boolean),
    ),
  );
  const preferredPlayerIds =
    scopedIdentityKeys.length > 0
      ? Array.from(
          (
            await prisma.player.findMany({
              where: {
                team: {
                  region: {
                    in: targetRegions,
                  },
                },
              },
              select: {
                id: true,
                name: true,
                role: true,
                updatedAt: true,
                team: {
                  select: {
                    region: true,
                  },
                },
                rankProfileCache: {
                  select: {
                    id: true,
                  },
                },
                rankAccounts: {
                  where: {
                    status: {
                      not: 'ARCHIVED',
                    },
                  },
                  select: {
                    isPrimary: true,
                    isActiveCandidate: true,
                    confidence: true,
                    gameName: true,
                    tagLine: true,
                    puuid: true,
                    notes: true,
                  },
                },
                _count: {
                  select: {
                    rankRecentSummaries: true,
                    rankSnapshots: true,
                  },
                },
              },
            })
          )
            .filter((player) =>
              scopedIdentityKeys.includes(
                buildRankEffectiveIdentityKey({
                  region: player.team?.region,
                  playerName: player.name,
                  role: player.role,
                }),
              ),
            )
            .reduce((map, player) => {
              const identityKey = buildRankEffectiveIdentityKey({
                region: player.team?.region,
                playerName: player.name,
                role: player.role,
              });
              const existing = map.get(identityKey);
              if (
                !existing ||
                scorePreferredRankPlayerRecord(player, scopedSnapshotPlayerIds) >
                  scorePreferredRankPlayerRecord(existing, scopedSnapshotPlayerIds)
              ) {
                map.set(identityKey, player);
              }
              return map;
            }, new Map<string, any>())
            .values()
        ).map((player) => player.id)
      : [];

  return {
    regions: targetRegions,
    latestSeasonByRegion: Object.fromEntries(Array.from(latestSeasonByRegion.entries())),
    scopedSnapshotPlayerIds: Array.from(scopedSnapshotPlayerIds),
    scopedIdentityKeys,
    preferredPlayerIds,
    preferredKindsByRegion: Object.fromEntries(Array.from(preferredKindsByRegion.entries())),
  };
}

export function filterPlayersByCurrentSeasonRankEffectiveScope<
  T extends {
    id: string;
    name: string;
    role?: string | null;
    team?: { region?: string | null } | null;
  },
>(players: T[], scope?: CurrentSeasonRankEffectiveScope | null) {
  const preferredPlayerIds = new Set(scope?.preferredPlayerIds || []);
  if (preferredPlayerIds.size > 0) {
    return players.filter((player) => preferredPlayerIds.has(player.id));
  }

  const scopedIdentityKeys = new Set(scope?.scopedIdentityKeys || []);
  if (scopedIdentityKeys.size === 0) return players;

  return players.filter((player) =>
    scopedIdentityKeys.has(
      buildRankEffectiveIdentityKey({
        region: player.team?.region,
        playerName: player.name,
        role: player.role,
      }),
    ),
  );
}
