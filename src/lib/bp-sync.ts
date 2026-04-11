import { prisma } from '@/lib/db';
import { normalizeTeamLookupKey } from '@/lib/team-alias';
import { propagateMatchResult } from '@/lib/bracket-utils';
import { calculateMatchSeriesScore } from '@/lib/match-series';
import { upsertPlayersFromStats } from '@/lib/player-utils';

const SYNC_SOURCE = 'bp_manual';
const ROLE_ORDER = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

export interface BpSyncPickRow {
  role?: string | null;
  champion_id?: string | null;
  player_name?: string | null;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
}

export interface BpSyncPayload {
  action?: string | null;
  game_id?: string | null;
  source_match_id?: string | null;
  source_game_id?: string | null;
  game_number?: number | null;
  played_at?: string | null;
  league?: string | null;
  patch_version?: string | null;
  series_best_of?: number | null;
  series_format?: string | null;
  stage_name?: string | null;
  stage_phase?: string | null;
  stage_label?: string | null;
  blue_team_name?: string | null;
  red_team_name?: string | null;
  winner_side?: string | null;
  winner_team_name?: string | null;
  game_duration_minutes?: number | null;
  blue_team_kills?: number | null;
  red_team_kills?: number | null;
  total_kills?: number | null;
  blue_team_kills_at_10m?: number | null;
  red_team_kills_at_10m?: number | null;
  total_kills_at_10m?: number | null;
  blue_picks?: BpSyncPickRow[] | null;
  red_picks?: BpSyncPickRow[] | null;
}

export interface BpSyncResult {
  ok: true;
  matchId: string;
  gameId: string;
  matchAction: 'created' | 'updated';
  gameAction: 'created' | 'updated';
  matchReason: 'external_match_id' | 'same_day_match' | 'unfinished_match' | 'created';
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function logBpSyncRuntime(event: string, detail: Record<string, unknown>): void {
  try {
    console.log(`[bp-sync] ${event}`, JSON.stringify(detail));
  } catch {
    console.log(`[bp-sync] ${event}`, detail);
  }
}

function toNonNegativeInteger(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function parsePlayedAt(value: unknown): Date | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDurationSeconds(minutesValue: unknown): number | null {
  if (typeof minutesValue === 'number' && Number.isFinite(minutesValue) && minutesValue >= 0) {
    return Math.max(0, Math.round(minutesValue * 60));
  }
  return null;
}

function normalizeLeagueValue(value: unknown): string {
  return normalizeText(value).toUpperCase() || 'OTHER';
}

function buildRegionValue(value: unknown): string {
  const league = normalizeLeagueValue(value);
  if (league === 'LPL' || league === 'LCK' || league === 'LEC' || league === 'LCS' || league === 'MSI' || league === 'WORLDS') {
    return league;
  }
  return 'OTHER';
}

function buildFormatValue(payload: BpSyncPayload): string {
  const formatText = normalizeText(payload.series_format).toUpperCase().replace(/\s+/g, '');
  if (formatText) {
    return formatText;
  }
  const bestOf = toNonNegativeInteger(payload.series_best_of, 1) || 1;
  return `BO${bestOf}`;
}

function buildStageValue(payload: BpSyncPayload): string {
  const preferred = normalizeText(payload.stage_label);
  if (preferred) {
    return preferred;
  }
  const parts = [normalizeText(payload.stage_name), normalizeText(payload.stage_phase)].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' / ');
  }
  return 'Manual Sync';
}

function getWinsNeeded(formatValue: string | null | undefined): number {
  const match = normalizeText(formatValue).match(/(\d+)/);
  const parsed = match ? Number.parseInt(match[1], 10) : 1;
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return 1;
  }
  return Math.floor(parsed / 2) + 1;
}

function isSameCalendarDay(left: Date | string | null | undefined, right: Date | null): boolean {
  if (!left || !right) {
    return false;
  }
  const leftDate = left instanceof Date ? left : new Date(left);
  if (Number.isNaN(leftDate.getTime())) {
    return false;
  }
  return leftDate.getFullYear() === right.getFullYear()
    && leftDate.getMonth() === right.getMonth()
    && leftDate.getDate() === right.getDate();
}

