import { NextResponse } from 'next/server';

import { getRankSyncAdminStatus } from '@/lib/player-rank-admin';

export async function GET() {
  try {
    return NextResponse.json(await getRankSyncAdminStatus());
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown provider status error' },
      { status: 500 },
    );
  }
}
