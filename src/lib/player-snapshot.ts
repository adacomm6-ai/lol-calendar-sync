import type { Prisma } from '@prisma/client';

export interface PlayerSnapshotUpsertPayload {
  sourceKey: string;
  league: string;
  seasonYear: string;
  splitName?: string | null;
  tournamentName: string;
  role: string;
  playerName: string;
  normalizedPlayerName?: string | null;
  teamName: string;
  teamShortName?: string | null;
  source: string;
  sourceUrl?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  games?: number | null;
  wins?: number | null;
  losses?: number | null;
  winRatePct?: number | null;
  kda?: number | null;
  avgKills?: number | null;
  avgDeaths?: number | null;
  avgAssists?: number | null;
  csPerMin?: number | null;
  goldPerMin?: number | null;
  killParticipationPct?: number | null;
  damageSharePct?: number | null;
  goldSharePct?: number | null;
  visionSharePct?: number | null;
  damagePerMin?: number | null;
  visionScorePerMin?: number | null;
  wardsPerMin?: number | null;
  wardsClearedPerMin?: number | null;
  visionWardsPerMin?: number | null;
  goldDiffAt15?: number | null;
  csDiffAt15?: number | null;
  xpDiffAt15?: number | null;
  firstBloodParticipationPct?: number | null;
  firstBloodVictimPct?: number | null;
  currentRecentGames?: number | null;
  currentTotalGames?: number | null;
  confidence?: number | null;
  stateScore?: number | null;
  masteryScore?: number | null;
  laneScore?: number | null;
  overallScore?: number | null;
  relativeScore?: number | null;
  relativeZScore?: number | null;
  evaluationLabel?: string | null;
  trendScore?: number | null;
  labels?: string[] | null;
  insights?: string[] | null;
  recentWinRatePct?: number | null;
  careerWinRatePct?: number | null;
  recentKda?: number | null;
  careerKda?: number | null;
  localGoldPerMin?: number | null;
  localCsPerMin?: number | null;
  localDamagePerMin?: number | null;
  localDamageTakenPerMin?: number | null;
  localKillParticipationPct?: number | null;
  localVisionPerMin?: number | null;
  localScore?: number | null;
  localExternalWinRatePct?: number | null;
  mappedTeamName?: string | null;
  mappedRole?: string | null;
  sampleGames?: number | null;
  mappingConfidence?: number | null;
  extra?: Record<string, unknown> | null;
}

const OTHER_LEAF_LEAGUES = new Set(['LEC', 'LCS', 'LCP', 'CBLOL', 'LJL', 'VCS', 'PCS', 'LTA', 'LLA', 'TCL']);
const WORLD_KEYWORDS = ['WORLD', 'WORLDS', 'MSI', '全球', '世界赛', '国际赛事'];

export function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeLeague(value: unknown): string {
  return normalizeText(value).toUpperCase() || 'OTHER';
}

export function normalizeLeagueBucket(value: unknown, tournamentName?: unknown): string {
  const league = normalizeLeague(value);
  const tournament = normalizeText(tournamentName);
  const upperTournament = tournament.toUpperCase();

  if (league === 'LPL') return 'LPL';
  if (league === 'LCK') return 'LCK';
  if (
    league === 'WORLDS' ||
    league === 'WORLD' ||
    league === 'INTERNATIONAL' ||
    WORLD_KEYWORDS.some((keyword) => upperTournament.includes(keyword) || tournament.includes(keyword))
  ) {
    return 'WORLDS';
  }
  if (OTHER_LEAF_LEAGUES.has(league) || league === 'OTHER') {
    return 'OTHER';
  }
  return league || 'OTHER';
}

export function normalizeRole(value: unknown): string {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return 'OTHER';
  if (['TOP', '上单'].includes(raw)) return 'TOP';
  if (['JUN', 'JUNGLE', 'JG', '打野'].includes(raw)) return 'JUN';
  if (['MID', '中单'].includes(raw)) return 'MID';
  if (['ADC', 'BOT', '下路'].includes(raw)) return 'ADC';
  if (['SUP', 'SUPPORT', '辅助'].includes(raw)) return 'SUP';
  return raw;
}

