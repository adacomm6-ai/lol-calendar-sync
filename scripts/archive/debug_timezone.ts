
import { format } from 'date-fns';

const now = new Date();
console.log('System Time:', now.toString());
console.log('ISO String:', now.toISOString());

// Test Date: 2026-01-27 19:00:00 CST (Beijing) -> 11:00:00 UTC
const matchTime = new Date('2026-01-27T11:00:00Z');
console.log('Match Time (UTC 11:00):', matchTime.toISOString());
console.log('Match Time (Local Format):', format(matchTime, 'yyyy-MM-dd HH:mm'));

// Helper to mimic Beijing Time formatting
function formatBeijing(date: Date, fmt: string) {
    // 1. Get offset in milliseconds. Beijing is UTC+8.
    // We want to treat the date as if it is in Beijing, then format it using UTC methods (or shift it).
    // Safe way using Intl to get parts?
    // Or just shift and assuming UTC.

    // Attempt 1: Intl
    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
    const part = (type: string) => parts.find(p => p.type === type)?.value || '';

    // Mapping format string is hard with Intl.

    // Attempt 2: Shift
    // If we want to output 'HH:mm' in Beijing Time.
    // We want to see 19:00.
    // matchTime is 11:00 UTC.
    // If we shift it by +8h -> 19:00 UTC.
    // Then we format it as correct if we force the formatter to be UTC.

    const beijingOffset = 8 * 60; // minutes
    const localOffset = date.getTimezoneOffset() * -1; // minutes (e.g. -480 for UTC+8, so 480)

    // The problem is format() uses local time.
    // If local is UTC: matchTime (11:00) -> format -> 11:00.
    // If we shift matchTime to (19:00 UTC) -> format -> 19:00.

    // If local is Beijing: matchTime (11:00 UTC = 19:00 Local) -> format -> 19:00.

    // So if we are in Beijing, we don't need to shift.
    // If we are in UTC, we need to shift.

    // How do we make it consistent? 
    // We can use `date.getTime() + (targetOffset - localOffset) * 60 * 1000`.
    // Then the date object has the "face value" of Beijing Time in the Local system.

    const targetOffset = 480; // UTC+8
    const diff = targetOffset - localOffset;
    const shifted = new Date(date.getTime() + diff * 60 * 1000);
    return format(shifted, fmt);
}

console.log('Format Beijing Attempt (Local):', formatBeijing(matchTime, 'yyyy-MM-dd HH:mm'));

// Simulation of UTC environment
// We can't easily change process.env.TZ inside the script effectively for Date object in Node without restart?
// But we can manually modify the formatBeijing to assume localOffset is 0.

function formatBeijingAssumedUTC(date: Date, fmt: string) {
    const localOffset = 0; // Assume we are on UTC server
    const targetOffset = 480;
    const diff = targetOffset - localOffset;
    const shifted = new Date(date.getTime() + diff * 60 * 1000);
    return format(shifted, fmt);
}

console.log('Format Beijing Attempt (Simulated UTC Env):', formatBeijingAssumedUTC(matchTime, 'yyyy-MM-dd HH:mm'));
