import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  buildSnapshotCreateInput,
  buildTeamShortName,
  inferSplitName,
  normalizeLeagueBucket,
  normalizeNameKey,
  normalizeRole,
  normalizeText,
  PlayerSnapshotUpsertPayload,
} from '@/lib/player-snapshot';
import { normalizeTeamFamilyKey, normalizeTeamIdentityKey, normalizeTeamLookupKey } from '@/lib/team-alias';

const EXPECTED_TOKEN = String(process.env.PLAYER_SYNC_TOKEN || process.env.BP_SYNC_TOKEN || '').trim();
const CORE_LEAGUE_BUCKET = new Set(['LPL', 'LCK', 'WORLDS']);

function isSampleTournamentLike(value: unknown) {
  return normalizeText(value).includes('本地样本');
}

function isPlaceholderPlayerName(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return true;
  if (/^[A-Za-z]\d{1,2}$/.test(raw)) return true;
  if (raw.includes('候选')) return true;
  return false;
}

function isSuspiciousUnknownSnapshotLike(splitName: unknown, sourceKey: unknown) {
  const split = normalizeText(splitName).toLowerCase();
  const source = normalizeText(sourceKey).toLowerCase();
  return split.includes('unknown') || source.includes('unknown');
}

function getProvidedToken(request: Request): string {
  const authHeader = String(request.headers.get('authorization') || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return String(bearerMatch[1] || '').trim();
  }
  return String(request.headers.get('x-player-sync-token') || request.headers.get('x-bp-sync-token') || '').trim();
}

function normalizeTournamentAliasKey(value: unknown) {
  const stopwords = new Set([
    'season',
    '����',
    'unknown',
    'δ֪',
    'tournament',
    '����',
    'vs',
    'versus',
    'regular',
    'playoffs',
    'group',
    'stage',
    'swiss',
    'playin',
  ]);
  const normalizeToken = (token: string) => {
    if (token === 'playoff' || token === 'playoffs' || token === '������') return 'playoffs';
    if (token === 'group' || token === 'groups') return 'group';
    if (token === 'stage' || token === '�׶�') return 'stage';
    if (token === 'playin' || token === 'play-in') return 'playin';
    return token;
  };

  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(normalizeToken)
    .filter((token) => !stopwords.has(token))
    .sort()
    .join(' ');
}

function safeParseJsonArray(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeText(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function safeParseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function mergeUniqueStrings(left: string[], right: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];
  [...left, ...right].forEach((item) => {
    const text = normalizeText(item);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(text);
  });
  return merged;
}

function fillString(existing: unknown, incoming: unknown) {
  const current = normalizeText(existing);
  if (current) return current;
  const next = normalizeText(incoming);
  return next || null;
}

function fillCounter(existing: unknown, incoming: unknown) {
  const current = Number(existing);
  const next = Number(incoming);
  const currentSafe = Number.isFinite(current) ? Math.max(0, Math.round(current)) : 0;
  const nextSafe = Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0;
  return Math.max(currentSafe, nextSafe);
}

function fillNullableNumber(existing: unknown, incoming: unknown) {
  const current = Number(existing);
  if (Number.isFinite(current)) return current;
  const next = Number(incoming);
  return Number.isFinite(next) ? next : null;
}

function mergeDateFrom(existing: Date | null | undefined, incoming: Date | null | undefined) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;
  return incoming.getTime() < existing.getTime() ? incoming : existing;
}

function mergeDateTo(existing: Date | null | undefined, incoming: Date | null | undefined) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;
  return incoming.getTime() > existing.getTime() ? incoming : existing;
}

function buildSnapshotGroupKey(data: {
  league: string;
  seasonYear: string;
  tournamentName: string;
  role: string;
  normalizedPlayerName: string;
  teamName: string;
}) {
  const league = normalizeText(data.league).toUpperCase();
  const seasonYear = normalizeText(data.seasonYear);
  const bucket = normalizeLeagueBucket(league, data.tournamentName);
  const tournamentGroupKey = CORE_LEAGUE_BUCKET.has(bucket)
    ? normalizeTournamentAliasKey(data.tournamentName)
    : seasonYear;

  return [
    league,
    seasonYear,
    normalizeText(data.role).toUpperCase(),
    normalizeNameKey(data.normalizedPlayerName || ''),
    normalizeNameKey(data.teamName || ''),
    tournamentGroupKey,
  ].join('::');
}

