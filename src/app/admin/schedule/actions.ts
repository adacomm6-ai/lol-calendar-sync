
'use server';

import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { prisma } from '@/lib/db';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { hasRuleOverlap, inferMatchRegion, normalizeGameVersionValue, normalizeRuleRegion, resolveGameVersionForMatch } from '@/lib/game-version';
import { analyzeScheduleScreenshotImage } from '@/lib/gemini';
import { normalizeTeamLookupKey } from '@/lib/team-alias';

export type MatchFormData = {
    id?: string;
    startTime: string; // ISO string from datetime-local
    teamAId: string | null;
    teamBId: string | null;
    status: string; // 'SCHEDULED', 'FINISHED', 'LIVE'
    format: string; // 'BO1', 'BO3', 'BO5'
    tournament: string; // '2026 LPL Split 1'
    stage: string; // 'Split 1', 'Playoffs'
    gameVersion?: string | null;
    // teamAParentMatchId?: string | null;
    // teamAParentType?: string | null;
    // teamBParentMatchId?: string | null;
    // teamBParentType?: string | null;
};

export type GameVersionRuleFormData = {
    id?: string;
    region: string;
    version: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
    note?: string | null;
};

export type BulkMatchUpdateData = {
    tournament?: string | null;
    stage?: string | null;
    format?: string | null;
    status?: string | null;
    gameVersion?: string | null;
    clearGameVersion?: boolean;
};

export type ScheduleSyncSource = 'SCOREGG' | 'LEAGUEPEDIA';

export type BpStageMappingHint = {
    stageName: string;
    stagePhase: string | null;
    count: number;
    updatedAt: string | null;
};

export type ScheduleSyncRequest = {
    source: ScheduleSyncSource;
    region?: string | null;
    scoreggTournamentId?: string | null;
    tournamentInput?: string | null;
    sourceStageName?: string | null;
    sourceStagePhase?: string | null;
    localTournament: string;
    localStage: string;
    defaultFormat?: string | null;
    upcomingOnly?: boolean;
};

export type ManualSchedulePlannerRequest = {
    region?: string | null;
    leagueLabel?: string | null;
    localTournament: string;
    localStage: string;
    defaultFormat?: string | null;
    defaultStatus?: string | null;
    gameVersion?: string | null;
    linesText: string;
};

export type ManualScheduleScreenshotRequest = {
    imageDataUrl: string;
    region?: string | null;
    formatHint?: string | null;
};

type ParsedManualScheduleEntry = {
    weekLabel: string | null;
    date: string;
    time: string;
    team1: string;
    team2: string;
    format: string;
    rawLine: string;
};

export type SearchMatchesOptions = {
    dateMode?: 'ON' | 'BEFORE' | 'AFTER';
    statusFilter?: 'RECENT' | 'ALL' | 'FINISHED';
};

const TEAM_LIGHT_SELECT = {
    id: true,
    name: true,
    shortName: true,
    region: true,
    logo: true,
};

function resolveDate(value?: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function parseFlexibleDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return null;

        if (/^\d{10,13}$/.test(text)) {
            const raw = Number(text);
            if (Number.isFinite(raw)) {
                const ts = text.length === 10 ? raw * 1000 : raw;
                const d = new Date(ts);
                return Number.isNaN(d.getTime()) ? null : d;
            }
        }

        const d = new Date(text);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
}

function toEpochMs(value: unknown): number | null {
    const d = parseFlexibleDate(value);
    return d ? d.getTime() : null;
}

function normalizeCompareText(value?: string | null): string {
    return String(value || '')
        .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s\-_()/]+/g, '');
}

function trimOptional(value?: string | null): string | null {
    const text = (value || '').trim();
    return text.length > 0 ? text : null;
}

function inferYearFromText(value?: string | null) {
    const match = String(value || '').match(/20\d{2}/);
    return match ? match[0] : String(new Date().getFullYear());
}

