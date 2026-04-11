import { extractSeasonYear, normalizeLeague } from '@/lib/player-snapshot';

export type EventMetaRow = {
  league: string;
  seasonYear: string;
  tournamentName: string;
  stage?: string;
  games: number;
  syncedAtMs: number;
};

type SnapshotMetaInput = {
  league: unknown;
  seasonYear: unknown;
  tournamentName: unknown;
  games?: unknown;
  syncedAt?: unknown;
};

type MatchMetaInput = {
  tournament: unknown;
  stage?: unknown;
  startTime?: unknown;
  teamA?: { region?: unknown } | null;
  teamB?: { region?: unknown } | null;
};

const WORLD_KEYWORDS = ['WORLDS', 'WORLD', 'MSI', '全球', '世界赛', '国际赛事'];
const OTHER_LEAF_LEAGUES = ['LEC', 'LCS', 'LCP', 'CBLOL', 'LJL', 'VCS', 'PCS', 'LTA', 'LLA', 'TCL'];

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferLeagueFromTournamentName(tournamentName: string) {
  const upper = tournamentName.toUpperCase();
  if (upper.includes('LPL')) return 'LPL';
  if (upper.includes('LCK')) return 'LCK';
  if (WORLD_KEYWORDS.some((keyword) => upper.includes(keyword))) return 'WORLDS';
  const leafLeague = OTHER_LEAF_LEAGUES.find((league) => upper.includes(league));
  return leafLeague || '';
}

function inferLeagueFromMatch(row: MatchMetaInput) {
  const inferredFromTournament = inferLeagueFromTournamentName(normalizeText(row.tournament));
  if (inferredFromTournament) return inferredFromTournament;
  const primary = normalizeLeague(row.teamA?.region || row.teamB?.region);
  if (primary && primary !== 'OTHER') return primary;
  return primary || 'OTHER';
}

export function buildEventMetaRowsFromSnapshots(rows: SnapshotMetaInput[]): EventMetaRow[] {
  return rows
    .map((row) => ({
      league: normalizeLeague(row.league),
      seasonYear: normalizeText(row.seasonYear),
      tournamentName: normalizeText(row.tournamentName),
      games: Math.max(0, toNumber(row.games)),
      syncedAtMs: row.syncedAt ? new Date(String(row.syncedAt)).getTime() : 0,
    }))
    .filter((row) => row.tournamentName.length > 0);
}

export function buildEventMetaRowsFromMatches(rows: MatchMetaInput[]): EventMetaRow[] {
  return rows
    .map((row) => {
      const tournamentName = normalizeText(row.tournament);
      const syncedAtMs = row.startTime ? new Date(String(row.startTime)).getTime() : 0;
      return {
        league: inferLeagueFromMatch(row),
        seasonYear: extractSeasonYear({
          tournamentName,
          dateFrom: row.startTime ? new Date(String(row.startTime)).toISOString() : null,
        }),
        tournamentName,
        stage: normalizeText(row.stage),
        games: 1,
        syncedAtMs: Number.isFinite(syncedAtMs) ? syncedAtMs : 0,
      };
    })
    .filter((row) => row.tournamentName.length > 0);
}
