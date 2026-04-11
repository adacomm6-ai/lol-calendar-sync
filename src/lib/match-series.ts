import { normalizeTeamLookupKey } from '@/lib/team-alias';

type MatchSeriesTeam = {
  id?: string | null;
  name?: string | null;
  shortName?: string | null;
};

type MatchSeriesGame = {
  winnerId?: string | null;
  blueSideTeamId?: string | null;
  redSideTeamId?: string | null;
};

type MatchSeriesSnapshot = {
  format?: string | null;
  teamAId?: string | null;
  teamBId?: string | null;
  teamA?: MatchSeriesTeam | null;
  teamB?: MatchSeriesTeam | null;
  games?: MatchSeriesGame[] | null;
};

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function getIdentityKeys(team: MatchSeriesTeam | null | undefined): string[] {
  return Array.from(
    new Set(
      [team?.name, team?.shortName]
        .map((value) => normalizeTeamLookupKey(value))
        .filter(Boolean),
    ),
  );
}

function identitiesOverlap(
  left: MatchSeriesTeam | null | undefined,
  right: MatchSeriesTeam | null | undefined,
): boolean {
  const leftKeys = getIdentityKeys(left);
  const rightKeys = new Set(getIdentityKeys(right));
  if (leftKeys.length === 0 || rightKeys.size === 0) return false;
  return leftKeys.some((key) => rightKeys.has(key));
}

function getWinsNeeded(formatValue: string | null | undefined): number {
  const match = normalizeText(formatValue).match(/(\d+)/);
  const parsed = match ? Number.parseInt(match[1], 10) : 1;
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return 1;
  }
  return Math.floor(parsed / 2) + 1;
}

function resolveMatchTeamIdFromTeamId(
  candidateTeamId: string | null | undefined,
  match: MatchSeriesSnapshot,
  teamsById: Map<string, MatchSeriesTeam>,
): string | null {
  const candidateId = normalizeText(candidateTeamId);
  if (!candidateId) return null;

  const teamAId = normalizeText(match.teamAId);
  const teamBId = normalizeText(match.teamBId);

  if (teamAId && candidateId === teamAId) return teamAId;
  if (teamBId && candidateId === teamBId) return teamBId;

  const candidateTeam = teamsById.get(candidateId) || null;
  const matchTeamA = match.teamA || (teamAId ? teamsById.get(teamAId) || null : null);
  const matchTeamB = match.teamB || (teamBId ? teamsById.get(teamBId) || null : null);

  const matchesA = identitiesOverlap(candidateTeam, matchTeamA);
  const matchesB = identitiesOverlap(candidateTeam, matchTeamB);

  if (matchesA && !matchesB) return teamAId || null;
  if (matchesB && !matchesA) return teamBId || null;
  return null;
}

function resolveGameWinnerMatchTeamId(
  game: MatchSeriesGame,
  match: MatchSeriesSnapshot,
  teamsById: Map<string, MatchSeriesTeam>,
): string | null {
  const rawWinnerId = normalizeText(game.winnerId);
  if (!rawWinnerId) return null;

  const winnerUpper = rawWinnerId.toUpperCase();
  if (winnerUpper === 'BLUE') {
    return resolveMatchTeamIdFromTeamId(game.blueSideTeamId, match, teamsById);
  }
  if (winnerUpper === 'RED') {
    return resolveMatchTeamIdFromTeamId(game.redSideTeamId, match, teamsById);
  }

  const directMatch = resolveMatchTeamIdFromTeamId(rawWinnerId, match, teamsById);
  if (directMatch) return directMatch;

  if (rawWinnerId === normalizeText(game.blueSideTeamId)) {
    return resolveMatchTeamIdFromTeamId(game.blueSideTeamId, match, teamsById);
  }
  if (rawWinnerId === normalizeText(game.redSideTeamId)) {
    return resolveMatchTeamIdFromTeamId(game.redSideTeamId, match, teamsById);
  }

  return null;
}

export function calculateMatchSeriesScore(
  match: MatchSeriesSnapshot,
  extraTeams: MatchSeriesTeam[] = [],
) {
  const teamsById = new Map<string, MatchSeriesTeam>();

  const registerTeam = (team: MatchSeriesTeam | null | undefined) => {
    const id = normalizeText(team?.id);
    if (!id || !team) return;
    teamsById.set(id, team);
  };

  registerTeam(match.teamA || null);
  registerTeam(match.teamB || null);
  for (const team of extraTeams) {
    registerTeam(team);
  }

  let scoreA = 0;
  let scoreB = 0;

  for (const game of match.games || []) {
    const resolvedWinnerTeamId = resolveGameWinnerMatchTeamId(game, match, teamsById);
    if (!resolvedWinnerTeamId) continue;
    if (resolvedWinnerTeamId === normalizeText(match.teamAId)) {
      scoreA += 1;
      continue;
    }
    if (resolvedWinnerTeamId === normalizeText(match.teamBId)) {
      scoreB += 1;
    }
  }

  const winsNeeded = getWinsNeeded(match.format);
  const winnerId =
    scoreA >= winsNeeded
      ? normalizeText(match.teamAId) || null
      : scoreB >= winsNeeded
        ? normalizeText(match.teamBId) || null
        : null;

  return {
    scoreA,
    scoreB,
    winsNeeded,
    winnerId,
  };
}