function getRoleSortIndex(role: unknown): number {
  const normalizedRole = normalizeBpRole(role);
  const foundIndex = ROLE_ORDER.indexOf(normalizedRole);
  return foundIndex >= 0 ? foundIndex : ROLE_ORDER.length;
}

function normalizeBpRole(role: unknown): string {
  const normalized = normalizeText(role).toUpperCase();
  if (!normalized) return '';

  if (normalized === '1' || normalized === 'TOP' || normalized === 'TOPLANE' || normalized === '上路' || normalized === '上单') return 'TOP';
  if (normalized === '2' || normalized === 'JG' || normalized === 'JUN' || normalized === 'JUNGLE' || normalized === '打野') return 'JUNGLE';
  if (normalized === '3' || normalized === 'MID' || normalized === 'MIDDLE' || normalized === 'MIDLANE' || normalized === '中路' || normalized === '中单') return 'MID';
  if (normalized === '4' || normalized === 'ADC' || normalized === 'AD' || normalized === 'BOT' || normalized === 'BOTTOM' || normalized === '下路') return 'ADC';
  if (normalized === '5' || normalized === 'SUP' || normalized === 'SUPPORT' || normalized === '辅助') return 'SUPPORT';

  return normalized;
}

function sortPickRows(rows: BpSyncPickRow[] | null | undefined): BpSyncPickRow[] {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => getRoleSortIndex(left.role) - getRoleSortIndex(right.role));
}

function buildShortName(name: string): string | null {
  const text = normalizeText(name);
  if (!text) {
    return null;
  }
  return text.length <= 12 ? text.toUpperCase() : null;
}

function teamMatchesPayload(
  team: { id?: string | null; name?: string | null; shortName?: string | null },
  payloadName: string,
  payloadTeamId?: string | null,
): boolean {
  const teamId = normalizeText(team.id);
  if (teamId && payloadTeamId && teamId === normalizeText(payloadTeamId)) {
    return true;
  }

  const payloadKey = normalizeTeamLookupKey(payloadName);
  if (!payloadKey) {
    return false;
  }

  return [team.name, team.shortName]
    .map((value) => normalizeTeamLookupKey(value))
    .filter(Boolean)
    .includes(payloadKey);
}

function resolveMatchSideAssignment(
  match: {
    teamAId: string | null;
    teamBId: string | null;
    teamA?: { id?: string | null; name?: string | null; shortName?: string | null } | null;
    teamB?: { id?: string | null; name?: string | null; shortName?: string | null } | null;
  },
  blueTeamName: string,
  redTeamName: string,
  blueTeamId?: string | null,
  redTeamId?: string | null,
): {
  matchTeamAIsBlue: boolean;
  blueSideTeamId: string | null;
  redSideTeamId: string | null;
  reason: string;
} {
  const blueMatchesA = teamMatchesPayload({ id: match.teamAId, name: match.teamA?.name, shortName: match.teamA?.shortName }, blueTeamName, blueTeamId);
  const blueMatchesB = teamMatchesPayload({ id: match.teamBId, name: match.teamB?.name, shortName: match.teamB?.shortName }, blueTeamName, blueTeamId);
  const redMatchesA = teamMatchesPayload({ id: match.teamAId, name: match.teamA?.name, shortName: match.teamA?.shortName }, redTeamName, redTeamId);
  const redMatchesB = teamMatchesPayload({ id: match.teamBId, name: match.teamB?.name, shortName: match.teamB?.shortName }, redTeamName, redTeamId);

  let matchTeamAIsBlue = true;
  let reason = 'preserve-match-order';

  if (blueMatchesA && redMatchesB) {
    matchTeamAIsBlue = true;
    reason = 'payload-blue-matched-team-a';
  } else if (blueMatchesB && redMatchesA) {
    matchTeamAIsBlue = false;
    reason = 'payload-blue-matched-team-b';
  } else if (blueTeamId && redTeamId && match.teamAId === blueTeamId && match.teamBId === redTeamId) {
    matchTeamAIsBlue = true;
    reason = 'payload-team-ids-match-order';
  } else if (blueTeamId && redTeamId && match.teamAId === redTeamId && match.teamBId === blueTeamId) {
    matchTeamAIsBlue = false;
    reason = 'payload-team-ids-swapped-order';
  }

  return {
    matchTeamAIsBlue,
    blueSideTeamId: matchTeamAIsBlue ? match.teamAId : match.teamBId,
    redSideTeamId: matchTeamAIsBlue ? match.teamBId : match.teamAId,
    reason,
  };
}

