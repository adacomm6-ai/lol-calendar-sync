export type PreferredEventCandidate = {
    label: string;
    latestTimestampMs?: number | null;
    hasUpcoming?: boolean;
    totalCount?: number | null;
};

const CHINESE_NUMERAL_MAP: Record<string, number> = {
    '一': 1,
    '二': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
};

function parseChineseOrdinal(value: string): number | null {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
    if (text === '十') return 10;
    if (text.startsWith('十')) {
        return 10 + (CHINESE_NUMERAL_MAP[text.slice(1)] || 0);
    }
    if (text.endsWith('十')) {
        return (CHINESE_NUMERAL_MAP[text[0]] || 0) * 10;
    }
    if (text.length === 2 && text[1] === '十') {
        return (CHINESE_NUMERAL_MAP[text[0]] || 0) * 10;
    }
    if (text.length === 3 && text[1] === '十') {
        return (CHINESE_NUMERAL_MAP[text[0]] || 0) * 10 + (CHINESE_NUMERAL_MAP[text[2]] || 0);
    }
    return CHINESE_NUMERAL_MAP[text] || null;
}

export function getEventSemanticPriority(label: string) {
    const text = String(label || '').trim();
    const lower = text.toLowerCase();
    let score = 0;

    const splitMatch = lower.match(/split\s*(\d+)/i);
    if (splitMatch) {
        score += Number.parseInt(splitMatch[1], 10) * 100;
    }

    const chineseSplitMatch = text.match(/第\s*([一二三四五六七八九十\d]+)\s*赛段/);
    const chineseSplitOrder = chineseSplitMatch ? parseChineseOrdinal(chineseSplitMatch[1]) : null;
    if (chineseSplitOrder) {
        score += chineseSplitOrder * 100;
    }

    if (/\b(world|worlds|msi)\b/i.test(lower) || /世界赛|全球/.test(text)) score += 1000;
    if (/\bplayoffs?\b/i.test(lower) || /季后赛|淘汰赛/.test(text)) score += 8;
    if (/\bregular\b/i.test(lower) || /常规赛/.test(text)) score += 4;
    if (/\bcup\b/i.test(lower) || text.includes('杯')) score += 20;
    if (/\bversus\b/i.test(lower)) score += 3;

    return score;
}

export function comparePreferredEventCandidates(left: PreferredEventCandidate, right: PreferredEventCandidate) {
    const upcomingDiff = Number(Boolean(right.hasUpcoming)) - Number(Boolean(left.hasUpcoming));
    if (upcomingDiff !== 0) return upcomingDiff;

    const rightLatest = Number.isFinite(right.latestTimestampMs) ? Number(right.latestTimestampMs) : Number.NEGATIVE_INFINITY;
    const leftLatest = Number.isFinite(left.latestTimestampMs) ? Number(left.latestTimestampMs) : Number.NEGATIVE_INFINITY;
    if (rightLatest !== leftLatest) return rightLatest - leftLatest;

    const semanticDiff = getEventSemanticPriority(right.label) - getEventSemanticPriority(left.label);
    if (semanticDiff !== 0) return semanticDiff;

    const totalDiff = Number(right.totalCount || 0) - Number(left.totalCount || 0);
    if (totalDiff !== 0) return totalDiff;

    return String(left.label || '').localeCompare(String(right.label || ''));
}
