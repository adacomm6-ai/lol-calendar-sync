import { NextRequest, NextResponse } from 'next/server';

import { getSystemConfig } from '@/lib/config-service';
import { getCachedScheduleMatches } from '@/lib/data-cache';
import { prisma } from '@/lib/db';
import { comparePreferredEventCandidates } from '@/lib/event-defaults';

type CalendarMatch = {
  id: string;
  startTime: Date | string | null;
  updatedAt?: Date | string;
  status?: string | null;
  format?: string | null;
  tournament?: string | null;
  stage?: string | null;
  teamAId?: string | null;
  teamBId?: string | null;
  teamA?: {
    id?: string | null;
    name?: string | null;
    shortName?: string | null;
    region?: string | null;
  } | null;
  teamB?: {
    id?: string | null;
    name?: string | null;
    shortName?: string | null;
    region?: string | null;
  } | null;
};

type StagePreferenceSummary = {
  normalizedStageId: string;
  label: string;
  totalCount: number;
  latestTimestampMs: number;
  hasUpcoming: boolean;
};

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePositiveInt(raw: string | null, fallback: number) {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseRegionList(raw: string | null | undefined) {
  return Array.from(
    new Set(
      String(raw || '')
        .split(/[,\s]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function normalizeFilterText(value: string | null | undefined) {
  return String(value || '')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_()/]+/g, '');
}

function escapeIcsText(value: string | null | undefined) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsLine(line: string) {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let index = 0;
  while (index < line.length) {
    const chunk = line.slice(index, index + 73);
    parts.push(index === 0 ? chunk : ` ${chunk}`);
    index += 73;
  }
  return parts.join('\r\n');
}

function toIcsUtcStamp(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function estimateDurationMinutes(format: string | null | undefined) {
  const normalized = String(format || '').trim().toUpperCase();
  if (normalized === 'BO5') return 300;
  if (normalized === 'BO1') return 120;
  return 210;
}

function buildEventTitle(match: CalendarMatch) {
  const teamA = match.teamA?.shortName || match.teamA?.name || '待定';
  const teamB = match.teamB?.shortName || match.teamB?.name || '待定';
  const tournament = String(match.tournament || '').trim();
  return tournament ? `${tournament} | ${teamA} vs ${teamB}` : `${teamA} vs ${teamB}`;
}

function buildEventDescription(match: CalendarMatch, matchUrl: string) {
  const lines = [
    `赛事：${String(match.tournament || '').trim() || '未命名赛事'}`,
    `阶段：${String(match.stage || '').trim() || '未标注阶段'}`,
    `赛制：${String(match.format || '').trim().toUpperCase() || 'BO3'}`,
    `状态：${String(match.status || '').trim().toUpperCase() || 'SCHEDULED'}`,
    `链接：${matchUrl}`,
  ];
  return lines.join('\n');
}

function buildCalendarName(params: {
  region?: string;
  year?: string;
  stage?: string;
  regions?: string[];
  team?: string;
}) {
  const parts = ['LOL赛程'];
  if (params.region) parts.push(params.region);
  if (params.year) parts.push(params.year);
  if (params.stage) parts.push(params.stage);
  if (params.regions && params.regions.length > 0) parts.push(params.regions.join('+'));
  if (params.team) parts.push(params.team);
  return parts.join('-');
}

function isFinishedStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toUpperCase();
  return normalized === 'FINISHED' || normalized === 'COMPLETED';
}

function isFirstStagePlayoffsStage(split: { id?: string | null; name?: string | null; mapping?: string | null }) {
  const text = `${split.id || ''} ${split.name || ''} ${split.mapping || ''}`;
  const lower = text.toLowerCase();
  const isFirstStage = lower.includes('split 1') || text.includes('第一赛段');
  const isPlayoffs = lower.includes('playoff') || text.includes('季后赛');
  return isFirstStage && isPlayoffs;
}

function normalizeStageId(
  value: string,
  splits: Array<{ id?: string | null; name?: string | null; mapping?: string | null }>,
  mergedFirstStageId: string,
) {
  const matched = splits.find((split) => split.id === value);
  if (matched && isFirstStagePlayoffsStage(matched)) return mergedFirstStageId;

  const lower = String(value || '').toLowerCase();
  const looksLikeFirstPlayoffs =
    (lower.includes('split 1') || String(value || '').includes('第一赛段')) &&
    (lower.includes('playoff') || String(value || '').includes('季后赛'));

  return looksLikeFirstPlayoffs ? mergedFirstStageId : value;
}

function summarizeStagePreference(stageId: string, label: string, matches: CalendarMatch[]): StagePreferenceSummary {
  const latestTimestampMs = matches.reduce((max, match) => {
    const startMs = toDate(match.startTime)?.getTime() ?? 0;
    return Math.max(max, startMs);
  }, 0);

  const hasUpcoming = matches.some((match) => {
    if (isFinishedStatus(match.status)) return false;
    const startMs = toDate(match.startTime)?.getTime();
    return startMs === undefined || startMs === null || startMs >= Date.now();
  });

  return {
    normalizedStageId: stageId,
    label,
    totalCount: matches.length,
    latestTimestampMs,
    hasUpcoming,
  };
}

function matchBelongsToAnyRegion(match: CalendarMatch, regionFilters: string[]) {
  if (regionFilters.length === 0) return true;

  const tournamentUpper = String(match.tournament || '').toUpperCase();
  const stageUpper = String(match.stage || '').toUpperCase();
  const teamARegion = String(match.teamA?.region || '').toUpperCase();
  const teamBRegion = String(match.teamB?.region || '').toUpperCase();

  return regionFilters.some((region) => {
    const target = region.toUpperCase();
    return (
      tournamentUpper.includes(target) ||
      stageUpper.includes(target) ||
      teamARegion.includes(target) ||
      teamBRegion.includes(target)
    );
  });
}

function dedupeCalendarMatches(matches: CalendarMatch[]) {
  const deduped = new Map<string, CalendarMatch>();
  for (const match of matches) {
    if (!match?.id) continue;
    deduped.set(match.id, match);
  }
  return [...deduped.values()];
}

async function loadMergedRegionCalendarMatches(regionFilters: string[]) {
  const config = await getSystemConfig();
  const targetYear = config.defaultYear;
  const mergedFirstStage =
    config.splits.find(
      (split) =>
        !isFirstStagePlayoffsStage(split) &&
        ((split.id || '').toLowerCase().includes('split 1') ||
          (split.name || '').includes('第一赛段') ||
          (split.mapping || '').includes('第一赛段')),
    ) || config.splits.find((split) => split.id === 'Split 1');
  const mergedFirstStageId = mergedFirstStage?.id || config.defaultSplit;

  const visibleStagesForRegion = (region: string) =>
    config.splits.filter((split) => {
      if (isFirstStagePlayoffsStage(split)) return false;
      if (!split.regions || split.regions.length === 0) return true;
      return split.regions.includes(region);
    });

  const regionMatches = await Promise.all(
    regionFilters.map(async (region) => {
      const visibleStages = visibleStagesForRegion(region);
      const uniqueCandidates = Array.from(
        new Map(
          visibleStages.map((stageConfig) => {
            const normalizedStageId = normalizeStageId(stageConfig.id, config.splits, mergedFirstStageId);
            return [
              normalizedStageId,
              {
                normalizedStageId,
                label: stageConfig.name || stageConfig.id,
              },
            ];
          }),
        ).values(),
      );

      const stageSummaries = await Promise.all(
        uniqueCandidates.map(async (candidate) =>
          summarizeStagePreference(
            candidate.normalizedStageId,
            candidate.label,
            (await getCachedScheduleMatches(region, targetYear, candidate.normalizedStageId)) as CalendarMatch[],
          ),
        ),
      );

      const preferredStageId =
        stageSummaries
          .filter((item) => item.totalCount > 0)
          .sort((left, right) =>
            comparePreferredEventCandidates(
              {
                label: left.label,
                latestTimestampMs: left.latestTimestampMs,
                hasUpcoming: left.hasUpcoming,
                totalCount: left.totalCount,
              },
              {
                label: right.label,
                latestTimestampMs: right.latestTimestampMs,
                hasUpcoming: right.hasUpcoming,
                totalCount: right.totalCount,
              },
            ),
          )[0]?.normalizedStageId || uniqueCandidates[0]?.normalizedStageId || mergedFirstStageId;

      return (await getCachedScheduleMatches(region, targetYear, preferredStageId)) as CalendarMatch[];
    }),
  );

  return dedupeCalendarMatches(regionMatches.flat()).filter((match) =>
    matchBelongsToAnyRegion(match, regionFilters),
  );
}

function matchesTeamFilter(match: CalendarMatch, teamFilter: string | null) {
  if (!teamFilter) return true;
  const target = normalizeFilterText(teamFilter);
  if (!target) return true;

  const candidates = [
    match.teamAId,
    match.teamBId,
    match.teamA?.id,
    match.teamB?.id,
    match.teamA?.name,
    match.teamB?.name,
    match.teamA?.shortName,
    match.teamB?.shortName,
  ];

  return candidates.some((value) => {
    const current = normalizeFilterText(value);
    return current && (current === target || current.includes(target) || target.includes(current));
  });
}

function filterMatchesByStatusAndWindow(matches: CalendarMatch[], statusFilter: string, days: number) {
  const now = new Date();
  const maxTime = now.getTime() + days * 24 * 60 * 60 * 1000;

  return matches.filter((match) => {
    const start = toDate(match.startTime);
    if (!start) return false;

    const finished = isFinishedStatus(match.status);
    const upperStatus = String(statusFilter || 'upcoming').trim().toLowerCase();

    if (upperStatus === 'finished') {
      return finished && start.getTime() <= now.getTime();
    }

    if (upperStatus === 'all') {
      return start.getTime() <= maxTime;
    }

    return !finished && start.getTime() >= now.getTime() - 6 * 60 * 60 * 1000 && start.getTime() <= maxTime;
  });
}

async function loadCalendarMatches(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const config = await getSystemConfig();

  const regionParam = (searchParams.get('region') || '').trim();
  const yearParam = (searchParams.get('year') || '').trim();
  const stageParam = (searchParams.get('stage') || '').trim();
  const region = regionParam || config.defaultRegion;
  const year = yearParam || config.defaultYear;
  const stage = stageParam || config.defaultSplit;
  const team = (searchParams.get('team') || '').trim() || null;
  const status = (searchParams.get('status') || 'upcoming').trim().toLowerCase();
  const days = parsePositiveInt(searchParams.get('days'), 120);
  const regionFilters = parseRegionList(searchParams.get('regions'));

  const useScheduleScope =
    searchParams.has('region') || searchParams.has('year') || searchParams.has('stage');

  let rawMatches: CalendarMatch[] = [];

  if (useScheduleScope) {
    rawMatches = (await getCachedScheduleMatches(region, year, stage)) as CalendarMatch[];
  } else if (regionFilters.length > 0) {
    rawMatches = await loadMergedRegionCalendarMatches(regionFilters);
  } else {
    const now = new Date();
    const futureWindow = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    rawMatches = await prisma.match.findMany({
      where: {
        startTime: {
          gte: new Date(now.getTime() - 6 * 60 * 60 * 1000),
          lte: futureWindow,
        },
      },
      orderBy: { startTime: 'asc' },
      include: {
        teamA: {
          select: { id: true, name: true, shortName: true, region: true },
        },
        teamB: {
          select: { id: true, name: true, shortName: true, region: true },
        },
      },
    });
  }

  const filtered = filterMatchesByStatusAndWindow(rawMatches, status, days)
    .filter((match) => matchBelongsToAnyRegion(match, regionFilters))
    .filter((match) => matchesTeamFilter(match, team))
    .sort((left, right) => {
      const leftTime = toDate(left.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = toDate(right.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

  return {
    region: useScheduleScope ? region : undefined,
    year: useScheduleScope ? year : undefined,
    stage: useScheduleScope ? stage : undefined,
    regions: regionFilters,
    team,
    matches: filtered,
  };
}

function createIcsBody(args: {
  matches: CalendarMatch[];
  calendarName: string;
  origin: string;
}) {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Codex//LOL Schedule Calendar//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(args.calendarName)}`),
    'X-WR-TIMEZONE:Asia/Shanghai',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ];

  for (const match of args.matches) {
    const start = toDate(match.startTime);
    if (!start) continue;

    const durationMinutes = estimateDurationMinutes(match.format);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const updatedAt = toDate(match.updatedAt) || start;
    const matchUrl = `${args.origin}/match/${match.id}`;

    lines.push('BEGIN:VEVENT');
    lines.push(foldIcsLine(`UID:lol-match-${match.id}@lol-data-calendar`));
    lines.push(`DTSTAMP:${toIcsUtcStamp(updatedAt)}`);
    lines.push(`LAST-MODIFIED:${toIcsUtcStamp(updatedAt)}`);
    lines.push(`DTSTART:${toIcsUtcStamp(start)}`);
    lines.push(`DTEND:${toIcsUtcStamp(end)}`);
    lines.push(foldIcsLine(`SUMMARY:${escapeIcsText(buildEventTitle(match))}`));
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(buildEventDescription(match, matchUrl))}`));
    lines.push(
      foldIcsLine(`LOCATION:${escapeIcsText(String(match.tournament || '').trim() || 'LOL赛事')}`),
    );
    lines.push(foldIcsLine(`URL:${matchUrl}`));
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export async function handleCalendarIcsRequest(
  request: NextRequest,
  options?: {
    defaultStatus?: string;
    defaultCalendarName?: string;
    defaultRegions?: string[];
  },
) {
  try {
    const url = new URL(request.url);
    if (!url.searchParams.get('status') && options?.defaultStatus) {
      url.searchParams.set('status', options.defaultStatus);
    }
    if (!url.searchParams.get('regions') && options?.defaultRegions?.length) {
      url.searchParams.set('regions', options.defaultRegions.join(','));
    }

    const forwardedRequest = new NextRequest(url, request);
    const { region, year, stage, regions, team, matches } = await loadCalendarMatches(forwardedRequest);
    const download = url.searchParams.get('download') === '1';
    const calendarName =
      options?.defaultCalendarName ||
      buildCalendarName({ region, year, stage, regions, team: team || undefined });
    const body = createIcsBody({
      matches,
      calendarName,
      origin: forwardedRequest.nextUrl.origin,
    });
    const fileName = `${calendarName}.ics`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': download ? 'application/octet-stream' : 'text/calendar; charset=utf-8',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || '生成赛程日历失败' },
      { status: 500 },
    );
  }
}