function resolveWinnerTeamId(
  match: {
    teamAId: string | null;
    teamBId: string | null;
    teamA?: { id?: string | null; name?: string | null; shortName?: string | null } | null;
    teamB?: { id?: string | null; name?: string | null; shortName?: string | null } | null;
  },
  sideAssignment: {
    blueSideTeamId: string | null;
    redSideTeamId: string | null;
  },
  winnerSide: string,
  blueTeamName: string,
  redTeamName: string,
  blueTeamId?: string | null,
  redTeamId?: string | null,
  winnerTeamName?: string | null,
): { winnerId: string | null; reason: string } {
  const normalizedWinnerSide = normalizeText(winnerSide).toLowerCase();
  const explicitWinnerTeamName = normalizeText(winnerTeamName)
    || (normalizedWinnerSide === 'blue' ? blueTeamName : normalizedWinnerSide === 'red' ? redTeamName : '');
  const explicitWinnerTeamId = normalizedWinnerSide === 'blue'
    ? normalizeText(blueTeamId)
    : normalizedWinnerSide === 'red'
      ? normalizeText(redTeamId)
      : '';

  if (explicitWinnerTeamName || explicitWinnerTeamId) {
    const teamAWins = teamMatchesPayload(
      { id: match.teamAId, name: match.teamA?.name, shortName: match.teamA?.shortName },
      explicitWinnerTeamName,
      explicitWinnerTeamId || null,
    );
    const teamBWins = teamMatchesPayload(
      { id: match.teamBId, name: match.teamB?.name, shortName: match.teamB?.shortName },
      explicitWinnerTeamName,
      explicitWinnerTeamId || null,
    );

    if (teamAWins && !teamBWins) {
      return { winnerId: match.teamAId, reason: 'winner-team-matched-team-a' };
    }
    if (teamBWins && !teamAWins) {
      return { winnerId: match.teamBId, reason: 'winner-team-matched-team-b' };
    }
  }

  if (normalizedWinnerSide === 'blue') {
    return { winnerId: sideAssignment.blueSideTeamId, reason: 'winner-side-blue-fallback' };
  }
  if (normalizedWinnerSide === 'red') {
    return { winnerId: sideAssignment.redSideTeamId, reason: 'winner-side-red-fallback' };
  }

  return { winnerId: null, reason: 'winner-side-empty' };
}

function buildAlignedMatchTeamIds(
  match: { teamAId: string | null; teamBId: string | null },
  blueTeamId: string,
  redTeamId: string,
): { teamAId: string; teamBId: string } {
  const currentTeamAId = normalizeText(match.teamAId);
  const currentTeamBId = normalizeText(match.teamBId);

  const currentSet = new Set([currentTeamAId, currentTeamBId].filter(Boolean));
  const incomingSet = new Set([blueTeamId, redTeamId].filter(Boolean));
  const setsMatch = currentSet.size === incomingSet.size && [...incomingSet].every((id) => currentSet.has(id));
  if (setsMatch) {
    return {
      teamAId: currentTeamAId || blueTeamId,
      teamBId: currentTeamBId || redTeamId,
    };
  }

  if (currentTeamAId && (currentTeamAId === blueTeamId || currentTeamAId === redTeamId)) {
    return {
      teamAId: currentTeamAId,
      teamBId: currentTeamAId === blueTeamId ? redTeamId : blueTeamId,
    };
  }

  if (currentTeamBId && (currentTeamBId === blueTeamId || currentTeamBId === redTeamId)) {
    return {
      teamAId: currentTeamBId === blueTeamId ? redTeamId : blueTeamId,
      teamBId: currentTeamBId,
    };
  }

  return {
    teamAId: blueTeamId,
    teamBId: redTeamId,
  };
}


async function findTeamByName(name: string) {
  const key = normalizeTeamLookupKey(name);
  if (!key) {
    return null;
  }
  const teams = await prisma.team.findMany();
  return teams.find((team) => {
    return [team.name, team.shortName].some((value) => normalizeTeamLookupKey(value) === key);
  }) || null;
}

