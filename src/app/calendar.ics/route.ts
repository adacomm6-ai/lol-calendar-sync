import { NextRequest } from 'next/server';

import { handleCalendarIcsRequest } from '@/lib/calendar-ics';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleCalendarIcsRequest(request, {
    defaultStatus: 'upcoming',
    defaultCalendarName: 'LOL赛程',
    defaultRegions: ['LPL', 'LCK'],
  });
}