async function findExistingTeam(teamName: string, teamShortName: string | null, regionBucket: string) {
  const exact = await prisma.team.findUnique({ where: { name: teamName } });
  if (exact) return exact;

  if (!teamShortName) return null;

  const shortNameMatches = await prisma.team.findMany({
    where: {
      region: regionBucket,
      OR: [{ shortName: teamShortName }, { name: teamShortName }],
    },
    take: 2,
  });

  if (shortNameMatches.length === 1) {
    return shortNameMatches[0];
  }
  return null;
}

async function ensureTeam(payload: PlayerSnapshotUpsertPayload) {
  const teamName = normalizeText(payload.teamName);
  if (!teamName) {
    throw new Error('teamName is required');
  }

  const nextShortName = buildTeamShortName(teamName, payload.teamShortName);
  const nextRegion = normalizeLeagueBucket(payload.league, payload.tournamentName);
  const existing = await findExistingTeam(teamName, nextShortName, nextRegion);

  if (existing) {
    const shouldUpdate =
      (existing.shortName || null) !== (nextShortName || null) ||
      existing.region !== nextRegion ||
      (normalizeText(existing.name) === normalizeText(nextShortName) && normalizeText(existing.name) !== teamName);
    if (!shouldUpdate) return existing;
    return prisma.team.update({
      where: { id: existing.id },
      data: {
        name: normalizeText(existing.name) === normalizeText(nextShortName) ? teamName : existing.name,
        shortName: nextShortName || existing.shortName,
        region: nextRegion,
      },
    });
  }

  return prisma.team.create({
    data: {
      name: teamName,
      shortName: nextShortName,
      region: nextRegion,
    },
  });
}

type PlayerRegistryEntry = {
  id: string;
  name: string;
  normalizedName: string;
  role: string;
  canonicalRole: string;
  split: string;
  photo: string | null;
  teamId: string;
  teamName: string;
  teamShortName: string | null;
  canonicalTeamKey: string;
  snapshotRefs: number;
  refScore: number;
  updatedAt: Date;
};

type PlayerRegistry = {
  exactByComposite: Map<string, PlayerRegistryEntry>;
  byNormalizedRole: Map<string, PlayerRegistryEntry[]>;
  byId: Map<string, PlayerRegistryEntry>;
};

function buildPlayerCompositeKey(name: string, teamId: string) {
  return `${normalizeText(name)}::${teamId}`;
}

function buildPlayerNormalizedRoleKey(name: string, role: string) {
  return `${normalizeNameKey(name)}::${normalizeRole(role)}`;
}

function buildPlayerCanonicalTeamKey(teamName?: string | null, teamShortName?: string | null) {
  return normalizeTeamIdentityKey(teamName, teamShortName);
}

function scorePlayerCandidate(entry: PlayerRegistryEntry) {
  return entry.refScore * 100 + (entry.photo ? 10 : 0) + new Date(entry.updatedAt || 0).getTime() / 1000000000;
}

function chooseBestRegistryEntry(entries: PlayerRegistryEntry[]) {
  return entries
    .slice()
    .sort((left, right) => {
      const scoreDiff = scorePlayerCandidate(right) - scorePlayerCandidate(left);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left.id).localeCompare(String(right.id));
    })[0];
}

function addRegistryEntry(registry: PlayerRegistry, entry: PlayerRegistryEntry) {
  registry.byId.set(entry.id, entry);
  registry.exactByComposite.set(buildPlayerCompositeKey(entry.name, entry.teamId), entry);
  const roleKey = buildPlayerNormalizedRoleKey(entry.name, entry.role);
  const list = registry.byNormalizedRole.get(roleKey) || [];
  list.push(entry);
  registry.byNormalizedRole.set(roleKey, list);
}

function removeRegistryEntry(registry: PlayerRegistry, entry: PlayerRegistryEntry) {
  registry.byId.delete(entry.id);
  registry.exactByComposite.delete(buildPlayerCompositeKey(entry.name, entry.teamId));
  const roleKey = buildPlayerNormalizedRoleKey(entry.name, entry.role);
  const list = (registry.byNormalizedRole.get(roleKey) || []).filter((item) => item.id !== entry.id);
  if (list.length === 0) registry.byNormalizedRole.delete(roleKey);
  else registry.byNormalizedRole.set(roleKey, list);
}

