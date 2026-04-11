import { NextRequest, NextResponse } from 'next/server';

import { importRankAccountsFromText } from '@/lib/player-rank-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await importRankAccountsFromText({
      rawText: String(body.rawText || ''),
      overwriteExisting: Boolean(body.overwriteExisting),
      defaults: {
        platform: body.defaults?.platform ? String(body.defaults.platform) : undefined,
        regionGroup: body.defaults?.regionGroup ? String(body.defaults.regionGroup) : undefined,
        source: body.defaults?.source ? String(body.defaults.source) : undefined,
        status: body.defaults?.status ? String(body.defaults.status) : undefined,
        confidence:
          body.defaults?.confidence !== undefined && Number.isFinite(Number(body.defaults.confidence))
            ? Number(body.defaults.confidence)
            : undefined,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown rank import error';
    const status =
      message.includes('Import text is empty') ||
      message.includes('Player not found') ||
      message.includes('Missing gameName')
        ? 400
        : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}