async function ensureTeam(name: string, league: string) {
  const rawName = normalizeText(name);
  if (!rawName) {
    throw new Error('team name is required');
  }

  const existingTeam = await findTeamByName(rawName);
  if (existingTeam) {
    return existingTeam;
  }

  return prisma.team.create({
    data: {
      name: rawName,
      shortName: buildShortName(rawName),
      region: buildRegionValue(league),
    },
  });
}

async function loadMatchWithRelations(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      games: { orderBy: { gameNumber: 'asc' } },
      teamA: true,
      teamB: true,
    },
  });
}

function createBpSyncError(message: string, status = 409) {
  const error: any = new Error(message);
  error.status = status;
  return error;
}

async function requireBoundMatch(sourceMatchId: string) {
  const normalizedSourceMatchId = normalizeText(sourceMatchId);
  if (!normalizedSourceMatchId) {
    throw createBpSyncError('未绑定相同的大场ID，拒绝导入');
  }

  const externalMatch = await prisma.match.findFirst({
    where: { bpSourceMatchId: normalizedSourceMatchId },
    include: {
      games: { orderBy: { gameNumber: 'asc' } },
      teamA: true,
      teamB: true,
    },
  });

  if (!externalMatch) {
    throw createBpSyncError(`未找到已绑定 BP 大场ID ${normalizedSourceMatchId} 的比赛，拒绝导入`);
  }

  return externalMatch;
}

function assertBoundMatchCompatible(
  match: {
    teamAId: string | null;
    teamBId: string | null;
    teamA?: { id?: string | null; name?: string | null; shortName?: string | null } | null;
    teamB?: { id?: string | null; name?: string | null; shortName?: string | null } | null;
  },
  blueTeamName: string,
  redTeamName: string,
  blueTeamId?: string | null,
  redTeamId?: string | null,
): void {
  const blueMatchesA = teamMatchesPayload(
    { id: match.teamAId, name: match.teamA?.name, shortName: match.teamA?.shortName },
    blueTeamName,
    blueTeamId,
  );
  const blueMatchesB = teamMatchesPayload(
    { id: match.teamBId, name: match.teamB?.name, shortName: match.teamB?.shortName },
    blueTeamName,
    blueTeamId,
  );
  const redMatchesA = teamMatchesPayload(
    { id: match.teamAId, name: match.teamA?.name, shortName: match.teamA?.shortName },
    redTeamName,
    redTeamId,
  );
  const redMatchesB = teamMatchesPayload(
    { id: match.teamBId, name: match.teamB?.name, shortName: match.teamB?.shortName },
    redTeamName,
    redTeamId,
  );

  if ((blueMatchesA && redMatchesB) || (blueMatchesB && redMatchesA)) {
    return;
  }

  throw createBpSyncError('已绑定的大场ID对应比赛与当前BP队伍不一致，拒绝导入');
}

function buildPlayerStatsRows(rows: BpSyncPickRow[] | null | undefined) {
  return sortPickRows(rows).map((row, index) => {
    const playerName = normalizeText(row.player_name);
    const championName = normalizeText(row.champion_id);
    const kills = toNonNegativeInteger(row.kills, 0) || 0;
    const deaths = toNonNegativeInteger(row.deaths, 0) || 0;
    const assists = toNonNegativeInteger(row.assists, 0) || 0;
    const role = normalizeBpRole(row.role) || ROLE_ORDER[index] || `ROLE_${index + 1}`;

    return {
      playerName,
      name: playerName,
      championName,
      hero: championName,
      kills,
      deaths,
      assists,
      kda: `${kills}/${deaths}/${assists}`,
      role,
    };
  });
}

async function attachPlayerIds(teamId: string, rows: ReturnType<typeof buildPlayerStatsRows>) {
  const players = await prisma.player.findMany({ where: { teamId } });
  const playerIdByName = new Map(players.map((player) => [normalizeKey(player.name), player.id]));

  return rows.map((row) => ({
    ...row,
    playerId: playerIdByName.get(normalizeKey(row.playerName)) || null,
  }));
}

