export function toEpochMs(value: unknown): number | null {
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    const text = String(value || '').trim();
    if (!text) return null;

    if (/^\d+$/.test(text)) {
        const asNum = Number(text);
        return Number.isFinite(asNum) ? asNum : null;
    }

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
}

export function sortByStartTimeDesc<T extends { startTime?: unknown }>(items: T[]) {
    return items.slice().sort((left, right) => {
        const rightMs = toEpochMs(right.startTime) ?? 0;
        const leftMs = toEpochMs(left.startTime) ?? 0;
        return rightMs - leftMs;
    });
}