async function loadPlayerRegistry(): Promise<PlayerRegistry> {
  const rows = await prisma.player.findMany({
    include: {
      team: true,
      rankProfileCache: { select: { id: true } },
      _count: {
        select: {
          statSnapshots: true,
          rankAccounts: true,
          rankSnapshots: true,
          rankRecentSummaries: true,
        },
      },
    },
  });

  const registry: PlayerRegistry = {
    exactByComposite: new Map(),
    byNormalizedRole: new Map(),
    byId: new Map(),
  };

  rows.forEach((player) => {
    const entry: PlayerRegistryEntry = {
      id: player.id,
      name: normalizeText(player.name),
      normalizedName: normalizeNameKey(player.name),
      role: normalizeRole(player.role),
      canonicalRole: normalizeRole(player.role),
      split: normalizeText(player.split),
      photo: normalizeText(player.photo) || null,
      teamId: player.teamId,
      teamName: normalizeText(player.team?.name),
      teamShortName: normalizeText(player.team?.shortName) || null,
      canonicalTeamKey: buildPlayerCanonicalTeamKey(player.team?.name, player.team?.shortName),
      snapshotRefs: player._count.statSnapshots,
      refScore:
        player._count.statSnapshots +
        player._count.rankAccounts +
        player._count.rankSnapshots +
        player._count.rankRecentSummaries +
        (player.rankProfileCache ? 1 : 0),
      updatedAt: player.updatedAt,
    };
    addRegistryEntry(registry, entry);
  });

  return registry;
}