async function recalculateMatchState(matchId: string) {
  const scoreMatch = await prisma.match.findUnique({
    where: { id: matchId },
    include: { games: true, teamA: true, teamB: true },
  });

  if (!scoreMatch) {
    throw new Error('match not found after saving game');
  }

  const referencedTeamIds = Array.from(
    new Set(
      [
        scoreMatch.teamAId,
        scoreMatch.teamBId,
        ...scoreMatch.games.flatMap((game) => [game.winnerId, game.blueSideTeamId, game.redSideTeamId]),
      ].filter(Boolean),
    ),
  ) as string[];
  const referencedTeams = referencedTeamIds.length > 0
    ? await prisma.team.findMany({ where: { id: { in: referencedTeamIds } } })
    : [];
  const { scoreA, scoreB, winnerId: nextWinnerId } = calculateMatchSeriesScore(scoreMatch, referencedTeams);
  const hasMeaningfulGames = scoreMatch.games.some((game) => (
    Boolean(game.winnerId)
    || game.duration !== null
    || game.totalKills !== null
    || game.blueKills !== null
    || game.redKills !== null
    || game.blueTenMinKills !== null
    || game.redTenMinKills !== null
    || Boolean(game.teamAStats)
    || Boolean(game.teamBStats)
    || Boolean(game.analysisData)
    || Boolean(game.externalSource)
    || Boolean(game.externalSourceResultId)
    || Boolean(game.externalSourceGameId)
  ));

  let nextStatus = hasMeaningfulGames ? 'ONGOING' : 'SCHEDULED';
  if ((scoreA > 0 || scoreB > 0) && nextWinnerId) {
    nextStatus = 'FINISHED';
  }

  if (nextStatus !== scoreMatch.status || nextWinnerId !== scoreMatch.winnerId) {
    await prisma.match.update({
      where: { id: scoreMatch.id },
      data: { status: nextStatus, winnerId: nextWinnerId },
    });

    if (nextWinnerId) {
      await propagateMatchResult(scoreMatch.id);
    }
  }
}

export async function clearBpGamePayload(payload: BpSyncPayload): Promise<BpSyncResult> {
  const sourceResultId = normalizeText(payload.game_id);
  const sourceMatchId = normalizeText(payload.source_match_id);
  const sourceGameId = normalizeText(payload.source_game_id);
  const gameNumber = toNonNegativeInteger(payload.game_number, 1) || 1;
  const boundMatch = await requireBoundMatch(sourceMatchId);

  let existingGame = sourceResultId
    ? await prisma.game.findFirst({ where: { externalSourceResultId: sourceResultId } })
    : null;

  if (existingGame && existingGame.matchId !== boundMatch.id) {
    existingGame = null;
  }

  if (!existingGame) {
    existingGame = await prisma.game.findFirst({
      where: { matchId: boundMatch.id, gameNumber },
    });
  }

  if (!existingGame) {
    const error: any = new Error('game not found for clear_game');
    error.status = 404;
    throw error;
  }

  const savedGame = await prisma.game.update({
    where: { id: existingGame.id },
    data: {
      winnerId: null,
      duration: null,
      blueSideTeamId: null,
      redSideTeamId: null,
      teamAStats: null,
      teamBStats: null,
      analysisData: null,
      totalKills: null,
      blueKills: null,
      redKills: null,
      blueTenMinKills: null,
      redTenMinKills: null,
      screenshot: null,
      screenshot2: null,
      externalSource: null,
      externalSourceResultId: null,
      externalSourceGameId: null,
    },
  });

  await recalculateMatchState(existingGame.matchId);

  return {
    ok: true,
    matchId: existingGame.matchId,
    gameId: savedGame.id,
    matchAction: 'updated',
    gameAction: 'updated',
    matchReason: 'external_match_id',
  };
}

