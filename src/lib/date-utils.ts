import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const TARGET_TIMEZONE = 'Asia/Shanghai';

/**
 * Parses and formats a date securely in Beijing Time (UTC+8) bypassing local Server/Client TZ offset differences.
 */
export function formatBeijingTime(date: Date | string | number | null | undefined, formatStr: string): string {
    if (!date) return '-';
    return formatInTimeZone(date, TARGET_TIMEZONE, formatStr);
}

/**
 * Returns a new Date object representing the equivalent local time in Beijing.
 * WARNING: Passing this Date object to Client Components may cause Hydration Mismatches due to ISO serialization!
 * It is strongly recommended to use formatBeijingTime instead for rendering.
 */
export function toBeijingDate(date: Date | string | number | null | undefined): Date {
    if (!date) return new Date();
    return toZonedTime(date, TARGET_TIMEZONE);
}

/**
 * Returns the current time in Beijing as a zoned Date object.
 */
export function getBeijingNow(): Date {
    return toBeijingDate(new Date());
}