function mergeSplitValue(current: string | null | undefined, nextValues: string[]) {
  const bucket = new Set(
    String(current || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  nextValues.filter(Boolean).forEach((item) => bucket.add(item));
  return Array.from(bucket).join(', ');
}

async function ensurePlayer(payload: PlayerSnapshotUpsertPayload, team: { id: string; name: string; shortName?: string | null }, registry: PlayerRegistry) {
  const playerName = normalizeText(payload.playerName);
  if (!playerName) {
    throw new Error('playerName is required');
  }

  const role = normalizeRole(payload.role);
  const split = mergeSplitValue('', [inferSplitName(payload), normalizeText(payload.tournamentName)]);
  const compositeKey = buildPlayerCompositeKey(playerName, team.id);
  const existing = registry.exactByComposite.get(compositeKey) || null;

  if (existing) {
    const nextSplit = mergeSplitValue(existing.split, [inferSplitName(payload), normalizeText(payload.tournamentName)]);
    const shouldUpdate = existing.role !== role || existing.split !== nextSplit;
    if (!shouldUpdate) {
      return prisma.player.findUniqueOrThrow({ where: { id: existing.id } });
    }

    const updated = await prisma.player.update({
      where: { id: existing.id },
      data: {
        role,
        split: nextSplit,
      },
    });
    removeRegistryEntry(registry, existing);
    addRegistryEntry(registry, {
      ...existing,
      role,
      canonicalRole: role,
      split: nextSplit,
      updatedAt: updated.updatedAt,
      snapshotRefs: existing.snapshotRefs,
    });
    return updated;
  }

  const normalizedRoleKey = buildPlayerNormalizedRoleKey(playerName, role);
  const candidates = registry.byNormalizedRole.get(normalizedRoleKey) || [];
  const targetCanonicalTeamKey = buildPlayerCanonicalTeamKey(team.name, team.shortName || null);
  const targetFamilyTeamKey = normalizeTeamFamilyKey(team.name, team.shortName || null);
  const sameTeamCandidates = candidates.filter((candidate) => candidate.canonicalTeamKey === targetCanonicalTeamKey);

  if (sameTeamCandidates.length > 0) {
    const keeper = chooseBestRegistryEntry(sameTeamCandidates);
    const nextSplit = mergeSplitValue(keeper.split, [inferSplitName(payload), normalizeText(payload.tournamentName)]);
    const updated = await prisma.player.update({
      where: { id: keeper.id },
      data: {
        teamId: team.id,
        role,
        split: nextSplit,
      },
    });
    removeRegistryEntry(registry, keeper);
    addRegistryEntry(registry, {
      ...keeper,
      role,
      canonicalRole: role,
      split: nextSplit,
      teamId: team.id,
      teamName: team.name,
      teamShortName: team.shortName || null,
      canonicalTeamKey: targetCanonicalTeamKey,
      updatedAt: updated.updatedAt,
      snapshotRefs: keeper.snapshotRefs,
    });
    return updated;
  }

  const sameFamilyCandidates = candidates.filter((candidate) =>
    normalizeTeamFamilyKey(candidate.teamName, candidate.teamShortName || null) === targetFamilyTeamKey,
  );

  if (sameFamilyCandidates.length > 0) {
    const keeper = chooseBestRegistryEntry(sameFamilyCandidates);
    const nextSplit = mergeSplitValue(keeper.split, [inferSplitName(payload), normalizeText(payload.tournamentName)]);
    const updated = await prisma.player.update({
      where: { id: keeper.id },
      data: {
        teamId: team.id,
        role,
        split: nextSplit,
      },
    });
    removeRegistryEntry(registry, keeper);
    addRegistryEntry(registry, {
      ...keeper,
      role,
      canonicalRole: role,
      split: nextSplit,
      teamId: team.id,
      teamName: team.name,
      teamShortName: team.shortName || null,
      canonicalTeamKey: targetCanonicalTeamKey,
      updatedAt: updated.updatedAt,
      snapshotRefs: keeper.snapshotRefs,
    });
    return updated;
  }

  // Avoid cross-org auto-merges unless the existing row is only a weak shadow record.
  const shadowCandidates = candidates.filter((candidate) =>
    candidate.snapshotRefs === 0 && candidate.refScore <= 3,
  );
  if (candidates.length === 1 && shadowCandidates.length === 1) {
    const keeper = shadowCandidates[0];
    const nextSplit = mergeSplitValue(keeper.split, [inferSplitName(payload), normalizeText(payload.tournamentName)]);
    const updated = await prisma.player.update({
      where: { id: keeper.id },
      data: {
        teamId: team.id,
        role,
        split: nextSplit,
      },
    });
    removeRegistryEntry(registry, keeper);
    addRegistryEntry(registry, {
      ...keeper,
      role,
      canonicalRole: role,
      split: nextSplit,
      teamId: team.id,
      teamName: team.name,
      teamShortName: team.shortName || null,
      canonicalTeamKey: targetCanonicalTeamKey,
      updatedAt: updated.updatedAt,
      snapshotRefs: keeper.snapshotRefs,
    });
    return updated;
  }

  const created = await prisma.player.create({
    data: {
      name: playerName,
      role,
      split,
      teamId: team.id,
    },
  });
  addRegistryEntry(registry, {
    id: created.id,
    name: playerName,
    normalizedName: normalizeNameKey(playerName),
    role,
    canonicalRole: role,
    split,
    photo: created.photo || null,
    teamId: team.id,
    teamName: team.name,
    teamShortName: team.shortName || null,
    canonicalTeamKey: targetCanonicalTeamKey,
    snapshotRefs: 0,
    refScore: 0,
    updatedAt: created.updatedAt,
  });
  return created;
}

async function findLogicalSnapshotCandidate(data: {
  league: string;
  seasonYear: string;
  role: string;
  normalizedPlayerName: string;
  teamName: string;
  tournamentName: string;
}) {
  const candidates = await prisma.playerStatSnapshot.findMany({
    where: {
      league: data.league,
      seasonYear: data.seasonYear,
      role: data.role,
      normalizedPlayerName: data.normalizedPlayerName,
      teamName: data.teamName,
    },
    orderBy: [{ syncedAt: 'desc' }, { updatedAt: 'desc' }, { games: 'desc' }],
    take: 20,
  });

  if (candidates.length === 0) return null;

  const targetGroupKey = buildSnapshotGroupKey(data);
  const grouped = candidates.filter((item) => {
    const candidateKey = buildSnapshotGroupKey({
      league: item.league,
      seasonYear: item.seasonYear,
      tournamentName: item.tournamentName,
      role: item.role,
      normalizedPlayerName: item.normalizedPlayerName,
      teamName: item.teamName,
    });
    return candidateKey === targetGroupKey;
  });

  if (grouped.length === 0) return null;
  return grouped[0];
}

async function findCrossTeamSnapshotConflict(data: {
  league: string;
  seasonYear: string;
  role: string;
  normalizedPlayerName: string;
  tournamentName: string;
  teamName: string;
  teamShortName?: string | null;
}) {
  const targetTeamKey = normalizeTeamIdentityKey(data.teamName, data.teamShortName || null);
  const candidates = await prisma.playerStatSnapshot.findMany({
    where: {
      league: data.league,
      seasonYear: data.seasonYear,
      role: data.role,
      normalizedPlayerName: data.normalizedPlayerName,
      tournamentName: data.tournamentName,
    },
    orderBy: [{ syncedAt: 'desc' }, { updatedAt: 'desc' }, { games: 'desc' }],
    take: 20,
    select: {
      id: true,
      playerId: true,
      teamName: true,
      teamShortName: true,
      splitName: true,
      sourceKey: true,
    },
  });

  return (
    candidates.find((item) => {
      const candidateTeamKey = normalizeTeamIdentityKey(item.teamName, item.teamShortName || null);
      return Boolean(candidateTeamKey) && candidateTeamKey !== targetTeamKey;
    }) || null
  );
}

function buildFillOnlySnapshotUpdate(existing: any, incoming: any, incomingSourceKey: string) {
  const currentLabels = safeParseJsonArray(existing.labelsJson);
  const nextLabels = safeParseJsonArray(incoming.labelsJson);
  const currentInsights = safeParseJsonArray(existing.insightsJson);
  const nextInsights = safeParseJsonArray(incoming.insightsJson);
  const currentExtra = safeParseJsonObject(existing.extraJson);
  const nextExtra = safeParseJsonObject(incoming.extraJson);

  const sourceKeyAliases = mergeUniqueStrings(
    safeParseJsonArray((currentExtra as any).sourceKeyAliases),
    [existing.sourceKey, incomingSourceKey].filter(Boolean),
  );
  const sourceAliases = mergeUniqueStrings(
    safeParseJsonArray((currentExtra as any).sourceAliases),
    [existing.source, incoming.source].filter(Boolean),
  );
  const tournamentAliases = mergeUniqueStrings(
    safeParseJsonArray((currentExtra as any).tournamentAliases),
    [existing.tournamentName, incoming.tournamentName].filter(Boolean),
  );

  const mergedExtra = {
    ...nextExtra,
    ...currentExtra,
    sourceKeyAliases,
    sourceAliases,
    tournamentAliases,
  };

  return {
    playerId: existing.playerId || incoming.playerId || null,
    teamId: existing.teamId || incoming.teamId || null,
    league: fillString(existing.league, incoming.league) || incoming.league,
    seasonYear: fillString(existing.seasonYear, incoming.seasonYear) || incoming.seasonYear,
    splitName: fillString(existing.splitName, incoming.splitName),
    tournamentName: fillString(existing.tournamentName, incoming.tournamentName) || incoming.tournamentName,
    role: fillString(existing.role, incoming.role) || incoming.role,
    playerName: fillString(existing.playerName, incoming.playerName) || incoming.playerName,
    normalizedPlayerName: fillString(existing.normalizedPlayerName, incoming.normalizedPlayerName) || incoming.normalizedPlayerName,
    teamName: fillString(existing.teamName, incoming.teamName) || incoming.teamName,
    teamShortName: fillString(existing.teamShortName, incoming.teamShortName),
    source: fillString(existing.source, incoming.source) || String(existing.source || incoming.source || 'unknown'),
    sourceUrl: fillString(existing.sourceUrl, incoming.sourceUrl),
    dateFrom: mergeDateFrom(existing.dateFrom, incoming.dateFrom),
    dateTo: mergeDateTo(existing.dateTo, incoming.dateTo),
    games: fillCounter(existing.games, incoming.games),
    wins: fillCounter(existing.wins, incoming.wins),
    losses: fillCounter(existing.losses, incoming.losses),
    winRatePct: fillNullableNumber(existing.winRatePct, incoming.winRatePct),
    kda: fillNullableNumber(existing.kda, incoming.kda),
    avgKills: fillNullableNumber(existing.avgKills, incoming.avgKills),
    avgDeaths: fillNullableNumber(existing.avgDeaths, incoming.avgDeaths),
    avgAssists: fillNullableNumber(existing.avgAssists, incoming.avgAssists),
    csPerMin: fillNullableNumber(existing.csPerMin, incoming.csPerMin),
    goldPerMin: fillNullableNumber(existing.goldPerMin, incoming.goldPerMin),
    killParticipationPct: fillNullableNumber(existing.killParticipationPct, incoming.killParticipationPct),
    damageSharePct: fillNullableNumber(existing.damageSharePct, incoming.damageSharePct),
    goldSharePct: fillNullableNumber(existing.goldSharePct, incoming.goldSharePct),
    visionSharePct: fillNullableNumber(existing.visionSharePct, incoming.visionSharePct),
    damagePerMin: fillNullableNumber(existing.damagePerMin, incoming.damagePerMin),
    visionScorePerMin: fillNullableNumber(existing.visionScorePerMin, incoming.visionScorePerMin),
    wardsPerMin: fillNullableNumber(existing.wardsPerMin, incoming.wardsPerMin),
    wardsClearedPerMin: fillNullableNumber(existing.wardsClearedPerMin, incoming.wardsClearedPerMin),
    visionWardsPerMin: fillNullableNumber(existing.visionWardsPerMin, incoming.visionWardsPerMin),
    goldDiffAt15: fillNullableNumber(existing.goldDiffAt15, incoming.goldDiffAt15),
    csDiffAt15: fillNullableNumber(existing.csDiffAt15, incoming.csDiffAt15),
    xpDiffAt15: fillNullableNumber(existing.xpDiffAt15, incoming.xpDiffAt15),
    firstBloodParticipationPct: fillNullableNumber(existing.firstBloodParticipationPct, incoming.firstBloodParticipationPct),
    firstBloodVictimPct: fillNullableNumber(existing.firstBloodVictimPct, incoming.firstBloodVictimPct),
    currentRecentGames: fillCounter(existing.currentRecentGames, incoming.currentRecentGames),
    currentTotalGames: fillCounter(existing.currentTotalGames, incoming.currentTotalGames),
    confidence: fillNullableNumber(existing.confidence, incoming.confidence),
    stateScore: fillNullableNumber(existing.stateScore, incoming.stateScore),
    masteryScore: fillNullableNumber(existing.masteryScore, incoming.masteryScore),
    laneScore: fillNullableNumber(existing.laneScore, incoming.laneScore),
    overallScore: fillNullableNumber(existing.overallScore, incoming.overallScore),
    relativeScore: fillNullableNumber(existing.relativeScore, incoming.relativeScore),
    relativeZScore: fillNullableNumber(existing.relativeZScore, incoming.relativeZScore),
    evaluationLabel: fillString(existing.evaluationLabel, incoming.evaluationLabel),
    trendScore: fillNullableNumber(existing.trendScore, incoming.trendScore),
    labelsJson: JSON.stringify(mergeUniqueStrings(currentLabels, nextLabels)),
    insightsJson: JSON.stringify(mergeUniqueStrings(currentInsights, nextInsights)),
    recentWinRatePct: fillNullableNumber(existing.recentWinRatePct, incoming.recentWinRatePct),
    careerWinRatePct: fillNullableNumber(existing.careerWinRatePct, incoming.careerWinRatePct),
    recentKda: fillNullableNumber(existing.recentKda, incoming.recentKda),
    careerKda: fillNullableNumber(existing.careerKda, incoming.careerKda),
    localGoldPerMin: fillNullableNumber(existing.localGoldPerMin, incoming.localGoldPerMin),
    localCsPerMin: fillNullableNumber(existing.localCsPerMin, incoming.localCsPerMin),
    localDamagePerMin: fillNullableNumber(existing.localDamagePerMin, incoming.localDamagePerMin),
    localDamageTakenPerMin: fillNullableNumber(existing.localDamageTakenPerMin, incoming.localDamageTakenPerMin),
    localKillParticipationPct: fillNullableNumber(existing.localKillParticipationPct, incoming.localKillParticipationPct),
    localVisionPerMin: fillNullableNumber(existing.localVisionPerMin, incoming.localVisionPerMin),
    localScore: fillNullableNumber(existing.localScore, incoming.localScore),
    localExternalWinRatePct: fillNullableNumber(existing.localExternalWinRatePct, incoming.localExternalWinRatePct),
    mappedTeamName: fillString(existing.mappedTeamName, incoming.mappedTeamName),
    mappedRole: fillString(existing.mappedRole, incoming.mappedRole),
    sampleGames: fillCounter(existing.sampleGames, incoming.sampleGames),
    mappingConfidence: fillNullableNumber(existing.mappingConfidence, incoming.mappingConfidence),
    extraJson: JSON.stringify(mergedExtra),
    syncedAt: new Date(),
  };
}

export async function POST(request: Request) {
  try {
    const providedToken = getProvidedToken(request);
    if (EXPECTED_TOKEN && providedToken !== EXPECTED_TOKEN) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const snapshots = Array.isArray(payload?.snapshots) ? (payload.snapshots as PlayerSnapshotUpsertPayload[]) : [];
    if (snapshots.length === 0) {
      return NextResponse.json({ ok: false, message: 'snapshots is required' }, { status: 400 });
    }

    const playerPaths = new Set<string>();
    const playerRegistry = await loadPlayerRegistry();
    let teamsCreated = 0;
    let playersCreated = 0;
    let snapshotsUpserted = 0;
    let snapshotsCreated = 0;
    let snapshotsMerged = 0;
    let snapshotsSourceMatched = 0;
    let snapshotsSkipped = 0;
    let snapshotsConflictSkipped = 0;

    for (const snapshot of snapshots) {
      if (isSampleTournamentLike(snapshot.tournamentName) || isPlaceholderPlayerName(snapshot.playerName)) {
        snapshotsSkipped += 1;
        continue;
      }

      const teamBefore = await findExistingTeam(
        normalizeText(snapshot.teamName),
        buildTeamShortName(snapshot.teamName, snapshot.teamShortName),
        normalizeLeagueBucket(snapshot.league, snapshot.tournamentName),
      );
      const team = await ensureTeam(snapshot);
      if (!teamBefore) teamsCreated += 1;

      const playerBefore = await prisma.player.findUnique({
        where: {
          name_teamId: {
            name: normalizeText(snapshot.playerName),
            teamId: team.id,
          },
        },
      });
      const player = await ensurePlayer(
        snapshot,
        { id: team.id, name: normalizeText(team.name), shortName: normalizeText(team.shortName) || null },
        playerRegistry,
      );
      if (!playerBefore) playersCreated += 1;

      const data = buildSnapshotCreateInput(snapshot, player.id, team.id);
      const existingBySourceKey = await prisma.playerStatSnapshot.findUnique({
        where: { sourceKey: data.sourceKey },
      });
      const logicalCandidate = existingBySourceKey
        ? null
        : await findLogicalSnapshotCandidate({
            league: data.league,
            seasonYear: data.seasonYear,
            role: data.role,
            normalizedPlayerName: data.normalizedPlayerName,
            teamName: data.teamName,
            tournamentName: data.tournamentName,
          });

      const target = existingBySourceKey || logicalCandidate;
      const crossTeamConflict = target
        ? null
        : await findCrossTeamSnapshotConflict({
            league: data.league,
            seasonYear: data.seasonYear,
            role: data.role,
            normalizedPlayerName: data.normalizedPlayerName,
            tournamentName: data.tournamentName,
            teamName: data.teamName,
            teamShortName: data.teamShortName,
          });

      if (
        crossTeamConflict &&
        isSuspiciousUnknownSnapshotLike(data.splitName, data.sourceKey)
      ) {
        snapshotsConflictSkipped += 1;
        continue;
      }

      if (target) {
        await prisma.playerStatSnapshot.update({
          where: { id: target.id },
          data: buildFillOnlySnapshotUpdate(target, data, data.sourceKey),
        });
        if (existingBySourceKey) snapshotsSourceMatched += 1;
        else snapshotsMerged += 1;
      } else {
        await prisma.playerStatSnapshot.create({ data });
        snapshotsCreated += 1;
      }

      snapshotsUpserted += 1;
      playerPaths.add(`/players/${player.id}`);
    }

    revalidatePath('/analysis');
    revalidatePath('/players');
    for (const path of playerPaths) {
      revalidatePath(path);
    }
    revalidateTag('player', 'max');
    revalidateTag('stats', 'max');

    return NextResponse.json({
      ok: true,
      snapshotsUpserted,
      snapshotsCreated,
      snapshotsMerged,
      snapshotsSourceMatched,
      snapshotsSkipped,
      snapshotsConflictSkipped,
      teamsCreated,
      playersCreated,
    });
  } catch (error: any) {
    console.error('[player-sync] upsert failed', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'player sync failed',
      },
      { status: Number(error?.status) || 500 },
    );
  }
}
