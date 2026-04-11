'use server';

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { revalidatePath } from 'next/cache';

import { normalizeStoredOdds, type StoredOddsResult } from '@/lib/odds-history';

const MANUAL_ODDS_WRITE_RETRY_COUNT = 15;
const MANUAL_ODDS_WRITE_RETRY_DELAY_MS = 250;
const MANUAL_ODDS_BUSY_TIMEOUT_MS = 5_000;
const MANUAL_ODDS_RANK_SYNC_GUARD_MS = 15 * 60 * 1000;

type ManualOddsDbRecord = {
    id: string;
    matchId: string;
    gameNumber: number;
    type: string;
    side: string;
    threshold: number | null;
    selectionLabel: string;
    detail: string;
    createdAt: string | Date;
    resultValue: number | null;
    settledStatus: string | null;
    oddsValue: number | null;
    oppositeOddsValue: number | null;
    provider: string | null;
    actualThreshold: number | null;
    actualSelectionLabel: string | null;
    actualOddsRaw: number | null;
    actualOddsNormalized: number | null;
    actualOddsFormat: string | null;
    actualProvider: string | null;
    actualStakeAmount: number | null;
    teamAId: string | null;
    teamBId: string | null;
    teamAName: string | null;
    teamBName: string | null;
    teamARegion: string | null;
    teamBRegion: string | null;
    matchStartTime: string | Date | null;
    tournament: string | null;
    stage: string | null;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLocalDatabasePath(): string {
    const raw = String(process.env.DATABASE_URL || '').trim();
    const projectRoot = process.cwd();
    const prismaDbPath = path.join(projectRoot, 'prisma', 'dev.db');
    const rootDbPath = path.join(projectRoot, 'dev.db');
    const workspaceRootPrismaDbPath = path.resolve(projectRoot, '..', '..', 'prisma', 'dev.db');

    const candidates: string[] = [];

    if (raw.toLowerCase().startsWith('file:')) {
        const rawPath = raw.slice('file:'.length);
        if (rawPath) {
            candidates.push(path.isAbsolute(rawPath) ? rawPath : path.resolve(projectRoot, rawPath));
        }
    }

    if (projectRoot.includes('__recovery_work__')) {
        candidates.push(workspaceRootPrismaDbPath);
    }

    candidates.push(prismaDbPath, rootDbPath);

    for (const candidate of candidates) {
        try {
            const normalized = path.normalize(candidate);
            const stat = fsSync.statSync(normalized);
            if (stat.size > 0) return normalized;
        } catch {
            // Try next path.
        }
    }

    return path.normalize(prismaDbPath);
}

function getManualOddsRankSyncGuardPath() {
    return path.join(process.cwd(), 'data', 'rank-sync-write-guard.json');
}

async function extendRankSyncGuard(reason: string) {
    const filePath = getManualOddsRankSyncGuardPath();
    const expiresAt = new Date(Date.now() + MANUAL_ODDS_RANK_SYNC_GUARD_MS).toISOString();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
        filePath,
        JSON.stringify(
            {
                source: 'manual-odds',
                reason,
                expiresAt,
                updatedAt: new Date().toISOString(),
            },
            null,
            2,
        ),
        'utf8',
    );
}

function isSqliteBusyError(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
    return (
        message.includes('database is locked') ||
        message.includes('database is busy') ||
        message.includes('sqlite_busy') ||
        message.includes('sqlite_busy_timeout')
    );
}

function toErrorMessage(error: unknown, fallback: string) {
    if (isSqliteBusyError(error)) {
        return '\u6570\u636e\u5e93\u6b63\u5fd9\uff0c\u5df2\u81ea\u52a8\u91cd\u8bd5\u591a\u6b21\u4ecd\u672a\u6210\u529f\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5';
    }
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

async function withManualOddsRetry<T>(task: () => T, context: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MANUAL_ODDS_WRITE_RETRY_COUNT; attempt += 1) {
        try {
            return task();
        } catch (error) {
            lastError = error;
            if (!isSqliteBusyError(error) || attempt >= MANUAL_ODDS_WRITE_RETRY_COUNT) {
                break;
            }
            console.warn(`[manual-odds] ${context} hit SQLite busy/lock, retrying (${attempt}/${MANUAL_ODDS_WRITE_RETRY_COUNT})`);
            await sleep(MANUAL_ODDS_WRITE_RETRY_DELAY_MS * attempt);
        }
    }

    throw new Error(toErrorMessage(lastError, `\u76d8\u53e3\u8bb0\u5f55\u4fdd\u5b58\u5931\u8d25\uff1a${context}`));
}

function openManualOddsDb() {
    const db = new DatabaseSync(resolveLocalDatabasePath());
    db.prepare(`PRAGMA busy_timeout = ${MANUAL_ODDS_BUSY_TIMEOUT_MS}`).run();
    return db;
}

