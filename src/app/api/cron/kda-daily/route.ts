import { NextRequest, NextResponse } from 'next/server';
import {
    getYesterdayBeijingDateString,
    runKdaSyncJob,
    writeKdaAutoSyncState,
} from '@/lib/kda-sync';

export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string {
    if (!authHeader) return '';
    if (!authHeader.startsWith('Bearer ')) return '';
    return authHeader.slice('Bearer '.length).trim();
}

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    const authHeader = req.headers.get('authorization');
    const bearerToken = extractBearerToken(authHeader);
    const plainToken = req.headers.get('x-cron-secret') || '';

    return bearerToken === secret || plainToken === secret;
}

export async function GET(req: NextRequest) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ success: false, error: 'CRON_SECRET is not configured' }, { status: 500 });
    }

    if (!isAuthorized(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const targetDate = getYesterdayBeijingDateString();
    const startedAt = Date.now();

    try {
        const result = await runKdaSyncJob({
            dateStr: targetDate,
            regionScope: 'ALL',
            conflictPolicy: 'SOURCE_OF_TRUTH',
            createMissing: false,
        });

        const state = {
            runAt: new Date().toISOString(),
            trigger: 'cron' as const,
            dateStr: targetDate,
            durationMs: Date.now() - startedAt,
            result,
        };

        await writeKdaAutoSyncState(state);

        return NextResponse.json({ success: result.success, ...state }, { status: result.success ? 200 : 500 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const state = {
            runAt: new Date().toISOString(),
            trigger: 'cron' as const,
            dateStr: targetDate,
            durationMs: Date.now() - startedAt,
            result: {
                success: false,
                dateStr: targetDate,
                regionScope: 'ALL' as const,
                totalSeries: 0,
                linkedSeries: 0,
                missingSeries: 0,
                processedSeries: 0,
                updates: 0,
                filled: 0,
                corrected: 0,
                unchanged: 0,
                failed: 0,
                errors: [message],
            },
            error: message,
        };

        await writeKdaAutoSyncState(state);

        return NextResponse.json({ success: false, ...state }, { status: 500 });
    }
}
