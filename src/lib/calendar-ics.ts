import { NextRequest, NextResponse } from 'next/server';

import { getSystemConfig } from '@/lib/config-service';
import { getCachedScheduleMatches } from '@/lib/data-cache';
import { prisma } from '@/lib/db';

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

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePositiveInt(raw: string | null, fallback: number) {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  team?: string;
}) {
  const parts = ['LOL赛程'];
  if (params.region) parts.push(params.region);
  if (params.year) parts.push(params.year);
  if (params.stage) parts.push(params.stage);
  if (params.team) parts.push(params.team);
  return parts.join('-');
}

function isFinishedStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toUpperCase();
  return normalized === 'FINISHED' || normalized === 'COMPLETED';
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

function filterMatchesByStatusAndWindow(
  matches: CalendarMatch[],
  statusFilter: string,
  days: number,
) {
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

  const useScheduleScope =
    searchParams.has('region') || searchParams.has('year') || searchParams.has('stage');

  let rawMatches: CalendarMatch[] = [];

  if (useScheduleScope) {
    rawMatches = (await getCachedScheduleMatches(region, year, stage)) as CalendarMatch[];
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
    lines.push(
      foldIcsLine(
        `DESCRIPTION:${escapeIcsText(buildEventDescription(match, matchUrl))}`,
      ),
    );
    lines.push(
      foldIcsLine(
        `LOCATION:${escapeIcsText(String(match.tournament || '').trim() || 'LOL赛事')}`,
      ),
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
  },
) {
  try {
    const url = new URL(request.url);
    if (!url.searchParams.get('status') && options?.defaultStatus) {
      url.searchParams.set('status', options.defaultStatus);
    }

    const forwardedRequest = new NextRequest(url, request);
    const { region, year, stage, team, matches } = await loadCalendarMatches(forwardedRequest);
    const download = url.searchParams.get('download') === '1';
    const calendarName =
      options?.defaultCalendarName ||
      buildCalendarName({ region, year, stage, team: team || undefined });
    const body = createIcsBody({
      matches,
      calendarName,
      origin: forwardedRequest.nextUrl.origin,
    });
    const fileName = `${calendarName}.ics`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || '生成赛程日历失败' },
      { status: 500 },
    );
  }
}
