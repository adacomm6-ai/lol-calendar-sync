import { NextResponse } from 'next/server';

import { clearRankSyncHistory, exportRankSyncHistory } from '@/lib/player-rank-admin';

export async function GET() {
  try {
    const entries = await exportRankSyncHistory();
    return new NextResponse(JSON.stringify(entries, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="rank-sync-history-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导出同步记录失败' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    await clearRankSyncHistory();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '清空同步记录失败' },
      { status: 500 },
    );
  }
}
