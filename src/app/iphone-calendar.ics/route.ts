import { NextRequest } from 'next/server';

import { handleCalendarIcsRequest } from '@/lib/calendar-ics';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleCalendarIcsRequest(request, {
    defaultStatus: 'all',
    defaultCalendarName: 'LOL-LPL-LCK',
    defaultRegions: ['LPL', 'LCK'],
  });
}
