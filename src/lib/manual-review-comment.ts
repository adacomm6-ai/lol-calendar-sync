export type ManualReviewType = 'HIGHLIGHT' | 'ANOMALY' | 'SPOTLIGHT' | 'RISK';

export interface ManualReviewPayload {
    version: 1;
    manual: true;
    reviewType: ManualReviewType;
    teamId: string;
    teamName: string;
    playerId: string;
    hero: string;
    detail: string;
    summary: string;
    matchDate: string;
    opponentTeamName: string;
    gameNumber: number;
}

export interface ParsedManualReviewComment extends ManualReviewPayload {
    html: string;
}

export interface ManualReviewRecordLike {
    id: string;
    reviewType: string;
    teamId: string;
    teamName: string;
    playerId: string;
    hero: string;
    detail: string;
    summary: string;
    matchDate: string;
    opponentTeamName: string;
    gameNumber: number;
}

const COMMENT_MARKER = 'manual-review:';

export const MANUAL_REVIEW_COMMENT_TYPE = 'MANUAL_REVIEW';

export const MANUAL_REVIEW_TYPE_OPTIONS: Array<{ value: ManualReviewType; label: string }> = [
    { value: 'HIGHLIGHT', label: '精彩' },
    { value: 'ANOMALY', label: '异常' },
    { value: 'SPOTLIGHT', label: '高光' },
    { value: 'RISK', label: '风险' },
];

function encodePayload(payload: ManualReviewPayload) {
    return encodeURIComponent(JSON.stringify(payload)).replace(/-/g, '%2D');
}

function decodePayload(raw: string) {
    return JSON.parse(decodeURIComponent(String(raw || '').replace(/%2D/g, '-'))) as ManualReviewPayload;
}

function escapeHtml(input: string) {
    return String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripHtml(input: string) {
    return String(input || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function deriveManualReviewSummary(detail: string) {
    const firstLine =
        String(detail || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean) || '';

    if (!firstLine) return '未填写点评摘要';
    return firstLine.length > 34 ? `${firstLine.slice(0, 34)}...` : firstLine;
}

export function getManualReviewTypeLabel(type: ManualReviewType) {
    return MANUAL_REVIEW_TYPE_OPTIONS.find((option) => option.value === type)?.label || '手动点评';
}

export function normalizeManualReviewType(type: string): ManualReviewType {
    if (type === 'ANOMALY' || type === 'SPOTLIGHT' || type === 'RISK') return type;
    return 'HIGHLIGHT';
}

export function serializeManualReviewComment(
    input: Omit<ManualReviewPayload, 'version' | 'manual' | 'summary'> & { summary?: string },
) {
    const detail = String(input.detail || '').trim();
    const summary = String(input.summary || '').trim() || deriveManualReviewSummary(detail);
    const payload: ManualReviewPayload = {
        version: 1,
        manual: true,
        reviewType: normalizeManualReviewType(input.reviewType),
        teamId: String(input.teamId || '').trim(),
        teamName: String(input.teamName || '').trim(),
        playerId: String(input.playerId || '').trim(),
        hero: String(input.hero || '').trim(),
        detail,
        summary,
        matchDate: String(input.matchDate || '').trim(),
        opponentTeamName: String(input.opponentTeamName || '').trim(),
        gameNumber: Number(input.gameNumber || 1) || 1,
    };

    const html = escapeHtml(detail).replace(/\r?\n/g, '<br/>');
    return `<!--${COMMENT_MARKER}${encodePayload(payload)}--><p>${html}</p>`;
}

export function parseManualReviewComment(content: string): ParsedManualReviewComment | null {
    const raw = String(content || '');
    const match = raw.match(/<!--manual-review:([\s\S]*?)-->/i);
    if (!match) return null;

    try {
        const payload = decodePayload(match[1]);
        const html = raw.replace(match[0], '').trim();
        const detail = stripHtml(html) || payload.detail || '';
        const summary = payload.summary || deriveManualReviewSummary(detail);
        return {
            ...payload,
            reviewType: normalizeManualReviewType(payload.reviewType),
            detail,
            summary,
            html,
        };
    } catch {
        return null;
    }
}

export function toManualReviewEntry(record: ManualReviewRecordLike) {
    return {
        id: record.id,
        reviewType: normalizeManualReviewType(record.reviewType),
        teamId: String(record.teamId || '').trim(),
        teamName: String(record.teamName || '').trim(),
        playerId: String(record.playerId || '').trim(),
        hero: String(record.hero || '').trim(),
        detail: String(record.detail || '').trim(),
        summary: String(record.summary || '').trim() || deriveManualReviewSummary(String(record.detail || '').trim()),
        matchDate: String(record.matchDate || '').trim() || '--',
        opponentTeamName: String(record.opponentTeamName || '').trim() || '--',
        gameNumber: Number(record.gameNumber || 1) || 1,
    };
}
