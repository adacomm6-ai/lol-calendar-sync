import { prisma } from '@/lib/db';

const DEFAULT_PROVIDER = 'Pre-match';
const SUPPORTED_TYPES = new Set(['WINNER', 'HANDICAP', 'KILLS', 'TIME']);

export interface OddsSyncMarketPayload {
  gameNumber?: number | string | null;
  type?: string | null;
  provider?: string | null;
  threshold?: number | string | null;
  teamAOdds?: number | string | null;
  teamBOdds?: number | string | null;
  sectionName?: string | null;
}

export interface OddsSyncPayload {
  source?: string | null;
  taskLabel?: string | null;
  capturedAt?: string | null;
  matchId?: string | null;
  eventName?: string | null;
  teamAName?: string | null;
  teamBName?: string | null;
  markets?: OddsSyncMarketPayload[] | null;
}

export interface OddsSyncResult {
  ok: true;
  matchId: string;
  matchedBy: 'match_id';
  reversed: boolean;
  created: number;
  updated: number;
  skipped: number;
  marketCount: number;
}

type MatchCandidate = Awaited<ReturnType<typeof prisma.match.findFirst>> & {
  teamA: { id: string; name: string; shortName: string | null } | null;
  teamB: { id: string; name: string; shortName: string | null } | null;
};