function normalizeManualDate(raw: string, fallbackYear: string) {
    const text = String(raw || '').trim().replace(/\//g, '-');
    const full = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (full) {
        return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`;
    }

    const short = text.match(/^(\d{1,2})-(\d{1,2})$/);
    if (short) {
        return `${fallbackYear}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`;
    }

    return '';
}

function normalizeManualTime(raw: string) {
    const text = String(raw || '').trim().replace('：', ':');
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '';
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function sanitizeManualTeamName(raw: string) {
    return String(raw || '')
        .replace(/\s+/g, ' ')
        .replace(/\bVS\b/gi, '')
        .replace(/^\|+|\|+$/g, '')
        .trim();
}

function parseManualScheduleLines(input: string, fallbackYear: string, fallbackFormat: string) {
    const lines = String(input || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const entries: ParsedManualScheduleEntry[] = [];
    let currentWeek: string | null = null;
    let currentDate = '';

    for (const line of lines) {
        const clean = line.replace(/[，]/g, ',').replace(/[｜]/g, '|').trim();
        if (!clean) continue;

        const weekOnly = clean.match(/^(week\s*\d+)$/i);
        if (weekOnly) {
            currentWeek = weekOnly[1].replace(/\s+/g, ' ').trim();
            continue;
        }

        const dateHeader = clean.match(/([12]\d{3}[/-]\d{2}[/-]\d{2})/);
        if (dateHeader && !/[|]/.test(clean) && !/\d{1,2}:\d{2}/.test(clean)) {
            currentDate = normalizeManualDate(dateHeader[1], fallbackYear);
            continue;
        }

        let matchedWeek = currentWeek;
        let date = '';
        let time = '';
        let team1 = '';
        let team2 = '';
        let format = fallbackFormat;

        const pipePattern = clean.match(/^(?:(Week\s*\d+)\s*\|\s*)?(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2})\s*\|\s*([0-2]?\d[:：]\d{2})\s*\|\s*(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(BO[135]))?$/i);
        const vsPattern = clean.match(/^(?:(Week\s*\d+)\s*\|?\s*)?(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2})\s+([0-2]?\d[:：]\d{2})\s+(.+?)\s+(?:vs|VS)\s+(.+?)(?:\s+(BO[135]))?$/);
        const timePipePattern = clean.match(/^([0-2]?\d[:：]\d{2})\s*\|\s*(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(BO[135]))?$/i);

        if (pipePattern) {
            matchedWeek = pipePattern[1] ? pipePattern[1].replace(/\s+/g, ' ').trim() : matchedWeek;
            date = normalizeManualDate(pipePattern[2], fallbackYear);
            time = normalizeManualTime(pipePattern[3]);
            team1 = sanitizeManualTeamName(pipePattern[4]);
            team2 = sanitizeManualTeamName(pipePattern[5]);
            format = String(pipePattern[6] || fallbackFormat).toUpperCase();
        } else if (vsPattern) {
            matchedWeek = vsPattern[1] ? vsPattern[1].replace(/\s+/g, ' ').trim() : matchedWeek;
            date = normalizeManualDate(vsPattern[2], fallbackYear);
            time = normalizeManualTime(vsPattern[3]);
            team1 = sanitizeManualTeamName(vsPattern[4]);
            team2 = sanitizeManualTeamName(vsPattern[5]);
            format = String(vsPattern[6] || fallbackFormat).toUpperCase();
        } else if (timePipePattern && currentDate) {
            date = currentDate;
            time = normalizeManualTime(timePipePattern[1]);
            team1 = sanitizeManualTeamName(timePipePattern[2]);
            team2 = sanitizeManualTeamName(timePipePattern[3]);
            format = String(timePipePattern[4] || fallbackFormat).toUpperCase();
        }

        if (!date || !time || !team1 || !team2) continue;

        entries.push({
            weekLabel: matchedWeek || null,
            date,
            time,
            team1,
            team2,
            format: format || fallbackFormat,
            rawLine: line,
        });
    }

    return entries;
}

async function buildTeamLookupIndex() {
    const teams = await prisma.team.findMany({
        select: { id: true, name: true, shortName: true, region: true },
        orderBy: [{ shortName: 'asc' }, { name: 'asc' }],
    });

    const exact = new Map<string, { id: string; displayName: string; region: string }>();
    const ordered = teams.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        region: team.region || '',
        displayName: team.shortName || team.name,
    }));

    for (const team of ordered) {
        const candidates = [team.shortName, team.name];
        for (const candidate of candidates) {
            const key = normalizeTeamLookupKey(candidate);
            if (key && !exact.has(key)) {
                exact.set(key, { id: team.id, displayName: team.displayName, region: team.region });
            }
        }
    }

    return { exact, ordered };
}

function resolveManualTeam(
    rawName: string,
    lookup: Awaited<ReturnType<typeof buildTeamLookupIndex>>,
) {
    const key = normalizeTeamLookupKey(rawName);
    if (!key) return null;

    const exactHit = lookup.exact.get(key);
    if (exactHit) return exactHit;

    return (
        lookup.ordered.find((team) => {
            const shortKey = normalizeTeamLookupKey(team.shortName);
            const nameKey = normalizeTeamLookupKey(team.name);
            return key === shortKey || key === nameKey || shortKey.includes(key) || nameKey.includes(key) || key.includes(shortKey) || key.includes(nameKey);
        }) || null
    );
}

function inferFormatFromBestOf(bestOf?: number | null, fallback?: string | null): string {
    const best = Number(bestOf || 0);
    if (best === 5) return 'BO5';
    if (best === 3) return 'BO3';
    if (best === 1) return 'BO1';

    const normalizedFallback = String(fallback || '').trim().toUpperCase();
    if (normalizedFallback === 'BO5' || normalizedFallback === 'BO3' || normalizedFallback === 'BO1') {
        return normalizedFallback;
    }

    return 'BO3';
}

function extractScoreggStageName(tournamentName?: string | null, regionHint?: string | null): string | null {
    const raw = String(tournamentName || '').trim();
    if (!raw) return null;

    const stageMatch = raw.match(
        /(第[一二三四五六七八九十\d]+赛段|Split\s*\d+|Stage\s*\d+|Spring|Summer|Winter|Season\s*Finals|First\s*Stand|MSI|Worlds?)/i,
    );
    if (stageMatch) return stageMatch[0].trim();

    if (/全球先锋赛|first\s*stand/i.test(raw)) return '全球先锋赛';
    if (/msi/i.test(raw)) return 'MSI';
    if (/worlds?|世界赛/i.test(raw)) return '世界赛';

    const cleaned = raw
        .replace(/^\d{4}\s*/g, '')
        .replace(/\bSeason\b/gi, '')
        .replace(/^(LPL|LCK|LEC|LCS|LTA|LCP|CBLOL|PCS|VCS|WORLDS|OTHER)\s*/i, '')
        .trim();

    if (cleaned) return cleaned;
    return trimOptional(regionHint) || raw;
}

function normalizeScoreggPhase(phase?: string | null): string | null {
    const raw = String(phase || '').trim();
    if (!raw) return null;

    if (/入围|play[\s-]*in/i.test(raw)) return '入围赛';
    if (/瑞士|swiss/i.test(raw)) return '瑞士轮';
    if (/小组|group/i.test(raw)) return '小组赛';
    if (/淘汰|playoffs?|knockout|quarter|semi|final/i.test(raw)) return '淘汰赛';
    if (/常规|regular/i.test(raw)) return '常规赛';
    if (/资格|qualifier/i.test(raw)) return '资格赛';

    return raw;
}

function matchOptionalStageFilter(value: string | null | undefined, filter: string | null | undefined): boolean {
    const target = normalizeCompareText(value);
    const expected = normalizeCompareText(filter);
    if (!expected) return true;
    if (!target) return false;
    return target === expected || target.includes(expected) || expected.includes(target);
}

function getBpStatsDbPath() {
    return path.win32.normalize('D:/BP/server/data/bp_stats.db');
}

function normalizeBpLeague(region?: string | null): string {
    const raw = String(region || '').trim().toUpperCase();
    if (raw === 'LPL' || raw === 'LCK' || raw === 'OTHER') return raw;
    if (raw === 'WORLDS') return 'WORLDS';
    return raw || 'LPL';
}

export async function getBpStageMappings(region?: string | null) {
    try {
        const dbPath = getBpStatsDbPath();
        await fs.access(dbPath);
        const db = new DatabaseSync(dbPath, { readonly: true });
        const league = normalizeBpLeague(region);
        const rows = db.prepare(`
            SELECT
                stage_name AS stageName,
                stage_phase AS stagePhase,
                COUNT(*) AS count,
                MAX(updated_at) AS updatedAt
            FROM series_metadata
            WHERE (? = 'WORLDS' AND league NOT IN ('LPL', 'LCK', 'OTHER'))
               OR league = ?
            GROUP BY stage_name, stage_phase
            ORDER BY datetime(MAX(updated_at)) DESC, COUNT(*) DESC, stage_name ASC
            LIMIT 12
        `).all(league, league) as Array<{ stageName: string | null; stagePhase: string | null; count: number; updatedAt: string | null }>;
        db.close();

        const mappings = rows
            .map((row) => ({
                stageName: trimOptional(row.stageName) || '',
                stagePhase: trimOptional(row.stagePhase),
                count: Number(row.count || 0),
                updatedAt: row.updatedAt || null,
            }))
            .filter((row) => row.stageName);

        return { success: true, mappings };
    } catch (e: any) {
        return { success: false, error: e?.message || '读取 BP 阶段映射失败', mappings: [] as BpStageMappingHint[] };
    }
}

function toBeijingDateKey(date: Date) {
    const ms = date.getTime();
    const beijing = new Date(ms + 8 * 60 * 60 * 1000);
    return beijing.toISOString().slice(0, 10);
}

function duplicateTimeRange(date: Date) {
    const center = new Date(date);
    center.setSeconds(0, 0);
    const start = new Date(center.getTime() - 3 * 60 * 60 * 1000);
    const end = new Date(center.getTime() + 3 * 60 * 60 * 1000);
    return { start, end };
}

async function findDuplicateMatchByNaturalKey(params: {
    startTime?: Date | null;
    teamAId?: string | null;
    teamBId?: string | null;
    format?: string | null;
    excludeId?: string;
}) {
    const { startTime, teamAId, teamBId, format, excludeId } = params;
    if (!startTime || !teamAId || !teamBId) return null;

    const { start, end } = duplicateTimeRange(startTime);
    const targetDay = toBeijingDateKey(startTime);
    const targetFormat = String(format || '').trim().toUpperCase();

    const candidates = await prisma.match.findMany({
        where: {
            ...(excludeId ? { id: { not: excludeId } } : {}),
            startTime: { gte: start, lte: end },
            OR: [
                { teamAId, teamBId },
                { teamAId: teamBId, teamBId: teamAId },
            ],
        },
        include: {
            teamA: { select: TEAM_LIGHT_SELECT },
            teamB: { select: TEAM_LIGHT_SELECT },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'asc' }],
    });

    return (
        candidates.find((m) => {
            if (!m.startTime) return false;
            const sameDay = toBeijingDateKey(new Date(m.startTime)) === targetDay;
            if (!sameDay) return false;
            if (!targetFormat) return true;
            return String(m.format || '').trim().toUpperCase() === targetFormat;
        }) || null
    );
}

async function revalidateMatchViews(matchId?: string) {
    revalidatePath('/schedule');
    revalidatePath('/admin/schedule');
    revalidatePath('/');
    if (matchId) revalidatePath(`/match/${matchId}`);
}

async function resolveVersionForPayload(params: {
    startTime?: Date | null;
    tournament?: string;
    teamARegion?: string | null;
    teamBRegion?: string | null;
    regionHint?: string | null;
}): Promise<string | null> {
    if (!params.startTime) return null;
    return await resolveGameVersionForMatch({
        startTime: params.startTime,
        tournament: params.tournament,
        teamARegion: params.teamARegion,
        teamBRegion: params.teamBRegion,
        regionHint: params.regionHint,
    });
}

async function backfillMissingGameVersionsInternal(region?: string) {
    const normalizedRegion = region ? normalizeRuleRegion(region) : null;

    const where: Record<string, any> = {
        gameVersion: null,
        startTime: { not: null },
    };

    if (normalizedRegion && normalizedRegion !== 'GLOBAL') {
        where.OR = [
            { tournament: { contains: normalizedRegion } },
            { teamA: { region: { contains: normalizedRegion } } },
            { teamB: { region: { contains: normalizedRegion } } },
        ];
    }

    const matches = await prisma.match.findMany({
        where,
        include: {
            teamA: { select: { region: true } },
            teamB: { select: { region: true } },
        },
        orderBy: { startTime: 'asc' },
    });

    let updated = 0;

    for (const match of matches) {
        const version = await resolveVersionForPayload({
            startTime: match.startTime,
            tournament: match.tournament,
            teamARegion: match.teamA?.region || null,
            teamBRegion: match.teamB?.region || null,
            regionHint: normalizedRegion,
        });

        if (!version) continue;

        await prisma.match.update({
            where: { id: match.id },
            data: { gameVersion: version },
        });
        updated++;
    }

    return updated;
}

export async function getGameVersionRules(region?: string) {
    try {
        const normalized = region && region !== 'ALL' ? normalizeRuleRegion(region) : null;
        const rules = await prisma.gameVersionRule.findMany({
            where: normalized ? { region: normalized } : undefined,
            orderBy: [{ region: 'asc' }, { effectiveFrom: 'desc' }],
        });
        return {
            success: true,
            rules: rules.map((rule) => ({
                ...rule,
                version: normalizeGameVersionValue(rule.version, rule.effectiveFrom),
            })),
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function upsertGameVersionRule(data: GameVersionRuleFormData) {
    try {
        const region = normalizeRuleRegion(data.region);
        const effectiveFrom = resolveDate(data.effectiveFrom);
        const effectiveTo = resolveDate(data.effectiveTo || null);
        const version = normalizeGameVersionValue((data.version || '').trim(), effectiveFrom);

        if (!version) return { success: false, error: 'Version is required.' };
        if (!effectiveFrom) return { success: false, error: 'Invalid effectiveFrom datetime.' };
        if (effectiveTo && effectiveTo < effectiveFrom) {
            return { success: false, error: 'effectiveTo must be later than effectiveFrom.' };
        }

        const rulesInRegion = await prisma.gameVersionRule.findMany({
            where: data.id
                ? {
                    region,
                    NOT: { id: data.id },
                }
                : { region },
            orderBy: { effectiveFrom: 'asc' },
        });

        const conflict = rulesInRegion.find((rule) =>
            hasRuleOverlap({
                incomingFrom: effectiveFrom,
                incomingTo: effectiveTo,
                existingFrom: rule.effectiveFrom,
                existingTo: rule.effectiveTo,
            })
        );

        if (conflict) {
            return {
                success: false,
                error: `Rule overlap detected with ${conflict.version} (${conflict.effectiveFrom.toISOString()} - ${conflict.effectiveTo ? conflict.effectiveTo.toISOString() : 'OPEN'})`,
            };
        }

        if (data.id) {
            await prisma.gameVersionRule.update({
                where: { id: data.id },
                data: {
                    region,
                    version,
                    effectiveFrom,
                    effectiveTo,
                    note: trimOptional(data.note),
                },
            });
        } else {
            await prisma.gameVersionRule.create({
                data: {
                    region,
                    version,
                    effectiveFrom,
                    effectiveTo,
                    note: trimOptional(data.note),
                },
            });
        }

        const backfilled = await backfillMissingGameVersionsInternal(region);

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');

        return { success: true, backfilled };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteGameVersionRule(id: string) {
    try {
        await prisma.gameVersionRule.delete({ where: { id } });
        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function backfillMissingGameVersions(region?: string) {
    try {
        const backfilled = await backfillMissingGameVersionsInternal(region);
        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');
        return { success: true, backfilled };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateMatchGameVersion(matchId: string, gameVersion?: string | null) {
    try {
        if (!matchId) return { success: false, error: 'Missing matchId.' };

        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                teamA: { select: { region: true } },
                teamB: { select: { region: true } },
            },
        });

        if (!match) return { success: false, error: 'Match not found.' };

        const manualValueRaw = trimOptional(gameVersion);
        const manualValue = manualValueRaw
            ? normalizeGameVersionValue(manualValueRaw, match.startTime || null)
            : null;
        const resolvedValue = manualValue || (await resolveVersionForPayload({
            startTime: match.startTime,
            tournament: match.tournament,
            teamARegion: match.teamA?.region || null,
            teamBRegion: match.teamB?.region || null,
        }));

        await prisma.match.update({
            where: { id: matchId },
            data: { gameVersion: resolvedValue },
        });

        await revalidateMatchViews(matchId);
        return { success: true, gameVersion: resolvedValue };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateMatchStage(matchId: string, stage: string) {
    try {
        if (!matchId) return { success: false, error: 'Missing matchId.' };
        const stageValue = (stage || '').trim();
        if (!stageValue) return { success: false, error: 'Stage is required.' };

        await prisma.match.update({
            where: { id: matchId },
            data: { stage: stageValue },
        });

        await revalidateMatchViews(matchId);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function bulkUpdateMatches(matchIds: string[], updates: BulkMatchUpdateData) {
    try {
        const ids = (matchIds || []).filter(Boolean);
        if (ids.length === 0) return { success: false, error: 'No matches selected.' };

        const payload: Record<string, any> = {};
        const tournament = trimOptional(updates.tournament);
        const stage = trimOptional(updates.stage);
        const format = trimOptional(updates.format);
        const status = trimOptional(updates.status);
        const gameVersion = trimOptional(updates.gameVersion);

        if (tournament) payload.tournament = tournament;
        if (stage) payload.stage = stage;
        if (format) payload.format = format.toUpperCase();
        if (status) payload.status = status.toUpperCase();
        if (updates.clearGameVersion) {
            payload.gameVersion = null;
        } else if (gameVersion) {
            payload.gameVersion = normalizeGameVersionValue(gameVersion, null);
        }

        if (Object.keys(payload).length === 0) {
            return { success: false, error: 'No update fields provided.' };
        }

        const result = await prisma.match.updateMany({
            where: { id: { in: ids } },
            data: payload,
        });

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');
        revalidatePath('/');

        return { success: true, count: result.count };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getTeamsInput() {
    try {
        const teams = await prisma.team.findMany({
            orderBy: { shortName: 'asc' },
            select: { id: true, name: true, shortName: true, region: true }
        });
        return { success: true, teams };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

const WORLD_REGION_KEYWORDS = ['MSI', 'Worlds', 'WORLDS', 'World', '全球先锋赛', '世界赛', '全球总决赛', 'All-Star'];
const OTHER_REGION_KEYWORDS = ['OTHER', 'LEC', 'LCS', 'LTA', 'CBLOL', 'LJL', 'LLA', 'LCP', 'PCS', 'VCS', 'TCL', '其它赛区', '其他赛区'];

function textIncludesAnyKeyword(text: string, keywords: string[]) {
    const upper = text.toUpperCase();
    return keywords.some((keyword) => {
        const raw = String(keyword || '').trim();
        if (!raw) return false;
        const hasCjk = /[\u4e00-\u9fff]/.test(raw);
        return hasCjk ? text.includes(raw) : upper.includes(raw.toUpperCase());
    });
}

function matchBelongsToRegion(match: any, regionNorm: string) {
    const teamARegionRaw = String(match.teamA?.region || '').trim();
    const teamBRegionRaw = String(match.teamB?.region || '').trim();
    const teamARegion = teamARegionRaw.toUpperCase();
    const teamBRegion = teamBRegionRaw.toUpperCase();

    const textRaw = `${String(match.tournament || '')} ${String(match.stage || '')}`;
    const textUpper = textRaw.toUpperCase();

    const isWorldLike =
        textIncludesAnyKeyword(textRaw, WORLD_REGION_KEYWORDS) ||
        teamARegion.includes('WORLD') ||
        teamBRegion.includes('WORLD') ||
        teamARegionRaw.includes('世界赛') ||
        teamBRegionRaw.includes('世界赛');

    const isOtherLike =
        textIncludesAnyKeyword(textRaw, OTHER_REGION_KEYWORDS) ||
        teamARegion.includes('OTHER') ||
        teamBRegion.includes('OTHER') ||
        teamARegionRaw.includes('其它赛区') ||
        teamARegionRaw.includes('其他赛区') ||
        teamBRegionRaw.includes('其它赛区') ||
        teamBRegionRaw.includes('其他赛区');

    if (regionNorm === 'LPL' || regionNorm === 'LCK') {
        return teamARegion.includes(regionNorm) || teamBRegion.includes(regionNorm) || textUpper.includes(regionNorm);
    }

    if (regionNorm === 'WORLDS' || regionNorm === 'WORLD') {
        return isWorldLike;
    }

    if (regionNorm === 'OTHER' || regionNorm === '其它赛区' || regionNorm === '其他赛区') {
        return isOtherLike && !isWorldLike;
    }

    if (!regionNorm) return true;

    return teamARegion.includes(regionNorm) || teamBRegion.includes(regionNorm) || textUpper.includes(regionNorm);
}

export async function getRegionMappedTeams(region: string) {
    try {
        const regionNorm = String(region || '').trim().toUpperCase();

        const rawMatches = await prisma.match.findMany({
            select: {
                teamAId: true,
                teamBId: true,
                tournament: true,
                stage: true,
                teamA: { select: { region: true } },
                teamB: { select: { region: true } },
            },
            orderBy: { startTime: 'desc' },
            take: 8000,
        });

        const matches = rawMatches.filter((m) => matchBelongsToRegion(m, regionNorm));

        const teamIds = Array.from(new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]).filter((id): id is string => !!id)));
        const tournaments = Array.from(new Set(matches.map((m) => m.tournament).filter(Boolean)));

        return { success: true, teamIds, tournaments };
    } catch (e: any) {
        return { success: false, error: e.message, teamIds: [], tournaments: [] };
    }
}
export async function getTournaments() {
    try {
        // 1. Get tournaments that already have matches
        const existing = await prisma.match.groupBy({
            by: ['tournament'],
            orderBy: { tournament: 'asc' },
        });
        const existingNames = existing.map(t => t.tournament);

        // 2. Load system config to generate potential tournament names
        const { getSystemConfig } = await import('@/lib/config-service');
        const config = await getSystemConfig();

        const generatedNames: string[] = [];
        const currentYear = config.defaultYear || new Date().getFullYear().toString();

        // Generate potential names based on splits and regions
        config.splits.forEach(split => {
            const mapping = split.mapping;
            if (!mapping) return;

            if (split.regions && split.regions.length > 0) {
                // If regions are specified, only generate region-prefixed names
                split.regions.forEach(regId => {
                    // Standard: "2026 LPL缂佹鍏涚粩瀵告導濞戞瑯鍞?
                    generatedNames.push(`${currentYear} ${regId}${mapping}`);
                });
            } else {
                // For global splits (no regions), generate global names
                // e.g. "2026 MSI", "2026 Worlds"
                if (mapping.length > 2) { // Only if it's descriptive enough
                    generatedNames.push(`${currentYear} ${mapping}`);
                }
                generatedNames.push(mapping);
            }
        });

        // Combine and deduplicate
        const allTournaments = Array.from(new Set([...existingNames, ...generatedNames])).sort();

        return { success: true, tournaments: allTournaments };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getTournamentMatches(tournament: string) {
    noStore(); // Prevents Next.js from caching this server action result
    try {
        const matches = await prisma.match.findMany({
            where: { tournament },
            include: {
                teamA: { select: TEAM_LIGHT_SELECT },
                teamB: { select: TEAM_LIGHT_SELECT },
            },
            orderBy: { startTime: 'asc' }
            // No limit here because we need the full bracket
        });
        return { success: true, matches };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function searchMatches(date?: string, region?: string, options?: SearchMatchesOptions) {
    try {
        const where: Record<string, any> = {};
        const andClauses: Record<string, any>[] = [];

        const dateMode = String(options?.dateMode || 'ON').toUpperCase();
        const statusFilter = String(options?.statusFilter || 'RECENT').toUpperCase();

        const hasDate = Boolean(date && date !== 'ALL');
        let start: Date | null = null;
        let end: Date | null = null;

        if (hasDate) {
            start = resolveDate(`${date}T00:00:00`);
            if (start) {
                end = new Date(start);
                end.setDate(end.getDate() + 1);
            }
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (region) {
            andClauses.push({
                OR: [
                    { tournament: { contains: region } },
                    { teamA: { region: { contains: region } } },
                    { teamB: { region: { contains: region } } },
                ],
            });
        }

        if (statusFilter === 'FINISHED') {
            andClauses.push({ status: { in: ['FINISHED', 'COMPLETED'] } });
        } else if (statusFilter === 'RECENT') {
            andClauses.push({ status: { notIn: ['FINISHED', 'COMPLETED'] } });
        }

        if (andClauses.length > 0) {
            where.AND = andClauses;
        }

        const hasExplicitFilter = hasDate || Boolean(region) || statusFilter !== 'RECENT';

        const matches = await prisma.match.findMany({
            where,
            include: {
                teamA: { select: TEAM_LIGHT_SELECT },
                teamB: { select: TEAM_LIGHT_SELECT },
            },
            orderBy: { startTime: 'asc' },
            take: hasExplicitFilter ? 3000 : 800,
        });

        const filteredByDate = matches.filter((match) => {
            const epoch = toEpochMs((match as any).startTime);
            if (epoch === null) return false;

            if (hasDate && start && end) {
                if (dateMode === 'BEFORE') return epoch < end.getTime();
                if (dateMode === 'AFTER') return epoch >= start.getTime();
                return epoch >= start.getTime() && epoch < end.getTime();
            }

            return epoch >= yesterday.getTime();
        });

        const serialized = filteredByDate
            .sort((a, b) => {
                const left = toEpochMs((a as any).startTime) ?? Number.MAX_SAFE_INTEGER;
                const right = toEpochMs((b as any).startTime) ?? Number.MAX_SAFE_INTEGER;
                return left - right;
            })
            .map((m) => ({ ...m }));

        return { success: true, matches: serialized };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
export async function upsertMatch(data: MatchFormData) {
    try {
        const startTime = data.startTime ? new Date(data.startTime) : null;

        const teamA = data.teamAId
            ? await prisma.team.findUnique({ where: { id: data.teamAId }, select: { region: true } })
            : null;
        const teamB = data.teamBId
            ? await prisma.team.findUnique({ where: { id: data.teamBId }, select: { region: true } })
            : null;

        const manualVersionRaw = trimOptional(data.gameVersion);
        const manualVersion = manualVersionRaw
            ? normalizeGameVersionValue(manualVersionRaw, startTime || null)
            : null;
        const autoVersion = manualVersion
            ? null
            : await resolveVersionForPayload({
                startTime,
                tournament: data.tournament,
                teamARegion: teamA?.region || null,
                teamBRegion: teamB?.region || null,
            });

        const payload = {
            startTime: startTime || undefined,
            teamAId: data.teamAId || null,
            teamBId: data.teamBId || null,
            status: data.status,
            format: data.format,
            tournament: data.tournament,
            stage: data.stage,
            gameVersion: manualVersion || autoVersion || null,
        };

        const duplicate = !data.id
            ? await findDuplicateMatchByNaturalKey({
                  startTime,
                  teamAId: data.teamAId,
                  teamBId: data.teamBId,
                  format: data.format,
              })
            : null;

        const targetId = data.id || duplicate?.id || null;

        const savedMatch = targetId
            ? await prisma.match.update({
                  where: { id: targetId },
                  data: payload,
                  include: {
                      teamA: { select: TEAM_LIGHT_SELECT },
                      teamB: { select: TEAM_LIGHT_SELECT },
                  },
              })
            : await prisma.match.create({
                  data: payload,
                  include: {
                      teamA: { select: TEAM_LIGHT_SELECT },
                      teamB: { select: TEAM_LIGHT_SELECT },
                  },
              });

        await revalidateMatchViews(savedMatch.id);
        return {
            success: true,
            match: savedMatch,
            warning: duplicate ? 'Duplicate detected and merged into existing match.' : undefined,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteMatch(id: string) {
    try {
        await prisma.$transaction([
            prisma.manualOddsRecord.deleteMany({ where: { matchId: id } }),
            prisma.odds.deleteMany({ where: { matchId: id } }),
            prisma.comment.deleteMany({ where: { matchId: id } }),
            prisma.game.deleteMany({ where: { matchId: id } }),
            prisma.match.delete({ where: { id } }),
        ]);

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function importMatches(data: string, region: string, defaultStage: string = 'Regular Season') {
    try {
        let matchesToInsert: Array<{
            startTime: string;
            teamAId: string;
            teamBId: string;
            status: string;
            format: string;
            tournament: string;
            stage: string;
        }> = [];

        try {
            const json = JSON.parse(data);
            if (Array.isArray(json)) {
                matchesToInsert = json.map((item) => ({
                    ...item,
                    stage: (item.stage || defaultStage || 'Regular Season').trim(),
                }));
            }
        } catch (e) {
            const lines = data.split('\n').filter(l => l.trim());

            const teams = await prisma.team.findMany({ select: { id: true, name: true, shortName: true } });
            const teamMap = new Map();
            teams.forEach(t => {
                if (t.shortName) teamMap.set(t.shortName.toLowerCase(), t.id);
                teamMap.set(t.name.toLowerCase(), t.id);
            });

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                    const dateStr = parts[0];
                    const timeStr = parts[1];
                    let teamAStr = parts[2];
                    let teamBStr = parts[parts.length - 1];

                    if (parts.includes('vs')) {
                        const vsIndex = parts.indexOf('vs');
                        teamAStr = parts.slice(2, vsIndex).join(' ');
                        teamBStr = parts.slice(vsIndex + 1).join(' ');
                    }

                    const teamAId = teamMap.get(teamAStr.toLowerCase());
                    const teamBId = teamMap.get(teamBStr.toLowerCase());

                    if (teamAId && teamBId) {
                        const isoString = `${dateStr}T${timeStr}:00+08:00`;

                        matchesToInsert.push({
                            startTime: isoString,
                            teamAId,
                            teamBId,
                            status: 'SCHEDULED',
                            format: 'BO3',
                            tournament: `2026 ${region} Split 1`,
                            stage: (defaultStage || 'Regular Season').trim()
                        });
                    }
                }
            }
        }

        if (matchesToInsert.length === 0) {
            return { success: false, error: 'No valid matches found to import.' };
        }

        let created = 0;
        let skipped = 0;

        for (const m of matchesToInsert) {
            const startAt = new Date(m.startTime);
            const duplicate = await findDuplicateMatchByNaturalKey({
                startTime: startAt,
                teamAId: m.teamAId,
                teamBId: m.teamBId,
                format: m.format,
            });
            if (duplicate) {
                skipped += 1;
                continue;
            }

            const autoVersion = await resolveVersionForPayload({
                startTime: startAt,
                tournament: m.tournament,
                regionHint: region,
            });

            await prisma.match.create({
                data: {
                    startTime: startAt,
                    teamAId: m.teamAId,
                    teamBId: m.teamBId,
                    status: m.status,
                    format: m.format,
                    tournament: m.tournament,
                    stage: m.stage,
                    gameVersion: autoVersion || null,
                }
            });
            created += 1;
        }

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');
        return {
            success: true,
            count: created,
            skippedCount: skipped,
            message: skipped > 0 ? `Imported ${created}, skipped duplicate ${skipped}.` : undefined,
        };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

import { fetchTournamentMatches, resolveTournament, fetchPlayoffResults } from '@/lib/leaguepedia';

export async function importFromWiki(input: string) {
    try {
        const tournamentName = await resolveTournament(input);
        const wikiMatches = await fetchTournamentMatches(tournamentName);
        if (wikiMatches.length === 0) {
            return { success: false, error: `No future matches found for tournament '${tournamentName}' (Input: ${input}).` };
        }

        const teams = await prisma.team.findMany({ select: { id: true, name: true, shortName: true } });
        const teamMap = new Map();
        teams.forEach(t => {
            if (t.shortName) teamMap.set(t.shortName.toLowerCase(), t.id);
            teamMap.set(t.name.toLowerCase(), t.id);
        });

        let created = 0;
        const skipped: string[] = [];

        for (const m of wikiMatches) {
            const teamAId = teamMap.get(m.team1.toLowerCase());
            const teamBId = teamMap.get(m.team2.toLowerCase());

            if (!teamAId || !teamBId) {
                skipped.push(`Unknown Team: ${m.team1} or ${m.team2}`);
                continue;
            }

            const isoString = m.date.replace(' ', 'T') + 'Z';
            const startAt = new Date(isoString);
            const duplicate = await findDuplicateMatchByNaturalKey({
                startTime: startAt,
                teamAId,
                teamBId,
                format: 'BO3',
            });

            if (duplicate) {
                skipped.push(`${m.team1} vs ${m.team2} @ ${m.date}`);
                continue;
            }

            const autoVersion = await resolveVersionForPayload({
                startTime: startAt,
                tournament: m.tournament,
            });

            await prisma.match.create({
                data: {
                    startTime: startAt,
                    teamAId,
                    teamBId,
                    status: 'SCHEDULED',
                    format: 'BO3',
                    tournament: m.tournament,
                    stage: 'Regular Season',
                    gameVersion: autoVersion || null,
                }
            });

            created += 1;
        }

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');

        return {
            success: true,
            count: created,
            skippedCount: skipped.length,
            message: `Imported ${created} matches. Skipped ${skipped.length}.`
        };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

type SyncSourceMatch = {
    externalSource: 'scoregg' | 'leaguepedia';
    externalMatchId: string;
    sourceMatchId: string;
    sourceTournament: string;
    sourceStageName: string | null;
    sourceStagePhase: string | null;
    team1: string;
    team2: string;
    startTime: Date;
    format: string;
    regionHint: string | null;
};

type PreparedSyncMatch = SyncSourceMatch & {
    teamAId: string;
    teamBId: string;
};

async function readLocalScoreggCache(url: string) {
    const tournamentMatch = url.match(/\/tr\/(\d+)\.json$/i);
    const roundMatch = url.match(/\/tr_round\/([^/]+)\.json$/i);
    const candidates: string[] = [];

    if (tournamentMatch) {
        const id = tournamentMatch[1];
        candidates.push(
            path.win32.normalize(`D:/BP/scoregg_tr_${id}_new.json`),
            path.win32.normalize(`D:/BP/scoregg_tr_${id}.json`),
        );
    }

    if (roundMatch) {
        const id = roundMatch[1].replace(/^p_/i, '');
        candidates.push(path.win32.normalize(`D:/BP/scoregg_tr_round_${id}.json`));
    }

    for (const candidate of candidates) {
        try {
            const raw = await fs.readFile(candidate, 'utf8');
            return JSON.parse(raw);
        } catch {
            // ignore local cache miss and continue fallback
        }
    }

    return null;
}

async function fetchScheduleSyncJson(url: string) {
    const localCached = await readLocalScoreggCache(url);
    if (localCached !== null) {
        return localCached;
    }

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'LoLDataLocalSync/1.0',
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${url}`);
    }

    return await res.json();
}

