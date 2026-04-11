
const { format } = require('date-fns');

const now = new Date();
console.log('System Time:', now.toString());
console.log('ISO String:', now.toISOString());

// Test Date: 2026-01-27 19:00:00 CST (Beijing) -> 11:00:00 UTC
const matchTime = new Date('2026-01-27T11:00:00Z');
console.log('Match Time (UTC 11:00):', matchTime.toISOString());
console.log('Match Time (Local Format):', format(matchTime, 'yyyy-MM-dd HH:mm'));

// Helper to mimic Beijing Time formatting
function formatBeijing(date, fmt) {
    // 1. Get offset in milliseconds. Beijing is UTC+8.
    // We want to force formatting as if we are in Beijing.

    // We calculate the offset difference between Local and Beijing.
    // Beijing is UTC+8 (-480 min offset).

    const beijingOffset = -480; // minutes (getTimezoneOffset returns positive for West, negative for East)
    const localOffset = date.getTimezoneOffset(); // e.g. 0 for UTC, -480 for Beijing

    // If we are in UTC (0), and want Beijing (-480).
    // The "Face Value" of the date needs to shift forward by 8 hours.
    // 11:00 UTC -> 19:00 Face Value.

    // Shift Amount = (Local - Target) ???
    // UTC (0) -> Beijing (-480).

    // If I add 8 hours to 11:00 UTC, I get 19:00 UTC.
    // If I format 19:00 UTC in UTC machine, I get "19:00". Correct.

    // If I am in Beijing (-480).
    // 11:00 UTC is 19:00 Local.
    // If I add 8 hours (thinking I need to shift), I get 03:00 UTC (Next Day).
    // If I format 03:00 UTC in Beijing (-480) -> 11:00 Local (Next Day?). Wait.
    // 03:00 UTC is 11:00 Beijing.

    // So if local IS Beijing, I should NOT shift.

    // Shift = (TargetOffset - LocalOffset) * 60 * 1000? NO.
    // We simply want to convert the UTC timestamp to a "shifted" timestamp that represent local time in UTC.
    // Actually, `date-fns-tz` does this cleanly.
    // manually:
    // We want (Date + BeijingOffset) - (Date + LocalOffset) ??

    // Let's use milliseconds.
    // Beijing is UTC + 8h.
    // We want to display what the time IS in Beijing.
    // So we take the UTC timestamp, add 8 hours. 
    // This gives us a new Date object which, IF interpreted as UTC, has the same face value as the original date in Beijing.

    // Example: Match 11:00 UTC. In Beijing it is 19:00.
    // We want a date object that looks like 19:00.
    // 11:00 UTC + 8h = 19:00 UTC.
    // If we format this new object using `format` ON A UTC MACHINE, it says "19:00".

    // BUT what if we run this on a Beijing machine?
    // We have 19:00 UTC.
    // Format on Beijing machine (UTC+8) -> adds 8h -> 03:00 (Next Day).

    // So we must cancel out the Local Offset.
    // Shifted = UTC_Time + Beijing_Offset_Hours + Local_Offset_Hours_Cancellation.

    // This is getting complicated.
    // Ideally: Use Intl.DateTimeFormat 'zh-CN' with timeZone: 'Asia/Shanghai'.
    // Then parse the parts?

    // Or just "assume" we are formatting to string, so we construct the parts via Intl.

    const options = {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        second: '2-digit'
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find(p => p.type === type).value;

    // Map to date-fns tokens roughly
    // yyyy-MM-dd HH:mm
    const y = get('year');
    const M = get('month');
    const d = get('day');
    const H = get('hour');
    const m = get('minute');
    const s = get('second');

    // Replace format string
    return fmt
        .replace('yyyy', y)
        .replace('MM', M)
        .replace('dd', d)
        .replace('HH', H)
        .replace('mm', m);
}

console.log('Format Beijing (Intl):', formatBeijing(matchTime, 'yyyy-MM-dd HH:mm'));

// Check what happens if we use this 'Intl' approach on UTC vs Local environment?
// Intl with strict timeZone should be consistent everywhere.