export function normalizeNameKey(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

export function extractSeasonYear(input: { seasonYear?: string | null; tournamentName?: string | null; dateFrom?: string | null; dateTo?: string | null }): string {
  const explicit = normalizeText(input.seasonYear);
  if (/^20\d{2}$/.test(explicit)) return explicit;

  const tournament = normalizeText(input.tournamentName);
  const tournamentMatch = tournament.match(/(20\d{2})/);
  if (tournamentMatch) return tournamentMatch[1];

  const dateText = normalizeText(input.dateFrom) || normalizeText(input.dateTo);
  const dateMatch = dateText.match(/(20\d{2})/);
  if (dateMatch) return dateMatch[1];
  return String(new Date().getFullYear());
}

export function canonicalizeTournamentName(input: {
  league?: string | null;
  seasonYear?: string | null;
  tournamentName?: string | null;
}) {
  const league = normalizeLeague(input.league);
  const seasonYear = extractSeasonYear({
    seasonYear: input.seasonYear || null,
    tournamentName: input.tournamentName || null,
  });
  const tournamentName = normalizeText(input.tournamentName);
  const lower = tournamentName.toLowerCase();
  const isUnknown = lower.includes('unknown') || tournamentName.includes('未知');

  if (!isUnknown) {
    return tournamentName;
  }

  if (league === 'CBLOL') return `CBLOL ${seasonYear} Cup`;
  if (league === 'LJL') return `LJL ${seasonYear} Winter Playoffs`;
  if (league === 'LEC') return `LEC ${seasonYear} Versus`;
  if (league === 'LCP') return `LCP ${seasonYear} Split 1`;
  if (league === 'LCS') return `LCS ${seasonYear} Lock-In`;
  if (league === 'VCS') return `VCS ${seasonYear} Spring`;

  return `${league || 'OTHER'} ${seasonYear} Season`;
}

export function inferSplitName(input: { splitName?: string | null; tournamentName?: string | null }): string {
  const explicit = normalizeText(input.splitName);
  if (explicit) return explicit;
  const text = normalizeText(input.tournamentName).toLowerCase();
  if (!text) return '未分类';
  if (text.includes('split 1') || text.includes('第一赛段') || text.includes('spring')) return 'Split 1';
  if (text.includes('split 2') || text.includes('第二赛段') || text.includes('summer')) return 'Split 2';
  if (text.includes('split 3') || text.includes('第三赛段') || text.includes('winter') || text.includes('cup')) return 'Split 3';
  if (text.includes('world') || text.includes('msi') || text.includes('全球') || text.includes('世界赛')) return '国际赛事';
  return '未分类';
}

export function buildTeamShortName(teamName: unknown, fallback?: unknown): string | null {
  const preferred = normalizeText(fallback);
  if (preferred) return preferred.toUpperCase();
  const text = normalizeText(teamName);
  if (!text) return null;
  if (/^[A-Za-z0-9]{2,6}$/.test(text)) return text.toUpperCase();
  const initials = text
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  if (initials.length >= 2 && initials.length <= 6) return initials;
  return text.length <= 6 ? text.toUpperCase() : null;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNullableDate(value: unknown): Date | null {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function buildSnapshotCreateInput(payload: PlayerSnapshotUpsertPayload, playerId: string | null, teamId: string | null): Prisma.PlayerStatSnapshotUncheckedCreateInput {
  const canonicalTournamentName = canonicalizeTournamentName({
    league: payload.league,
    seasonYear: payload.seasonYear || null,
    tournamentName: payload.tournamentName,
  });

  return {
    sourceKey: normalizeText(payload.sourceKey),
    playerId,
    teamId,
    league: normalizeLeague(payload.league),
    seasonYear: extractSeasonYear({ ...payload, tournamentName: canonicalTournamentName }),
    splitName: inferSplitName({ ...payload, tournamentName: canonicalTournamentName }),
    tournamentName: canonicalTournamentName,
    role: normalizeRole(payload.role),
    playerName: normalizeText(payload.playerName),
    normalizedPlayerName: normalizeNameKey(payload.normalizedPlayerName || payload.playerName),
    teamName: normalizeText(payload.teamName),
    teamShortName: buildTeamShortName(payload.teamName, payload.teamShortName),
    source: normalizeText(payload.source),
    sourceUrl: normalizeText(payload.sourceUrl) || null,
    dateFrom: toNullableDate(payload.dateFrom),
    dateTo: toNullableDate(payload.dateTo),
    games: Math.max(0, Math.round(toNullableNumber(payload.games) || 0)),
    wins: Math.max(0, Math.round(toNullableNumber(payload.wins) || 0)),
    losses: Math.max(0, Math.round(toNullableNumber(payload.losses) || 0)),
    winRatePct: toNullableNumber(payload.winRatePct),
    kda: toNullableNumber(payload.kda),
    avgKills: toNullableNumber(payload.avgKills),
    avgDeaths: toNullableNumber(payload.avgDeaths),
    avgAssists: toNullableNumber(payload.avgAssists),
    csPerMin: toNullableNumber(payload.csPerMin),
    goldPerMin: toNullableNumber(payload.goldPerMin),
    killParticipationPct: toNullableNumber(payload.killParticipationPct),
    damageSharePct: toNullableNumber(payload.damageSharePct),
    goldSharePct: toNullableNumber(payload.goldSharePct),
    visionSharePct: toNullableNumber(payload.visionSharePct),
    damagePerMin: toNullableNumber(payload.damagePerMin),
    visionScorePerMin: toNullableNumber(payload.visionScorePerMin),
    wardsPerMin: toNullableNumber(payload.wardsPerMin),
    wardsClearedPerMin: toNullableNumber(payload.wardsClearedPerMin),
    visionWardsPerMin: toNullableNumber(payload.visionWardsPerMin),
    goldDiffAt15: toNullableNumber(payload.goldDiffAt15),
    csDiffAt15: toNullableNumber(payload.csDiffAt15),
    xpDiffAt15: toNullableNumber(payload.xpDiffAt15),
    firstBloodParticipationPct: toNullableNumber(payload.firstBloodParticipationPct),
    firstBloodVictimPct: toNullableNumber(payload.firstBloodVictimPct),
    currentRecentGames: Math.max(0, Math.round(toNullableNumber(payload.currentRecentGames) || 0)),
    currentTotalGames: Math.max(0, Math.round(toNullableNumber(payload.currentTotalGames) || 0)),
    confidence: toNullableNumber(payload.confidence),
    stateScore: toNullableNumber(payload.stateScore),
    masteryScore: toNullableNumber(payload.masteryScore),
    laneScore: toNullableNumber(payload.laneScore),
    overallScore: toNullableNumber(payload.overallScore),
    relativeScore: toNullableNumber(payload.relativeScore),
    relativeZScore: toNullableNumber(payload.relativeZScore),
    evaluationLabel: normalizeText(payload.evaluationLabel) || null,
    trendScore: toNullableNumber(payload.trendScore),
    labelsJson: JSON.stringify(parseJsonArray(payload.labels)),
    insightsJson: JSON.stringify(parseJsonArray(payload.insights)),
    recentWinRatePct: toNullableNumber(payload.recentWinRatePct),
    careerWinRatePct: toNullableNumber(payload.careerWinRatePct),
    recentKda: toNullableNumber(payload.recentKda),
    careerKda: toNullableNumber(payload.careerKda),
    localGoldPerMin: toNullableNumber(payload.localGoldPerMin),
    localCsPerMin: toNullableNumber(payload.localCsPerMin),
    localDamagePerMin: toNullableNumber(payload.localDamagePerMin),
    localDamageTakenPerMin: toNullableNumber(payload.localDamageTakenPerMin),
    localKillParticipationPct: toNullableNumber(payload.localKillParticipationPct),
    localVisionPerMin: toNullableNumber(payload.localVisionPerMin),
    localScore: toNullableNumber(payload.localScore),
    localExternalWinRatePct: toNullableNumber(payload.localExternalWinRatePct),
    mappedTeamName: normalizeText(payload.mappedTeamName) || null,
    mappedRole: normalizeText(payload.mappedRole) || null,
    sampleGames: toNullableNumber(payload.sampleGames) === null ? null : Math.max(0, Math.round(toNullableNumber(payload.sampleGames) || 0)),
    mappingConfidence: toNullableNumber(payload.mappingConfidence),
    extraJson: payload.extra ? JSON.stringify(payload.extra) : null,
    syncedAt: new Date(),
  };
}