function getScoreggRoundTasks(rows: any[]) {
    const tasks: { roundApiId: string; roundName: string; childName: string }[] = [];

    for (const row of Array.isArray(rows) ? rows : []) {
        const roundName = String(row?.name || '').trim();
        const roundId = String(row?.roundID || '').trim();
        const children = Array.isArray(row?.round_son) ? row.round_son : [];

        if (children.length > 0) {
            for (const child of children) {
                const childId = String(child?.id || '').trim();
                if (!childId) continue;
                tasks.push({
                    roundApiId: childId,
                    roundName,
                    childName: String(child?.name || '').trim(),
                });
            }
            continue;
        }

        if (roundId) {
            tasks.push({ roundApiId: `p_${roundId}`, roundName, childName: '' });
        }
    }

    return tasks;
}

function inferScoreggRegion(tournamentId?: string | null, regionHint?: string | null): string | null {
    const id = String(tournamentId || '').trim();
    if (id === '922') return 'LPL';
    if (id === '927') return 'LCK';
    return trimOptional(regionHint) || 'OTHER';
}

async function fetchScoreggSyncMatches(request: ScheduleSyncRequest): Promise<SyncSourceMatch[]> {
    const tournamentId = trimOptional(request.scoreggTournamentId);
    if (!tournamentId) {
        throw new Error('请填写 BP / ScoreGG 赛事 ID');
    }

    const regionHint = inferScoreggRegion(tournamentId, request.region);
    const tournamentRows = await fetchScheduleSyncJson(`https://img.scoregg.com/tr/${tournamentId}.json`);
    const roundTasks = getScoreggRoundTasks(Array.isArray(tournamentRows) ? tournamentRows : []);
    const upcomingOnly = request.upcomingOnly !== false;
    const nowMs = Date.now();
    const deduped = new Map<string, SyncSourceMatch>();

    for (const task of roundTasks) {
        const roundRows = await fetchScheduleSyncJson(`https://img.scoregg.com/tr_round/${task.roundApiId}.json`);
        for (const row of Array.isArray(roundRows) ? roundRows : []) {
            const sourceMatchId = String(row?.matchID || '').trim();
            if (!sourceMatchId) continue;

            const startTime = parseFlexibleDate(row?.start_time ? Number(row.start_time) * 1000 : `${String(row?.match_date || '').trim()} ${String(row?.match_time || '').trim()}`);
            if (!startTime) continue;
            if (upcomingOnly && startTime.getTime() < nowMs) continue;

            const team1 = trimOptional(row?.team_short_name_a) || trimOptional(row?.team_name_a) || trimOptional(row?.team_a_name) || '';
            const team2 = trimOptional(row?.team_short_name_b) || trimOptional(row?.team_name_b) || trimOptional(row?.team_b_name) || '';
            if (!team1 || !team2 || /^TBD$/i.test(team1) || /^TBD$/i.test(team2)) continue;

            const sourceTournament = trimOptional(row?.tournament_name) || `ScoreGG ${tournamentId}`;
            const sourceStageName = extractScoreggStageName(sourceTournament, regionHint);
            const sourceStagePhase = normalizeScoreggPhase(task.roundName || task.childName || null);
            if (!matchOptionalStageFilter(sourceStageName, request.sourceStageName)) continue;
            if (!matchOptionalStageFilter(sourceStagePhase, request.sourceStagePhase)) continue;

            const format = inferFormatFromBestOf(Number(row?.game_count || 0), request.defaultFormat);
            const externalMatchId = `scoregg:${tournamentId}:${sourceMatchId}`;
            deduped.set(externalMatchId, {
                externalSource: 'scoregg',
                externalMatchId,
                sourceMatchId,
                sourceTournament,
                sourceStageName,
                sourceStagePhase,
                team1,
                team2,
                startTime,
                format,
                regionHint,
            });
        }
    }

    return [...deduped.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

async function fetchLeaguepediaSyncMatches(request: ScheduleSyncRequest): Promise<SyncSourceMatch[]> {
    const tournamentInput = trimOptional(request.tournamentInput);
    if (!tournamentInput) {
        throw new Error('请填写 Leaguepedia 赛事名称或 URL');
    }

    const tournamentName = await resolveTournament(tournamentInput);
    const rows = await fetchTournamentMatches(tournamentName);
    const deduped = new Map<string, SyncSourceMatch>();
    const upcomingOnly = request.upcomingOnly !== false;
    const nowMs = Date.now();

    for (const row of rows) {
        const isoString = String(row.date || '').replace(' ', 'T') + 'Z';
        const startTime = parseFlexibleDate(isoString);
        if (!startTime) continue;
        if (upcomingOnly && startTime.getTime() < nowMs) continue;

        const team1 = trimOptional(row.team1) || '';
        const team2 = trimOptional(row.team2) || '';
        if (!team1 || !team2 || /^TBD$/i.test(team1) || /^TBD$/i.test(team2)) continue;

        const sourceMatchId = trimOptional(row.matchId) || `${team1}-${team2}-${startTime.getTime()}`;
        const externalMatchId = `leaguepedia:${sourceMatchId}`;
        deduped.set(externalMatchId, {
            externalSource: 'leaguepedia',
            externalMatchId,
            sourceMatchId,
            sourceTournament: trimOptional(row.tournament) || tournamentName,
            sourceStageName: null,
            sourceStagePhase: null,
            team1,
            team2,
            startTime,
            format: inferFormatFromBestOf(null, request.defaultFormat),
            regionHint: trimOptional(request.region),
        });
    }

    return [...deduped.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

function inferScheduleSyncYear(request: ScheduleSyncRequest): string {
    const joined = [request.localTournament, request.tournamentInput, request.sourceStageName]
        .map((value) => String(value || ''))
        .join(' ');
    const yearMatch = joined.match(/20\d{2}/);
    return yearMatch ? yearMatch[0] : String(new Date().getFullYear());
}

function inferLeaguepediaFallbackInput(request: ScheduleSyncRequest): string | null {
    const explicit = trimOptional(request.tournamentInput);
    if (explicit) return explicit;
    return null;
}

async function loadSyncSourceMatches(request: ScheduleSyncRequest): Promise<{
    matches: SyncSourceMatch[];
    sourceLabel: string;
}> {
    if (request.source === 'LEAGUEPEDIA') {
        return {
            matches: await fetchLeaguepediaSyncMatches(request),
            sourceLabel: 'Leaguepedia',
        };
    }

    const scoreggMatches = await fetchScoreggSyncMatches(request);
    if (scoreggMatches.length > 0) {
        return {
            matches: scoreggMatches,
            sourceLabel: 'BP / ScoreGG',
        };
    }

    const fallbackTournamentInput = inferLeaguepediaFallbackInput(request);
    if (!fallbackTournamentInput) {
        return {
            matches: scoreggMatches,
            sourceLabel: 'BP / ScoreGG',
        };
    }

    const leaguepediaMatches = await fetchLeaguepediaSyncMatches({
        ...request,
        source: 'LEAGUEPEDIA',
        tournamentInput: fallbackTournamentInput,
    });

    return {
        matches: leaguepediaMatches,
        sourceLabel: 'Leaguepedia fallback',
    };
}

async function buildScheduleSyncPlan(request: ScheduleSyncRequest) {
    noStore();

    const localTournament = trimOptional(request.localTournament);
    const localStage = trimOptional(request.localStage);
    if (!localTournament) {
        throw new Error('请填写本地赛事名称');
    }
    if (!localStage) {
        throw new Error('请填写本地阶段');
    }

    const syncSourceResult = await loadSyncSourceMatches(request);
    const sourceMatches = syncSourceResult.matches;
    const teams = await prisma.team.findMany({
        select: { id: true, name: true, shortName: true, region: true },
    });

    const teamMap = new Map<string, { id: string; name: string; shortName: string | null; region: string | null }>();
    for (const team of teams) {
        teamMap.set(normalizeCompareText(team.name), team);
        if (team.shortName) teamMap.set(normalizeCompareText(team.shortName), team);
    }

    const externalIds = sourceMatches.map((match) => match.externalMatchId).filter(Boolean);
    const existingExternalMatches = externalIds.length > 0
        ? await prisma.match.findMany({
              where: { externalMatchId: { in: externalIds } },
              select: { id: true, externalMatchId: true },
          })
        : [];
    const existingExternalIdSet = new Set(existingExternalMatches.map((match) => match.externalMatchId).filter(Boolean));

    const creatable: PreparedSyncMatch[] = [];
    const skipped: Array<{ reason: string; match: SyncSourceMatch }> = [];
    const unresolved: Array<{ reason: string; match: SyncSourceMatch }> = [];

    for (const match of sourceMatches) {
        const teamA = teamMap.get(normalizeCompareText(match.team1));
        const teamB = teamMap.get(normalizeCompareText(match.team2));

        if (!teamA || !teamB) {
            unresolved.push({
                reason: `队伍未匹配：${teamA ? '' : match.team1}${!teamA && !teamB ? ' / ' : ''}${teamB ? '' : match.team2}`,
                match,
            });
            continue;
        }

        if (existingExternalIdSet.has(match.externalMatchId)) {
            skipped.push({ reason: '来源比赛已存在', match });
            continue;
        }

        const duplicate = await findDuplicateMatchByNaturalKey({
            startTime: match.startTime,
            teamAId: teamA.id,
            teamBId: teamB.id,
            format: match.format,
        });
        if (duplicate) {
            skipped.push({ reason: '本地已存在相同赛程', match });
            continue;
        }

        creatable.push({
            ...match,
            teamAId: teamA.id,
            teamBId: teamB.id,
        });
    }

    return {
        sourceLabel: syncSourceResult.sourceLabel,
        request: {
            ...request,
            localTournament,
            localStage,
            defaultFormat: inferFormatFromBestOf(null, request.defaultFormat),
        },
        sourceCount: sourceMatches.length,
        creatable,
        skipped,
        unresolved,
    };
}

export async function previewScheduleSync(request: ScheduleSyncRequest) {
    try {
        const plan = await buildScheduleSyncPlan(request);
        return {
            success: true,
            sourceCount: plan.sourceCount,
            creatableCount: plan.creatable.length,
            skippedCount: plan.skipped.length,
            unresolvedCount: plan.unresolved.length,
            sourceLabel: plan.sourceLabel,
            preview: plan.creatable.slice(0, 12).map((match) => ({
                startTime: match.startTime.toISOString(),
                matchup: `${match.team1} vs ${match.team2}`,
                format: match.format,
                sourceStageName: match.sourceStageName,
                sourceStagePhase: match.sourceStagePhase,
            })),
            skippedPreview: plan.skipped.slice(0, 8).map((item) => ({
                reason: item.reason,
                matchup: `${item.match.team1} vs ${item.match.team2}`,
            })),
            unresolvedPreview: plan.unresolved.slice(0, 8).map((item) => ({
                reason: item.reason,
                matchup: `${item.match.team1} vs ${item.match.team2}`,
            })),
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function applyScheduleSync(request: ScheduleSyncRequest) {
    try {
        const plan = await buildScheduleSyncPlan(request);
        let created = 0;

        for (const match of plan.creatable) {
            const autoVersion = await resolveVersionForPayload({
                startTime: match.startTime,
                tournament: plan.request.localTournament,
                regionHint: match.regionHint || plan.request.region || null,
            });

            await prisma.match.create({
                data: {
                    startTime: match.startTime,
                    teamAId: match.teamAId,
                    teamBId: match.teamBId,
                    status: 'SCHEDULED',
                    format: match.format,
                    tournament: plan.request.localTournament,
                    stage: plan.request.localStage,
                    gameVersion: autoVersion || null,
                    externalSource: match.externalSource,
                    externalMatchId: match.externalMatchId,
                },
            });
            created += 1;
        }

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');

        return {
            success: true,
            created,
            skippedCount: plan.skipped.length,
            unresolvedCount: plan.unresolved.length,
            message: `已新增 ${created} 场；跳过 ${plan.skipped.length} 场；未匹配 ${plan.unresolved.length} 场。`,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

async function buildManualSchedulePlan(request: ManualSchedulePlannerRequest) {
    noStore();

    const localTournament = trimOptional(request.localTournament);
    const localStage = trimOptional(request.localStage);
    const defaultFormat = String(request.defaultFormat || 'BO3').toUpperCase();
    const defaultStatus = String(request.defaultStatus || 'SCHEDULED').toUpperCase();
    const fallbackYear = inferYearFromText(`${request.localTournament || ''} ${request.leagueLabel || ''}`);

    if (!localTournament) {
        throw new Error('请填写赛事名称');
    }
    if (!localStage) {
        throw new Error('请选择阶段');
    }

    const parsedEntries = parseManualScheduleLines(request.linesText, fallbackYear, defaultFormat);
    if (parsedEntries.length === 0) {
        throw new Error('没有识别到可导入的赛程行');
    }

    const lookup = await buildTeamLookupIndex();
    const creatable: Array<{
        weekLabel: string | null;
        date: string;
        time: string;
        format: string;
        team1: string;
        team2: string;
        teamAId: string;
        teamBId: string;
        teamADisplay: string;
        teamBDisplay: string;
        startTime: Date;
    }> = [];
    const skipped: Array<{ reason: string; entry: ParsedManualScheduleEntry }> = [];
    const unresolved: Array<{ reason: string; entry: ParsedManualScheduleEntry }> = [];
    const batchKeys = new Set<string>();

    for (const entry of parsedEntries) {
        const teamA = resolveManualTeam(entry.team1, lookup);
        const teamB = resolveManualTeam(entry.team2, lookup);

        if (!teamA || !teamB) {
            unresolved.push({
                reason: !teamA && !teamB ? '两边队伍都未匹配' : !teamA ? `未匹配 ${entry.team1}` : `未匹配 ${entry.team2}`,
                entry,
            });
            continue;
        }

        const startTime = new Date(`${entry.date}T${entry.time}:00+08:00`);
        if (Number.isNaN(startTime.getTime())) {
            unresolved.push({ reason: '时间格式无效', entry });
            continue;
        }

        const duplicate = await findDuplicateMatchByNaturalKey({
            startTime,
            teamAId: teamA.id,
            teamBId: teamB.id,
            format: entry.format || defaultFormat,
        });

        if (duplicate) {
            skipped.push({ reason: '数据库中已存在', entry });
            continue;
        }

        const batchKey = `${entry.date}__${entry.time}__${[teamA.id, teamB.id].sort().join('__')}__${entry.format || defaultFormat}`;
        if (batchKeys.has(batchKey)) {
            skipped.push({ reason: '本次导入文本里重复', entry });
            continue;
        }
        batchKeys.add(batchKey);

        creatable.push({
            weekLabel: entry.weekLabel,
            date: entry.date,
            time: entry.time,
            format: entry.format || defaultFormat,
            team1: entry.team1,
            team2: entry.team2,
            teamAId: teamA.id,
            teamBId: teamB.id,
            teamADisplay: teamA.displayName,
            teamBDisplay: teamB.displayName,
            startTime,
        });
    }

    const preview = creatable.map((item, index) => ({
        index: index + 1,
        weekLabel: item.weekLabel,
        date: item.date,
        time: item.time,
        format: item.format,
        matchup: `${item.teamADisplay} VS ${item.teamBDisplay}`,
    }));

    return {
        request: {
            ...request,
            localTournament,
            localStage,
            defaultFormat,
            defaultStatus,
        },
        sourceCount: parsedEntries.length,
        creatable,
        skipped,
        unresolved,
        preview,
    };
}

export async function previewManualSchedulePlan(request: ManualSchedulePlannerRequest) {
    try {
        const plan = await buildManualSchedulePlan(request);
        return {
            success: true,
            sourceCount: plan.sourceCount,
            creatableCount: plan.creatable.length,
            skippedCount: plan.skipped.length,
            unresolvedCount: plan.unresolved.length,
            preview: plan.preview,
            skippedPreview: plan.skipped.slice(0, 10).map((item) => ({
                reason: item.reason,
                rawLine: item.entry.rawLine,
            })),
            unresolvedPreview: plan.unresolved.slice(0, 10).map((item) => ({
                reason: item.reason,
                rawLine: item.entry.rawLine,
            })),
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function applyManualSchedulePlan(request: ManualSchedulePlannerRequest) {
    try {
        const plan = await buildManualSchedulePlan(request);
        const manualVersionRaw = trimOptional(request.gameVersion);
        const createdIds: string[] = [];

        for (const item of plan.creatable) {
            const version = manualVersionRaw
                ? normalizeGameVersionValue(manualVersionRaw, item.startTime)
                : await resolveVersionForPayload({
                      startTime: item.startTime,
                      tournament: plan.request.localTournament,
                      regionHint: plan.request.region || null,
                  });

            const match = await prisma.match.create({
                data: {
                    startTime: item.startTime,
                    teamAId: item.teamAId,
                    teamBId: item.teamBId,
                    status: plan.request.defaultStatus,
                    format: item.format,
                    tournament: plan.request.localTournament,
                    stage: plan.request.localStage,
                    gameVersion: version || null,
                },
                select: { id: true },
            });
            createdIds.push(match.id);
        }

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');
        revalidatePath('/');

        return {
            success: true,
            created: createdIds.length,
            skippedCount: plan.skipped.length,
            unresolvedCount: plan.unresolved.length,
            message: `已整理 ${createdIds.length} 场；跳过 ${plan.skipped.length} 场；未匹配 ${plan.unresolved.length} 场。`,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function extractScheduleScreenshotText(request: ManualScheduleScreenshotRequest) {
    try {
        const dataUrl = String(request.imageDataUrl || '').trim();
        if (!dataUrl.includes(',')) {
            return { success: false, error: '截图数据无效' };
        }

        const base64 = dataUrl.split(',')[1];
        const imageBuffer = Buffer.from(base64, 'base64');
        const teams = await prisma.team.findMany({
            select: { name: true, shortName: true },
            orderBy: { shortName: 'asc' },
        });
        const teamHints = teams.flatMap((team) => [team.shortName, team.name]).filter(Boolean) as string[];
        const result = await analyzeScheduleScreenshotImage(imageBuffer, {
            region: request.region || null,
            formatHint: request.formatHint || null,
            teamHints,
        });

        if (!result.success) {
            return { success: false, error: result.error || '截图识别失败' };
        }

        const entries = result.data.entries || [];
        const linesText = entries
            .map((item) => {
                const weekPrefix = item.week ? `${item.week} | ` : '';
                const formatSuffix = item.format ? ` | ${item.format}` : '';
                return `${weekPrefix}${item.date} | ${item.time} | ${item.team1} | ${item.team2}${formatSuffix}`;
            })
            .join('\n');

        return {
            success: true,
            linesText,
            count: entries.length,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function generatePlayoffBracket(
    tournament: string,
    nodes: {
        startTime: string,
        stage: string,
        format: string,
        teamAId: string | null,
        teamBId: string | null
    }[]
) {
    try {
        if (!nodes || nodes.length === 0) {
            return { success: false, error: 'No matches provided.' };
        }

        let created = 0;
        let skipped = 0;

        for (const n of nodes) {
            const startAt = new Date(n.startTime);
            const duplicate = await findDuplicateMatchByNaturalKey({
                startTime: startAt,
                teamAId: n.teamAId,
                teamBId: n.teamBId,
                format: n.format || 'BO5',
            });
            if (duplicate) {
                skipped += 1;
                continue;
            }

            const autoVersion = await resolveVersionForPayload({
                startTime: startAt,
                tournament,
            });

            await prisma.match.create({
                data: {
                    startTime: startAt,
                    teamAId: n.teamAId,
                    teamBId: n.teamBId,
                    status: 'SCHEDULED',
                    format: n.format || 'BO5',
                    tournament,
                    stage: n.stage,
                    gameVersion: autoVersion || null,
                }
            });
            created += 1;
        }

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');
        return {
            success: true,
            count: created,
            skippedCount: skipped,
            message: skipped > 0 ? `Created ${created}, skipped duplicate ${skipped}.` : undefined,
        };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * 婵烇絾蓱閸楁垹鎸у☉娆愵仭闁煎疇妫勯幃鎾愁潰閵夘垳绐楅柨鐔虹オeaguepedia 闁瑰嘲顦ぐ鍥ь啅閹绘帞鏆氶悹褎绋掗弳鐔煎箲椤曞棛绀夐柟绋款樀濡诧箓鏁撻懞銉︼級闁哄牏鍠嶇粭宀勫嫉椤掆偓濠€瀵告導濞戞埃鏌ら柛鏍х秺閸樸倝鏁?
 * - 闁告牕缍婇崢銈夊礆閹殿喗鐣遍柡鍫墮濠€?TBD 闁革妇鍎ら?闁跨喕妫勫ú鏍ㄧ箙椤愶附袝濞寸厧绉查埀顑胯兌缁劑寮稿┃搴撳亾娴ｅ搫笑闁?
 * - 鐎圭寮跺﹢浣衡偓鐟版湰閺嗭綁寮悧鍫濈ウ闁汇劌瀚┃鈧柨鐔告灮閹烽鎹勭€圭姷绠? * - LP 闁哄牆顦徊楣冨嫉椤掆偓濠€瀛樼▔瀹ュ懐鎽犻柛锔哄妿濞堟垿宕烽悜姗嗗仹 闁跨喎鈧喎娈伴柛鏂诲妽閺???
 *
 * @param lpTournamentInput - Leaguepedia 閻犙勭◥缁ㄣ劑宕ュ鍥?URL闁挎稑鐗婇弳鐔煎箲椤旇姤闄嶆繝褎鍔х槐?
 * @param localTournament - 闁哄牜鍓欏﹢瀵告導濞戞鐨戦柛姘Ф琚ㄩ柨娑樼墕鐏忣噣鏌婂鍥ㄧ獥闁哄秴娴勭槐婵嬫晸?26 LPL缂佹鍏涚粩瀵告導濞戞瑯鍞?闁挎稑顧€缁辨繈鎮惧▎鎴旀晞闁告帗鐟ㄩ崵婊堝礉閵娿劎妲曢柨?
 */
export async function refreshPlayoffBracket(lpTournamentInput: string, localTournament?: string) {
    try {
        const tournamentName = await resolveTournament(lpTournamentInput);
        console.log(`[Playoff Sync] LP tournament resolved: ${tournamentName}`);

        const lpResults = await fetchPlayoffResults(tournamentName);
        if (lpResults.length === 0) {
            return { success: false, error: `Leaguepedia 闁哄牜浜ｇ换鎴﹀炊閻愮増宕插ù锝嗘礀閸戯紕鈧懓鐭佺粋宀勫极閻楀牆绁? ${tournamentName}` };
        }
        console.log(`[Playoff Sync] Got ${lpResults.length} completed series from LP`);

        // 闁哄瀚紓鎾绘⒓閻斿墎绀婇柨鐔告灮閹风īD 闁哄嫮濮撮惃?
        const allTeams = await prisma.team.findMany({ select: { id: true, name: true, shortName: true } });
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const resolveTeamId = (name: string): string | null => {
            const n = norm(name);
            let t = allTeams.find(x => norm(x.shortName || '') === n);
            if (!t) t = allTeams.find(x => norm(x.name) === n);
            // 婵☆垽绱曠涵锕傚礌瑜版帒甯抽柨娑欑摢Top Esports` 闁跨喓绂嘥ES`, `JD Gaming` 闁跨喓绂嘕DG` 闁?
            if (!t) t = allTeams.find(x => norm(x.name).includes(n) || n.includes(norm(x.name)));
            return t?.id || null;
        };
        // 根据 tournament 名称推断本地赛事过滤词
        let localTournamentFilter = localTournament?.trim() || '';
        if (!localTournamentFilter) {
            const leagueMatch = tournamentName.match(/(LPL|LCK|LEC|LCS)/i);
            if (leagueMatch) {
                localTournamentFilter = leagueMatch[1].toUpperCase();
            }
        }

        // 闁哄被鍎撮妤呭嫉椤掆偓濠€瀵告導濞戞埃鏌ら柨娑欐皑閺併倝骞嬮柨瀣樄閻庤鐭花锛勨偓鐟版湰閺嗭絿鎸у☉妤冪殤闁告艾绉撮崹顖滃垝閸撗€鈧﹢宕犺ぐ鎺戝赋闁挎稑鑻幆渚€宕氬▎鎰樆闁艰鲸妫佺粋宀勫冀閸ヮ亞妲?婵烇絾蓱閸楁垿鏁撶徊鐚糰ge 閺夆晛娲﹂幎?
        const playoffStageKeywords = ['Bracket', 'Semifinal', 'Final', 'Lower', 'Upper', 'Grand', 'Playoff', 'Playoffs', 'Play-In'];
        const isExactTournament = localTournament && localTournament.trim().length > 5;

        const localMatches = await prisma.match.findMany({
            where: isExactTournament
                ? { tournament: localTournament!.trim() }
                : localTournamentFilter
                    ? {
                        tournament: { contains: localTournamentFilter },
                        OR: playoffStageKeywords.map(kw => ({ stage: { contains: kw } }))
                    }
                    : { OR: playoffStageKeywords.map(kw => ({ stage: { contains: kw } })) },
            include: { teamA: true, teamB: true },
            orderBy: { startTime: 'asc' }
        });

        console.log(`[Playoff Sync] Found ${localMatches.length} local matches under "${localTournamentFilter}"`);

        let updated = 0;
        let created = 0;
        let skipped = 0;
        const details: string[] = [];

        // 闁告瑯鍨辩粔椋庢嫻閸︻厽鐣遍柡鍫墮濠€鎾捶閻戞﹩鍋ч柛鎿冨灡濠€浼存晬閸繂鐖遍梺鏉跨Т閹绮旀繝姘彑闂侇剙鐏濋崢銈夋煂瀹ュ拋妲婚柨?
        const availableLocal = [...localMatches];

        for (const lp of lpResults) {
            const teamAId = resolveTeamId(lp.team1);
            const teamBId = resolveTeamId(lp.team2);
            const winnerId = resolveTeamId(lp.winner);

            if (!teamAId || !teamBId) {
                details.push(`闁宠法濯寸粭?闂傚啰鍠嶇槐鐐哄嫉椤忓懎顥濋柨?{lp.team1} / ${lp.team2}`);
                continue;
            }

            const lpDate = lp.date.replace(' ', 'T') + 'Z';
            const lpTime = new Date(lpDate).getTime();

            // 缂佹稒鐗滈弳?1闁挎稒宀稿Σ锔藉瀹ュ懎鐖遍柨鐔告灮閹烽攱瀵煎Ο鍝勫弗闁告牕缍婇崢?TBD/闁哄牜浜滈悾顒傛導濞戞粠鍞剁憸鐗堟穿缁辨繈宕楅懜娈垮仹闁告牕缍婇崢銈咁啅閸欏绠掗梻鍐枍缁辩偤鎯冮崟顒佸紦閻庣懓鐭佺粋宀€鎷嬮弶璺ㄧЭ
            const lpPair = [teamAId, teamBId].sort();
            let matchIdx = -1;

            // 1a: 闁稿繐鐗婃竟姗€寮垫径灞剧ゲ闁告艾鐭傚Σ锔藉瀹ュ嫮绋婚柡鍫簻閻ｎ剛鎸у☉姘暠闁挎稑鐗撳〒鍓佹啺娴ｈ绾柡鍌涘婵悂鏁撻崐鐔峰姀闁哄倸婀卞▓???
            matchIdx = availableLocal.findIndex(m => {
                if (!m.teamAId || !m.teamBId) return false;
                if (m.status === 'FINISHED' && m.winnerId) return false;
                const localPair = [m.teamAId, m.teamBId].sort();
                return localPair[0] === lpPair[0] && localPair[1] === lpPair[1];
            });
            // 1b: 若 1a 未命中，再用时间窗口匹配 TBD 记录
            if (matchIdx < 0) {
                matchIdx = availableLocal.findIndex(m => {
                    if (!m.teamAId || !m.teamBId) return false;
                    const localPair = [m.teamAId, m.teamBId].sort();
                    return localPair[0] === lpPair[0] && localPair[1] === lpPair[1];
                });
            }

            // 缂佹稒鐗滈弳?2闁挎稒鐡朆D 缂佸苯鎼敍鎾诲礌瑜版帒甯?闁跨喕濮ゆ竟姗€宕氶悧鍫燂級闁哄牏鍠愬〒鍫曟焽閺勫繒绠柨鐔虹ゴBD 缂佸苯鎼敍?
            if (matchIdx < 0) {
                let bestIdx = -1;
                let bestDiff = Infinity;
                availableLocal.forEach((m, i) => {
                    // 闁告牕缍婇崢銈夊级閳ュ弶顐介柨娑欎亢閸わ妇浜搁幋婊咁伇濞戞搩浜Σ锔藉瀹ュ嫯绀嬬紒宀€灏ㄧ槐姗矪D闁挎稑顧€缁辨繃绋夐弮鍌毿﹂柟顑挎鐠?SCHEDULED
                    if ((!m.teamAId || !m.teamBId) && m.status === 'SCHEDULED' && m.startTime) {
                        const diff = Math.abs(new Date(m.startTime).getTime() - lpTime);
                        if (diff < bestDiff) {
                            bestDiff = diff;
                            bestIdx = i;
                        }
                    }
                });
                // 闁规亽鍎辫ぐ?30 濠㈠灈鏅涢崬鎾儍閸曨剚浠橀梺顓熸缁?TBD
                if (bestIdx >= 0 && bestDiff < 30 * 24 * 60 * 60 * 1000) {
                    matchIdx = bestIdx;
                }
            }

            if (matchIdx >= 0) {
                const localMatch = availableLocal[matchIdx];

                // 鐎圭寮跺﹢浣衡偓鐟版湰閺嗭綁寮悧鍫濈ウ闁挎稑婀桰NISHED + 闁告瑥鏈弻鐔兼⒓閻斿墎绀?+ 闁艰櫕绮嶉弻鐔兼晬婢跺棗鏅?閻犲搫鐤囩换?
                if (localMatch.status === 'FINISHED' && localMatch.teamAId && localMatch.teamBId && localMatch.winnerId) {
                    skipped++;
                    availableLocal.splice(matchIdx, 1);
                    continue;
                }

                const updatedStartTime = new Date(lpDate);
                const resolvedRegion = inferMatchRegion({
                    tournament: localMatch.tournament || localTournamentFilter || tournamentName,
                    teamARegion: localMatch.teamA?.region || null,
                    teamBRegion: localMatch.teamB?.region || null,
                });
                const nextVersion = localMatch.gameVersion || await resolveVersionForPayload({
                    startTime: updatedStartTime,
                    tournament: localMatch.tournament || localTournamentFilter || tournamentName,
                    regionHint: resolvedRegion,
                    teamARegion: localMatch.teamA?.region || null,
                    teamBRegion: localMatch.teamB?.region || null,
                });

                await prisma.match.update({
                    where: { id: localMatch.id },
                    data: {
                        teamAId,
                        teamBId,
                        winnerId: winnerId || undefined,
                        status: 'FINISHED',
                        startTime: updatedStartTime,
                        gameVersion: nextVersion || null,
                    }
                });
                updated++;
                details.push(`闁跨喕濮ゅú??? ${lp.team1} vs ${lp.team2} (闁?{lp.winner}) 闁跨喓鍏歭ocalMatch.stage}`);
                availableLocal.splice(matchIdx, 1);
            } else {
                // 闁哄牜鍓欏﹢鎾籍閻樻彃鐖遍柨鐔告灮閹风兘宕氬☉妯肩处闁哄倹濯界粋宀勬晸?
                // 闁跨喓绁狿 rawMatchId 濞戞搩鍘借ぐ渚€鏁撶徊鐚糰ge 闁硅绻楅崼?
                const stageFromLp = lp.rawMatchId
                    .replace(/^.*?Playoffs_/, '')
                    .replace(/_/g, ' ');

                const targetTournament = localTournamentFilter || tournamentName;

                const createdStartTime = new Date(lpDate);
                const duplicate = await findDuplicateMatchByNaturalKey({
                    startTime: createdStartTime,
                    teamAId,
                    teamBId,
                    format: lp.gameCount <= 3 ? 'BO3' : 'BO5',
                });

                if (duplicate) {
                    skipped++;
                    details.push(`skip duplicate create: ${lp.team1} vs ${lp.team2} (${stageFromLp})`);
                    continue;
                }

                const autoVersion = await resolveVersionForPayload({
                    startTime: createdStartTime,
                    tournament: targetTournament,
                    regionHint: localTournamentFilter || null,
                });

                await prisma.match.create({
                    data: {
                        teamAId,
                        teamBId,
                        winnerId: winnerId || undefined,
                        status: 'FINISHED',
                        format: lp.gameCount <= 3 ? 'BO3' : 'BO5',
                        tournament: targetTournament,
                        stage: `Playoffs ${stageFromLp}`,
                        startTime: createdStartTime,
                        gameVersion: autoVersion || null,
                    }
                });
                created++;
                details.push(`created from LP: ${lp.team1} vs ${lp.team2} (${stageFromLp})`);
            }
        }

        revalidatePath('/schedule');
        revalidatePath('/admin/schedule');

        return {
            success: true,
            updated,
            created,
            skipped,
            total: lpResults.length,
            details,
            message: `Sync completed: updated ${updated}, created ${created}, skipped ${skipped} (already complete).`
        };

    } catch (e: any) {
        console.error('[Playoff Sync] Error:', e);
        return { success: false, error: e.message };
    }
}