function toDateOrNull(value?: string | Date | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoStringOrNull(value?: string | Date | null) {
    const date = toDateOrNull(value);
    return date ? date.toISOString() : null;
}

function toNullableNumber(value?: number | null) {
    return Number.isFinite(value) ? Number(value) : null;
}

function normalizeActualOddsFormat(value?: string | null) {
    return value === 'HK' || value === 'EU' ? value : null;
}

function toDbRecord(record: StoredOddsResult, matchId: string) {
    return {
        id: record.id,
        matchId,
        gameNumber: Number(record.gameNumber || 1),
        type: String(record.type || ''),
        side: String(record.side || ''),
        threshold: record.threshold === null ? null : toNullableNumber(record.threshold),
        selectionLabel: String(record.selectionLabel || ''),
        detail: String(record.detail || ''),
        createdAt: toIsoStringOrNull(record.createdAt) || new Date().toISOString(),
        resultValue: toNullableNumber(record.resultValue),
        settledStatus: record.settledStatus ? String(record.settledStatus) : null,
        oddsValue: toNullableNumber(record.oddsValue),
        oppositeOddsValue: toNullableNumber(record.oppositeOddsValue),
        provider: record.provider ? String(record.provider) : null,
        actualThreshold: record.actualThreshold === null ? null : toNullableNumber(record.actualThreshold),
        actualSelectionLabel: record.actualSelectionLabel ? String(record.actualSelectionLabel) : null,
        actualOddsRaw: toNullableNumber(record.actualOddsRaw),
        actualOddsNormalized: toNullableNumber(record.actualOddsNormalized),
        actualOddsFormat: normalizeActualOddsFormat(record.actualOddsFormat),
        actualProvider: record.actualProvider ? String(record.actualProvider) : null,
        actualStakeAmount: toNullableNumber(record.actualStakeAmount),
        teamAId: record.teamAId ? String(record.teamAId) : null,
        teamBId: record.teamBId ? String(record.teamBId) : null,
        teamAName: record.teamAName ? String(record.teamAName) : null,
        teamBName: record.teamBName ? String(record.teamBName) : null,
        teamARegion: record.teamARegion ? String(record.teamARegion) : null,
        teamBRegion: record.teamBRegion ? String(record.teamBRegion) : null,
        matchStartTime: toIsoStringOrNull(record.matchStartTime),
        tournament: record.tournament ? String(record.tournament) : null,
        stage: record.stage ? String(record.stage) : null,
    };
}

function fromDbRecord(record: ManualOddsDbRecord): StoredOddsResult | null {
    return normalizeStoredOdds(
        {
            ...record,
            createdAt: toIsoStringOrNull(record.createdAt) || new Date().toISOString(),
            matchStartTime: toIsoStringOrNull(record.matchStartTime) || undefined,
            actualOddsFormat: normalizeActualOddsFormat(record.actualOddsFormat) || undefined,
        },
        record.matchId,
    );
}

function sortStoredOdds(records: StoredOddsResult[]) {
    return [...records].sort((a, b) => {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return String(b.id).localeCompare(String(a.id));
    });
}

function readManualOddsRows(matchIds?: string[]) {
    const db = openManualOddsDb();
    try {
        const ids = Array.isArray(matchIds) ? Array.from(new Set(matchIds.filter(Boolean))) : [];
        const baseSql = `
            SELECT
                "id",
                "matchId",
                "gameNumber",
                "type",
                "side",
                "threshold",
                "selectionLabel",
                "detail",
                "createdAt",
                "resultValue",
                "settledStatus",
                "oddsValue",
                "oppositeOddsValue",
                "provider",
                "actualThreshold",
                "actualSelectionLabel",
                "actualOddsRaw",
                "actualOddsNormalized",
                "actualOddsFormat",
                "actualProvider",
                "actualStakeAmount",
                "teamAId",
                "teamBId",
                "teamAName",
                "teamBName",
                "teamARegion",
                "teamBRegion",
                "matchStartTime",
                "tournament",
                "stage"
            FROM "ManualOddsRecord"
        `;

        if (ids.length === 0) {
            return db.prepare(`${baseSql} ORDER BY "createdAt" DESC, "id" DESC`).all() as ManualOddsDbRecord[];
        }

        const placeholders = ids.map(() => '?').join(', ');
        return db
            .prepare(`${baseSql} WHERE "matchId" IN (${placeholders}) ORDER BY "createdAt" DESC, "id" DESC`)
            .all(...ids) as ManualOddsDbRecord[];
    } finally {
        db.close();
    }
}

function beginImmediate(db: DatabaseSync) {
    db.prepare('BEGIN IMMEDIATE').run();
}

function commit(db: DatabaseSync) {
    db.prepare('COMMIT').run();
}

function rollback(db: DatabaseSync) {
    try {
        db.prepare('ROLLBACK').run();
    } catch {
        // Ignore rollback failures after a partial transaction failure.
    }
}

export async function fetchManualOddsForMatch(matchId: string): Promise<StoredOddsResult[]> {
    const rows = await withManualOddsRetry(() => readManualOddsRows([matchId]), `fetchManualOddsForMatch:${matchId}`);
    return rows.map(fromDbRecord).filter((item): item is StoredOddsResult => item !== null);
}

export async function fetchManualOddsRecords(matchIds?: string[]): Promise<StoredOddsResult[]> {
    const rows = await withManualOddsRetry(() => readManualOddsRows(matchIds), 'fetchManualOddsRecords');
    return rows.map(fromDbRecord).filter((item): item is StoredOddsResult => item !== null);
}

export async function replaceManualOddsForMatch(matchId: string, rawRecords: StoredOddsResult[]): Promise<StoredOddsResult[]> {
    const normalizedRecords = sortStoredOdds(
        rawRecords
            .map((record) => normalizeStoredOdds(record, matchId))
            .filter((item): item is StoredOddsResult => item !== null),
    );

    const nextIds = new Set(normalizedRecords.map((record) => record.id));
    await extendRankSyncGuard(`replaceManualOddsForMatch:${matchId}`);

    await withManualOddsRetry(() => {
        const db = openManualOddsDb();
        const nowIso = new Date().toISOString();
        const selectExisting = db.prepare(`SELECT "id" FROM "ManualOddsRecord" WHERE "matchId" = ?`);
        const deleteByIdsBase = `DELETE FROM "ManualOddsRecord" WHERE "matchId" = ? AND "id" IN (%IDS%)`;
        const upsert = db.prepare(`
            INSERT INTO "ManualOddsRecord" (
                "id",
                "matchId",
                "gameNumber",
                "type",
                "side",
                "threshold",
                "selectionLabel",
                "detail",
                "createdAt",
                "updatedAt",
                "resultValue",
                "settledStatus",
                "oddsValue",
                "oppositeOddsValue",
                "provider",
                "actualThreshold",
                "actualSelectionLabel",
                "actualOddsRaw",
                "actualOddsNormalized",
                "actualOddsFormat",
                "actualProvider",
                "actualStakeAmount",
                "teamAId",
                "teamBId",
                "teamAName",
                "teamBName",
                "teamARegion",
                "teamBRegion",
                "matchStartTime",
                "tournament",
                "stage"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT("id") DO UPDATE SET
                "matchId" = excluded."matchId",
                "gameNumber" = excluded."gameNumber",
                "type" = excluded."type",
                "side" = excluded."side",
                "threshold" = excluded."threshold",
                "selectionLabel" = excluded."selectionLabel",
                "detail" = excluded."detail",
                "updatedAt" = excluded."updatedAt",
                "resultValue" = excluded."resultValue",
                "settledStatus" = excluded."settledStatus",
                "oddsValue" = excluded."oddsValue",
                "oppositeOddsValue" = excluded."oppositeOddsValue",
                "provider" = excluded."provider",
                "actualThreshold" = excluded."actualThreshold",
                "actualSelectionLabel" = excluded."actualSelectionLabel",
                "actualOddsRaw" = excluded."actualOddsRaw",
                "actualOddsNormalized" = excluded."actualOddsNormalized",
                "actualOddsFormat" = excluded."actualOddsFormat",
                "actualProvider" = excluded."actualProvider",
                "actualStakeAmount" = excluded."actualStakeAmount",
                "teamAId" = excluded."teamAId",
                "teamBId" = excluded."teamBId",
                "teamAName" = excluded."teamAName",
                "teamBName" = excluded."teamBName",
                "teamARegion" = excluded."teamARegion",
                "teamBRegion" = excluded."teamBRegion",
                "matchStartTime" = excluded."matchStartTime",
                "tournament" = excluded."tournament",
                "stage" = excluded."stage"
        `);

        beginImmediate(db);
        try {
            const existing = (selectExisting.all(matchId) as Array<{ id: string }>).map((item) => item.id);
            const deleteIds = existing.filter((id) => !nextIds.has(id));
            if (deleteIds.length > 0) {
                const placeholders = deleteIds.map(() => '?').join(', ');
                db.prepare(deleteByIdsBase.replace('%IDS%', placeholders)).run(matchId, ...deleteIds);
            }

            for (const record of normalizedRecords) {
                const data = toDbRecord(record, matchId);
                upsert.run(
                    data.id,
                    data.matchId,
                    data.gameNumber,
                    data.type,
                    data.side,
                    data.threshold,
                    data.selectionLabel,
                    data.detail,
                    data.createdAt,
                    nowIso,
                    data.resultValue,
                    data.settledStatus,
                    data.oddsValue,
                    data.oppositeOddsValue,
                    data.provider,
                    data.actualThreshold,
                    data.actualSelectionLabel,
                    data.actualOddsRaw,
                    data.actualOddsNormalized,
                    data.actualOddsFormat,
                    data.actualProvider,
                    data.actualStakeAmount,
                    data.teamAId,
                    data.teamBId,
                    data.teamAName,
                    data.teamBName,
                    data.teamARegion,
                    data.teamBRegion,
                    data.matchStartTime,
                    data.tournament,
                    data.stage,
                );
            }

            commit(db);
        } catch (error) {
            rollback(db);
            throw error;
        } finally {
            db.close();
        }
    }, `replaceManualOddsForMatch:${matchId}`);

    revalidatePath(`/match/${matchId}`);
    revalidatePath('/odds');
    return normalizedRecords;
}

export async function replaceManualOddsForMatchSafe(
    matchId: string,
    rawRecords: StoredOddsResult[],
): Promise<{ success: true; records: StoredOddsResult[] } | { success: false; error: string }> {
    try {
        const records = await replaceManualOddsForMatch(matchId, rawRecords);
        return { success: true, records };
    } catch (error) {
        return {
            success: false,
            error: toErrorMessage(error, '\u76d8\u53e3\u8bb0\u5f55\u4fdd\u5b58\u5931\u8d25'),
        };
    }
}

export async function mergeLegacyManualOddsRecords(rawRecords: StoredOddsResult[]): Promise<{ inserted: number }> {
    const normalizedRecords = rawRecords
        .map((record) => normalizeStoredOdds(record, record.matchId))
        .filter((item): item is StoredOddsResult => item !== null);

    if (normalizedRecords.length === 0) {
        return { inserted: 0 };
    }

    await extendRankSyncGuard('mergeLegacyManualOddsRecords');

    const inserted = await withManualOddsRetry(() => {
        const db = openManualOddsDb();
        const nowIso = new Date().toISOString();
        const ids = normalizedRecords.map((record) => record.id);
        const placeholders = ids.map(() => '?').join(', ');
        const existingSql = `SELECT "id" FROM "ManualOddsRecord" WHERE "id" IN (${placeholders})`;
        const insert = db.prepare(`
            INSERT INTO "ManualOddsRecord" (
                "id",
                "matchId",
                "gameNumber",
                "type",
                "side",
                "threshold",
                "selectionLabel",
                "detail",
                "createdAt",
                "updatedAt",
                "resultValue",
                "settledStatus",
                "oddsValue",
                "oppositeOddsValue",
                "provider",
                "actualThreshold",
                "actualSelectionLabel",
                "actualOddsRaw",
                "actualOddsNormalized",
                "actualOddsFormat",
                "actualProvider",
                "actualStakeAmount",
                "teamAId",
                "teamBId",
                "teamAName",
                "teamBName",
                "teamARegion",
                "teamBRegion",
                "matchStartTime",
                "tournament",
                "stage"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        beginImmediate(db);
        try {
            const existingIds = new Set((db.prepare(existingSql).all(...ids) as Array<{ id: string }>).map((item) => item.id));
            const toCreate = normalizedRecords.filter((record) => !existingIds.has(record.id));

            for (const record of toCreate) {
                const data = toDbRecord(record, record.matchId);
                insert.run(
                    data.id,
                    data.matchId,
                    data.gameNumber,
                    data.type,
                    data.side,
                    data.threshold,
                    data.selectionLabel,
                    data.detail,
                    data.createdAt,
                    nowIso,
                    data.resultValue,
                    data.settledStatus,
                    data.oddsValue,
                    data.oppositeOddsValue,
                    data.provider,
                    data.actualThreshold,
                    data.actualSelectionLabel,
                    data.actualOddsRaw,
                    data.actualOddsNormalized,
                    data.actualOddsFormat,
                    data.actualProvider,
                    data.actualStakeAmount,
                    data.teamAId,
                    data.teamBId,
                    data.teamAName,
                    data.teamBName,
                    data.teamARegion,
                    data.teamBRegion,
                    data.matchStartTime,
                    data.tournament,
                    data.stage,
                );
            }

            commit(db);
            return toCreate.length;
        } catch (error) {
            rollback(db);
            throw error;
        } finally {
            db.close();
        }
    }, 'mergeLegacyManualOddsRecords');

    revalidatePath('/odds');
    for (const matchId of new Set(normalizedRecords.map((record) => record.matchId))) {
        revalidatePath(`/match/${matchId}`);
    }

    return { inserted };
}