type NormalizedMarket = {
  gameNumber: number;
  type: 'WINNER' | 'HANDICAP' | 'KILLS' | 'TIME';
  provider: string;
  threshold: number | null;
  teamAOdds: number;
  teamBOdds: number;
};

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeLooseKey(value: unknown): string {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (isFiniteNumber(value)) {
    return value;
  }
  const parsed = Number.parseFloat(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = toOptionalNumber(value);
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseCapturedAt(value: unknown): Date {
  const text = normalizeText(value);
  if (!text) {
    return new Date();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildTeamKeys(team: { name?: string | null; shortName?: string | null } | null | undefined): string[] {
  const keys = [normalizeLooseKey(team?.name), normalizeLooseKey(team?.shortName)].filter(Boolean);
  return Array.from(new Set(keys));
}

function matchesTeamName(team: { name?: string | null; shortName?: string | null } | null | undefined, incoming: string): boolean {
  const incomingKey = normalizeLooseKey(incoming);
  if (!incomingKey) {
    return false;
  }
  return buildTeamKeys(team).some((candidate) => {
    return candidate === incomingKey
      || candidate.includes(incomingKey)
      || incomingKey.includes(candidate);
  });
}

function normalizeMarket(input: OddsSyncMarketPayload, capturedAt: Date): NormalizedMarket | null {
  const gameNumber = Number.parseInt(normalizeText(input?.gameNumber), 10);
  const type = normalizeText(input?.type).toUpperCase();
  const provider = normalizeText(input?.provider) || DEFAULT_PROVIDER;
  const teamAOdds = toPositiveNumber(input?.teamAOdds);
  const teamBOdds = toPositiveNumber(input?.teamBOdds);
  const threshold = toOptionalNumber(input?.threshold);

  if (!Number.isFinite(gameNumber) || gameNumber <= 0) {
    return null;
  }
  if (!SUPPORTED_TYPES.has(type)) {
    return null;
  }
  if (!teamAOdds || !teamBOdds) {
    return null;
  }
  if (type === 'WINNER') {
    return {
      gameNumber,
      type: 'WINNER',
      provider,
      threshold: null,
      teamAOdds,
      teamBOdds,
    };
  }
  if (!Number.isFinite(threshold)) {
    return null;
  }
  return {
    gameNumber,
    type: type as NormalizedMarket['type'],
    provider,
    threshold: Number(Number(threshold).toFixed(2)),
    teamAOdds,
    teamBOdds,
  };
}

function scoreCandidate(match: MatchCandidate, payload: OddsSyncPayload): { score: number; reversed: boolean } {
  const incomingTeamA = normalizeText(payload.teamAName);
  const incomingTeamB = normalizeText(payload.teamBName);
  if (!incomingTeamA || !incomingTeamB || !match?.teamA || !match?.teamB) {
    return { score: -1, reversed: false };
  }

  const sameOrder = matchesTeamName(match.teamA, incomingTeamA) && matchesTeamName(match.teamB, incomingTeamB);
  const reversedOrder = matchesTeamName(match.teamA, incomingTeamB) && matchesTeamName(match.teamB, incomingTeamA);
  if (!sameOrder && !reversedOrder) {
    return { score: -1, reversed: false };
  }

  let score = 6;
  const eventKey = normalizeLooseKey(payload.eventName);
  const tournamentKey = normalizeLooseKey(match.tournament);
  const stageKey = normalizeLooseKey(match.stage);
  if (eventKey && (tournamentKey.includes(eventKey) || eventKey.includes(tournamentKey) || stageKey.includes(eventKey) || eventKey.includes(stageKey))) {
    score += 1;
  }
  if (String(match.status || '').toUpperCase() !== 'FINISHED') {
    score += 1;
  }

  return { score, reversed: reversedOrder };
}

async function resolveMatch(payload: OddsSyncPayload): Promise<{ match: MatchCandidate; matchedBy: 'match_id'; reversed: boolean }> {
  const matchId = normalizeText(payload.matchId);
  if (!matchId) {
    throw new Error('必须提供 lolMatchId，系统只按 LoL数据网页 的比赛 ID 精准同步。');
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { teamA: true, teamB: true },
  });
  if (!match) {
    throw new Error(`未找到指定比赛：${matchId}`);
  }

  const scored = scoreCandidate(match as MatchCandidate, payload);
  if (normalizeText(payload.teamAName) && normalizeText(payload.teamBName) && scored.score < 0) {
    throw new Error('同步目标比赛存在，但队伍名称与采集任务不匹配，请检查 lolMatchId 或任务队伍关键字。');
  }

  return {
    match: match as MatchCandidate,
    matchedBy: 'match_id',
    reversed: scored.reversed,
  };
}

function alignMarketToMatch(market: NormalizedMarket, reversed: boolean): NormalizedMarket {
  if (!reversed) {
    return market;
  }
  if (market.type === 'WINNER') {
    return {
      ...market,
      teamAOdds: market.teamBOdds,
      teamBOdds: market.teamAOdds,
    };
  }
  if (market.type === 'HANDICAP') {
    return {
      ...market,
      teamAOdds: market.teamBOdds,
      teamBOdds: market.teamAOdds,
      threshold: market.threshold === null ? null : Number(Number(-market.threshold).toFixed(2)),
    };
  }
  return market;
}

export async function syncPreMatchOddsPayload(payload: OddsSyncPayload): Promise<OddsSyncResult> {
  const markets = Array.isArray(payload?.markets) ? payload.markets : [];
  if (!markets.length) {
    throw new Error('缺少 markets，同步请求未包含有效盘口。');
  }

  const capturedAt = parseCapturedAt(payload.capturedAt);
  const normalizedMarkets = markets
    .map((market) => normalizeMarket(market, capturedAt))
    .filter((market): market is NormalizedMarket => Boolean(market));

  if (!normalizedMarkets.length) {
    throw new Error('请求中的盘口都未通过校验，未执行写入。');
  }

  const { match, matchedBy, reversed } = await resolveMatch(payload);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const market of normalizedMarkets) {
      const alignedMarket = alignMarketToMatch(market, reversed);
      const existing = await tx.odds.findFirst({
        where: {
          matchId: match.id,
          gameNumber: alignedMarket.gameNumber,
          type: alignedMarket.type,
          provider: alignedMarket.provider,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      const data = {
        teamAOdds: alignedMarket.teamAOdds,
        teamBOdds: alignedMarket.teamBOdds,
        threshold: alignedMarket.threshold,
        timestamp: capturedAt,
      };

      if (existing) {
        const unchanged =
          Number(existing.teamAOdds) === data.teamAOdds
          && Number(existing.teamBOdds) === data.teamBOdds
          && (existing.threshold ?? null) === data.threshold;

        if (unchanged) {
          skipped += 1;
          continue;
        }

        await tx.odds.update({
          where: { id: existing.id },
          data,
        });
        updated += 1;
        continue;
      }

      await tx.odds.create({
        data: {
          matchId: match.id,
          gameNumber: alignedMarket.gameNumber,
          provider: alignedMarket.provider,
          type: alignedMarket.type,
          threshold: alignedMarket.threshold,
          teamAOdds: alignedMarket.teamAOdds,
          teamBOdds: alignedMarket.teamBOdds,
          timestamp: capturedAt,
        },
      });
      created += 1;
    }
  });

  return {
    ok: true,
    matchId: match.id,
    matchedBy,
    reversed,
    created,
    updated,
    skipped,
    marketCount: normalizedMarkets.length,
  };
}


