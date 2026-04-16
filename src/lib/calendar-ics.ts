import { promises as fs } from 'fs';
import path from 'path';

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

type CalendarIncrementalExportState = Record<string, string[]>;
type RegionDateRangeMap = Record<
  string,
  {
    from: Date | null;
    to: Date | null;
  }
>;

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePositiveInt(raw: string | null, fallback: number) {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseDateRangeBoundary(raw: string | null | undefined, boundary: 'start' | 'end') {
  const text = String(raw || '').trim();
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;

  const year = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);
  const day = Number.parseInt(matched[3], 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const utcMs =
    boundary === 'start'
      ? Date.UTC(year, month - 1, day, -8, 0, 0, 0)
      : Date.UTC(year, month - 1, day + 1, -8, 0, 0, 0) - 1;

  return new Date(utcMs);
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

function parseRegionDateRangeMap(searchParams: URLSearchParams, regionFilters: string[]): RegionDateRangeMap {
  const regionMap: RegionDateRangeMap = {};

  for (const region of regionFilters) {
    const upperRegion = region.toUpperCase();
    const rawFrom = parseDateRangeBoundary(searchParams.get(`from_${upperRegion}`), 'start');
    const rawTo = parseDateRangeBoundary(searchParams.get(`to_${upperRegion}`), 'end');
    const normalizedFrom = rawFrom || (rawTo ? parseDateRangeBoundary(searchParams.get(`to_${upperRegion}`), 'start') : null);
    const normalizedTo = rawTo || (rawFrom ? parseDateRangeBoundary(searchParams.get(`from_${upperRegion}`), 'end') : null);

    if (normalizedFrom || normalizedTo) {
      regionMap[upperRegion] = {
        from: normalizedFrom,
        to: normalizedTo,
      };
    }
  }

  return regionMap;
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

function looksCorruptedDisplayText(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/\?{3,}/.test(text)) return true;
  return /馃|绗|鏆|寰风|鍏|璧|閫|鐐|鍒|璇|棰|鈥|锔|鉁|猬|柤|�/.test(text);
}

function getSafeText(value: string | null | undefined, fallback: string) {
  const text = String(value || '').trim();
  if (!text || looksCorruptedDisplayText(text)) return fallback;
  return text;
}

function getSafeTournamentLabel(match: CalendarMatch) {
  const rawTournament = String(match.tournament || '').trim();
  if (!rawTournament) return 'Unknown Tournament';
  if (!looksCorruptedDisplayText(rawTournament)) return rawTournament;

  const upper = rawTournament.toUpperCase();
  if (upper.includes('LPL')) return '2026 LPL Split 1';
  if (upper.includes('LCK')) return '2026 LCK Regular Season';
  return 'Unknown Tournament';
}

function getSafeStageLabel(match: CalendarMatch) {
  const rawStage = String(match.stage || '').trim();
  if (rawStage && !looksCorruptedDisplayText(rawStage)) return rawStage;

  return 'Regular Season';
}

function getSafeFormatLabel(match: CalendarMatch) {
  return getSafeText(String(match.format || '').trim().toUpperCase(), 'BO3');
}

function getSafeTeamDisplayName(value: string | null | undefined) {
  return getSafeText(value, 'TBD');
}

function buildEventTitle(match: CalendarMatch) {
  const teamA = getSafeTeamDisplayName(match.teamA?.shortName || match.teamA?.name);
  const teamB = getSafeTeamDisplayName(match.teamB?.shortName || match.teamB?.name);
  const tournament = getSafeTournamentLabel(match);
  return tournament ? `${tournament} | ${teamA} vs ${teamB}` : `${teamA} vs ${teamB}`;
}

function buildEventDescription(match: CalendarMatch, matchUrl: string) {
  const lines = [
    `Tournament: ${getSafeTournamentLabel(match)}`,
    `Stage: ${getSafeStageLabel(match)}`,
    `Format: ${getSafeFormatLabel(match)}`,
    `Status: ${String(match.status || '').trim().toUpperCase() || 'SCHEDULED'}`,
    `Link: ${matchUrl}`,
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

  const matchRegions = getMatchRegions(match);

  return regionFilters.some((region) => {
    const target = region.toUpperCase();
    return matchRegions.includes(target);
  });
}

function getMatchRegions(match: CalendarMatch) {
  const candidates = [
    String(match.tournament || '').toUpperCase(),
    String(match.stage || '').toUpperCase(),
    String(match.teamA?.region || '').toUpperCase(),
    String(match.teamB?.region || '').toUpperCase(),
  ];

  const regions = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes('LPL')) regions.add('LPL');
    if (candidate.includes('LCK')) regions.add('LCK');
    if (candidate.includes('LEC')) regions.add('LEC');
    if (candidate.includes('LJL')) regions.add('LJL');
    if (candidate.includes('LTA')) regions.add('LTA');
    if (candidate.includes('PCS')) regions.add('PCS');
    if (candidate.includes('VCS')) regions.add('VCS');
  }

  return [...regions];
}

function dedupeCalendarMatches(matches: CalendarMatch[]) {
  const deduped = new Map<string, CalendarMatch>();
  for (const match of matches) {
    if (!match?.id) continue;
    deduped.set(match.id, match);
  }
  return [...deduped.values()];
}

function getCalendarIncrementalStateFilePath() {
  return path.join(process.cwd(), 'data', 'calendar-export-state.json');
}

async function readCalendarIncrementalExportState() {
  try {
    const filePath = getCalendarIncrementalStateFilePath();
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as CalendarIncrementalExportState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCalendarIncrementalExportState(state: CalendarIncrementalExportState) {
  const filePath = getCalendarIncrementalStateFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function filterIncrementalCalendarMatches(matches: CalendarMatch[], stateKey: string) {
  const state = await readCalendarIncrementalExportState();
  const exportedIds = new Set(state[stateKey] || []);
  const incrementalMatches = matches.filter((match) => match.id && !exportedIds.has(match.id));

  if (incrementalMatches.length > 0) {
    state[stateKey] = [...exportedIds, ...incrementalMatches.map((match) => match.id)];
    await writeCalendarIncrementalExportState(state);
  }

  return incrementalMatches;
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

function filterMatchesByStatusAndWindow(
  matches: CalendarMatch[],
  statusFilter: string,
  days: number,
  dateRange?: {
    from: Date | null;
    to: Date | null;
  },
  regionDateRanges?: RegionDateRangeMap,
) {
  const now = new Date();
  const maxTime =
    dateRange?.to?.getTime() ?? now.getTime() + days * 24 * 60 * 60 * 1000;
  const minTime =
    dateRange?.from?.getTime() ?? now.getTime() - 6 * 60 * 60 * 1000;

  return matches.filter((match) => {
    const start = toDate(match.startTime);
    if (!start) return false;
    const startTime = start.getTime();
    const matchRegions = getMatchRegions(match);

    if (regionDateRanges && Object.keys(regionDateRanges).length > 0) {
      const applicableRanges = matchRegions
        .map((region) => regionDateRanges[region])
        .filter(Boolean);

      if (applicableRanges.length > 0) {
        const withinAnyRegionWindow = applicableRanges.some((range) => {
          const regionMin = range.from?.getTime() ?? minTime;
          const regionMax = range.to?.getTime() ?? maxTime;
          return startTime >= regionMin && startTime <= regionMax;
        });

        if (!withinAnyRegionWindow) return false;
      }
    }

    const finished = isFinishedStatus(match.status);
    const upperStatus = String(statusFilter || 'upcoming').trim().toLowerCase();

    if (upperStatus === 'finished') {
      return finished && startTime >= minTime && startTime <= maxTime;
    }

    if (upperStatus === 'all') {
      return startTime >= minTime && startTime <= maxTime;
    }

    return !finished && startTime >= minTime && startTime <= maxTime;
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
  const rawFromDate = parseDateRangeBoundary(searchParams.get('from'), 'start');
  const rawToDate = parseDateRangeBoundary(searchParams.get('to'), 'end');
  const fromDate = rawFromDate || (rawToDate ? parseDateRangeBoundary(searchParams.get('to'), 'start') : null);
  const toDateBoundary = rawToDate || (rawFromDate ? parseDateRangeBoundary(searchParams.get('from'), 'end') : null);
  const regionDateRanges = parseRegionDateRangeMap(searchParams, regionFilters);

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

  const filtered = filterMatchesByStatusAndWindow(rawMatches, status, days, {
    from: fromDate,
    to: toDateBoundary,
  }, regionDateRanges)
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
      foldIcsLine(`LOCATION:${escapeIcsText(getSafeTournamentLabel(match) || 'LOL赛事')}`),
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
    incrementalExportStateKey?: string;
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
    const exportMode = (url.searchParams.get('exportMode') || '').trim().toLowerCase();
    const hasExplicitDateRange = Boolean(url.searchParams.get('from') || url.searchParams.get('to'));
    const incrementalExportStateKey = options?.incrementalExportStateKey;
    const shouldUseIncrementalExport =
      download &&
      Boolean(incrementalExportStateKey) &&
      !hasExplicitDateRange &&
      exportMode !== 'full';
    const finalMatches = shouldUseIncrementalExport
      ? await filterIncrementalCalendarMatches(matches, incrementalExportStateKey!)
      : matches;
    const calendarName =
      options?.defaultCalendarName ||
      buildCalendarName({ region, year, stage, regions, team: team || undefined });
    const body = createIcsBody({
      matches: finalMatches,
      calendarName,
      origin: forwardedRequest.nextUrl.origin,
    });
    const fileName = `${calendarName}.ics`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': download ? 'application/octet-stream' : 'text/calendar; charset=utf-8',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': download ? 'no-store, no-cache, must-revalidate, max-age=0' : 'public, max-age=300, s-maxage=300',
        Pragma: download ? 'no-cache' : 'public',
        Expires: download ? '0' : '300',
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