export async function syncBpGamePayload(payload: BpSyncPayload): Promise<BpSyncResult> {
  const blueTeamName = normalizeText(payload.blue_team_name);
  const redTeamName = normalizeText(payload.red_team_name);
  if (!blueTeamName || !redTeamName) {
    throw new Error('blue_team_name and red_team_name are required');
  }

  const leagueValue = normalizeLeagueValue(payload.league);
  const formatValue = buildFormatValue(payload);
  const stageValue = buildStageValue(payload);
  const playedAt = parsePlayedAt(payload.played_at);
  const gameNumber = toNonNegativeInteger(payload.game_number, 1) || 1;
  const sourceMatchId = normalizeText(payload.source_match_id);
  const sourceGameId = normalizeText(payload.source_game_id);
  const sourceResultId = normalizeText(payload.game_id);

  const boundMatch = await requireBoundMatch(sourceMatchId);
  const blueTeam = await ensureTeam(blueTeamName, leagueValue);
  const redTeam = await ensureTeam(redTeamName, leagueValue);

  assertBoundMatchCompatible(
    boundMatch,
    blueTeamName,
    redTeamName,
    blueTeam.id,
    redTeam.id,
  );

  const resolved = { match: boundMatch, reason: 'external_match_id' as const };

  logBpSyncRuntime('bound-match-verified', {
    sourceMatchId,
    sourceResultId,
    gameNumber,
    matchId: boundMatch.id,
    matchTeamAId: boundMatch.teamAId,
    matchTeamBId: boundMatch.teamBId,
    blueTeamId: blueTeam.id,
    redTeamId: redTeam.id,
  });

  logBpSyncRuntime('resolve-match', {
    sourceMatchId,
    sourceResultId,
    sourceGameId,
    gameNumber,
    resolvedMatchId: resolved.match?.id ?? null,
    resolvedMatchReason: resolved.reason,
  });

  let match = resolved.match;
  const matchAction: 'created' | 'updated' = 'updated';

  const updateData: Record<string, unknown> = {};
  if (!normalizeText((match as any).externalSource)) {
    updateData.externalSource = SYNC_SOURCE;
  }
  if (!match.startTime && playedAt) {
    updateData.startTime = playedAt;
  }
  if (!normalizeText(match.gameVersion) && normalizeText(payload.patch_version)) {
    updateData.gameVersion = normalizeText(payload.patch_version);
  }
  if ((!normalizeText(match.stage) || normalizeText(match.stage) === 'Regular Season') && stageValue) {
    updateData.stage = stageValue;
  }
  if ((!normalizeText(match.tournament) || normalizeText(match.tournament) === 'LPL') && leagueValue) {
    updateData.tournament = leagueValue;
  }
  if (!normalizeText(match.format) && formatValue) {
    updateData.format = formatValue;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.match.update({ where: { id: match.id }, data: updateData });

    const refreshedMatch = await loadMatchWithRelations(match.id);
    if (!refreshedMatch) {
      throw new Error('match disappeared after update');
    }
    match = refreshedMatch;
  }

  const sideAssignment = resolveMatchSideAssignment(
    match,
    blueTeamName,
    redTeamName,
    blueTeam?.id ?? null,
    redTeam?.id ?? null,
  );

  logBpSyncRuntime('preserve-match-team-ids', {
    matchId: match.id,
    sourceResultId,
    gameNumber,
    matchTeamAId: match.teamAId,
    matchTeamBId: match.teamBId,
    blueSideTeamId: sideAssignment.blueSideTeamId,
    redSideTeamId: sideAssignment.redSideTeamId,
    sideAssignmentReason: sideAssignment.reason,
  });

  const teamARows = sideAssignment.matchTeamAIsBlue ? payload.blue_picks : payload.red_picks;
  const teamBRows = sideAssignment.matchTeamAIsBlue ? payload.red_picks : payload.blue_picks;

  const teamAStatsForUpsert = buildPlayerStatsRows(teamARows);
  const teamBStatsForUpsert = buildPlayerStatsRows(teamBRows);

  await upsertPlayersFromStats(match.teamAId || blueTeam?.id || '', match.tournament, teamAStatsForUpsert);
  await upsertPlayersFromStats(match.teamBId || redTeam?.id || '', match.tournament, teamBStatsForUpsert);

  const teamAStats = await attachPlayerIds(match.teamAId || blueTeam?.id || '', teamAStatsForUpsert);
  const teamBStats = await attachPlayerIds(match.teamBId || redTeam?.id || '', teamBStatsForUpsert);

  const winnerSide = normalizeText(payload.winner_side).toLowerCase();
  const resolvedWinner = resolveWinnerTeamId(
    match,
    sideAssignment,
    winnerSide,
    blueTeamName,
    redTeamName,
    blueTeam?.id ?? null,
    redTeam?.id ?? null,
    normalizeText(payload.winner_team_name) || null,
  );
  const winnerId = resolvedWinner.winnerId;
  logBpSyncRuntime('resolve-winner-id', {
    matchId: match.id,
    sourceResultId,
    gameNumber,
    winnerSide,
    winnerTeamName: normalizeText(payload.winner_team_name) || null,
    blueTeamName,
    redTeamName,
    blueTeamId: blueTeam?.id ?? null,
    redTeamId: redTeam?.id ?? null,
    blueSideTeamId: sideAssignment.blueSideTeamId,
    redSideTeamId: sideAssignment.redSideTeamId,
    resolvedWinnerId: winnerId,
    resolvedWinnerReason: resolvedWinner.reason,
  });
  const durationSeconds = toDurationSeconds(payload.game_duration_minutes);
  const blueKills = toNonNegativeInteger(payload.blue_team_kills, 0) || 0;
  const redKills = toNonNegativeInteger(payload.red_team_kills, 0) || 0;
  const totalKills = toNonNegativeInteger(payload.total_kills, blueKills + redKills) || (blueKills + redKills);
  const blueTenMinKills = toNonNegativeInteger(payload.blue_team_kills_at_10m, null);
  const redTenMinKills = toNonNegativeInteger(payload.red_team_kills_at_10m, null);

  let existingGame = null;
  let staleGameToClear: {
    id: string;
    matchId: string;
  } | null = null;

  if (sourceResultId) {
    existingGame = await prisma.game.findFirst({ where: { externalSourceResultId: sourceResultId } });
    logBpSyncRuntime('existing-game-by-source-result', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      existingGameId: existingGame?.id ?? null,
      existingGameMatchId: existingGame?.matchId ?? null,
      existingGameExternalSourceResultId: existingGame?.externalSourceResultId ?? null,
    });
  }
  if (!existingGame) {
    existingGame = await prisma.game.findFirst({ where: { matchId: match.id, gameNumber } });
    logBpSyncRuntime('existing-game-by-match-slot', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      existingGameId: existingGame?.id ?? null,
      existingGameMatchId: existingGame?.matchId ?? null,
      existingGameExternalSourceResultId: existingGame?.externalSourceResultId ?? null,
    });
  } else if (existingGame.matchId !== match.id) {
    const targetGame = await prisma.game.findFirst({ where: { matchId: match.id, gameNumber } });
    logBpSyncRuntime('existing-game-match-mismatch', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      existingGameId: existingGame.id,
      existingGameMatchId: existingGame.matchId,
      targetGameId: targetGame?.id ?? null,
      targetGameMatchId: targetGame?.matchId ?? null,
      targetGameExternalSourceResultId: targetGame?.externalSourceResultId ?? null,
    });
    if (targetGame && (!targetGame.externalSourceResultId || targetGame.externalSourceResultId === sourceResultId)) {
      staleGameToClear = {
        id: existingGame.id,
        matchId: existingGame.matchId,
      };
      existingGame = targetGame;
      logBpSyncRuntime('reuse-target-game-and-mark-stale', {
        matchId: match.id,
        sourceResultId,
        gameNumber,
        existingGameId: existingGame.id,
        existingGameMatchId: existingGame.matchId,
        staleGameId: staleGameToClear.id,
        staleGameMatchId: staleGameToClear.matchId,
      });
    } else if (!targetGame) {
      existingGame = await prisma.game.update({
        where: { id: existingGame.id },
        data: {
          matchId: match.id,
          gameNumber,
        },
      });
      logBpSyncRuntime('move-existing-game-to-target-match', {
        matchId: match.id,
        sourceResultId,
        gameNumber,
        movedGameId: existingGame.id,
        movedGameMatchId: existingGame.matchId,
      });
    } else {
      logBpSyncRuntime('target-game-slot-occupied', {
        matchId: match.id,
        sourceResultId,
        gameNumber,
        existingGameId: existingGame.id,
        existingGameMatchId: existingGame.matchId,
        targetGameId: targetGame.id,
        targetGameMatchId: targetGame.matchId,
        targetGameExternalSourceResultId: targetGame.externalSourceResultId,
      });
      const error: any = new Error('target game slot already occupied by another source result');
      error.status = 409;
      throw error;
    }
  }

  const gameData = {
    winnerId,
    duration: durationSeconds,
    totalKills,
    blueKills,
    redKills,
    blueTenMinKills,
    redTenMinKills,
    blueSideTeamId: sideAssignment.blueSideTeamId,
    redSideTeamId: sideAssignment.redSideTeamId,
    teamAStats: JSON.stringify(teamAStats),
    teamBStats: JSON.stringify(teamBStats),
    analysisData: JSON.stringify({ source: SYNC_SOURCE, payload }),
    externalSource: SYNC_SOURCE,
    externalSourceResultId: sourceResultId || null,
    externalSourceGameId: sourceGameId || null,
  };

  let savedGame;
  let gameAction: 'created' | 'updated' = 'updated';

  if (staleGameToClear && staleGameToClear.id !== existingGame?.id) {
    await prisma.game.update({
      where: { id: staleGameToClear.id },
      data: {
        externalSource: null,
        externalSourceResultId: null,
        externalSourceGameId: null,
      },
    });
    logBpSyncRuntime('release-stale-game-source-result', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      targetGameId: existingGame?.id ?? null,
      staleGameId: staleGameToClear.id,
      staleGameMatchId: staleGameToClear.matchId,
    });
  }

  if (existingGame) {
    savedGame = await prisma.game.update({
      where: { id: existingGame.id },
      data: gameData,
    });
    logBpSyncRuntime('save-game-update', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      savedGameId: savedGame.id,
      savedGameMatchId: savedGame.matchId,
      staleGameId: staleGameToClear?.id ?? null,
      staleGameMatchId: staleGameToClear?.matchId ?? null,
    });
  } else {
    savedGame = await prisma.game.create({
      data: {
        matchId: match.id,
        gameNumber,
        ...gameData,
      },
    });
    gameAction = 'created';
    logBpSyncRuntime('save-game-create', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      savedGameId: savedGame.id,
      savedGameMatchId: savedGame.matchId,
      staleGameId: staleGameToClear?.id ?? null,
      staleGameMatchId: staleGameToClear?.matchId ?? null,
    });
  }

  if (
    savedGame.winnerId !== winnerId
    || savedGame.blueSideTeamId !== sideAssignment.blueSideTeamId
    || savedGame.redSideTeamId !== sideAssignment.redSideTeamId
  ) {
    savedGame = await prisma.game.update({
      where: { id: savedGame.id },
      data: {
        winnerId,
        blueSideTeamId: sideAssignment.blueSideTeamId,
        redSideTeamId: sideAssignment.redSideTeamId,
      },
    });
    logBpSyncRuntime('save-game-post-verify-fix', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      savedGameId: savedGame.id,
      verifiedWinnerId: savedGame.winnerId,
      verifiedBlueSideTeamId: savedGame.blueSideTeamId,
      verifiedRedSideTeamId: savedGame.redSideTeamId,
    });
  }

  if (staleGameToClear && staleGameToClear.id !== savedGame.id) {
    await prisma.game.update({
      where: { id: staleGameToClear.id },
      data: {
        winnerId: null,
        duration: null,
        teamAStats: null,
        teamBStats: null,
        analysisData: null,
        totalKills: null,
        blueKills: null,
        redKills: null,
        blueTenMinKills: null,
        redTenMinKills: null,
        screenshot: null,
        screenshot2: null,
        externalSource: null,
        externalSourceResultId: null,
        externalSourceGameId: null,
      },
    });
    logBpSyncRuntime('clear-stale-game', {
      matchId: match.id,
      sourceResultId,
      gameNumber,
      savedGameId: savedGame.id,
      staleGameId: staleGameToClear.id,
      staleGameMatchId: staleGameToClear.matchId,
    });
    if (staleGameToClear.matchId !== match.id) {
      await recalculateMatchState(staleGameToClear.matchId);
    }
  }

  await recalculateMatchState(match.id);

  return {
    ok: true,
    matchId: match.id,
    gameId: savedGame.id,
    matchAction,
    gameAction,
    matchReason: resolved.reason,
  };
}



