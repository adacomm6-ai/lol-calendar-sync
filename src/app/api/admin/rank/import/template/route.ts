import { NextResponse } from 'next/server';

import { buildRankImportTemplateCsv } from '@/lib/player-rank-admin';

export async function GET() {
  try {
    const csv = await buildRankImportTemplateCsv();

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="rank-account-import-template.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build import template',
      },
      { status: 500 },
    );
  }
}
