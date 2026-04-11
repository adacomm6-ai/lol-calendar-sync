'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
    fetchManualOddsForMatch,
    fetchManualOddsRecords,
    mergeLegacyManualOddsRecords,
    replaceManualOddsForMatchSafe,
} from '@/app/manual-odds/actions';
import { addOdds, updateOdds } from '@/app/entry/upload/actions';
import {
    buildOddsValue,
    HelpTooltipLabel,
    OddsSplitField,
    PrefixedNumericField,
    splitOddsParts,
} from '@/components/analysis/odds-form-controls';
import TeamOddsSummaryCard from '@/components/analysis/TeamOddsSummaryCard';
import { getTeamShortDisplayName } from '@/lib/team-display';
import {
    buildTeamOddsSummary,
    calculateResultValueFromStake,
    createStoredOddsId,
    detectOddsFormat,
    formatSignedNumber,
    getGroupedStatusFromRecords,
    getProfitMultiplierFromOdds,
    getStatusFromResultValue,
    LEGACY_MANUAL_ODDS_MIGRATION_KEY,
    reconcileStoredOddsRecordFromGames,
    resolveAutoSettlementStatusFromGame,
    loadAllLegacyStoredOdds,
    normalizeUnifiedOdds,
    parseResultNumber,
    REAL_ODDS_FIELD_RULES,
    summarizeRealOddsReadiness,
    type BetSide,
    type BetStatus,
    type OddsType,
    type StoredOddsResult,
} from '@/lib/odds-history';

interface Odds {
    id: string;
    provider: string;
    type: string;
    teamAOdds: number;
    teamBOdds: number;
    threshold?: number | null;
    gameNumber?: number;
}

interface Game {
    id?: string;
    gameNumber: number;
    winnerId?: string | null;
    duration?: number | null;
    totalKills?: number | null;
    blueKills?: number | null;
    redKills?: number | null;
    blueSideTeamId?: string | null;
    redSideTeamId?: string | null;
}

interface TeamInfo {
    id: string;
    name: string;
    shortName?: string | null;
    region?: string | null;
}

interface OddsManagerProps {
    matchId: string;
    initialOdds: Odds[];
    games?: Game[];
    teamA?: TeamInfo;
    teamB?: TeamInfo;
    activeGameNumber: number;
    isAdmin?: boolean;
    matchStartTime?: string | null;
    tournament?: string | null;
    stage?: string | null;
}

interface ResultDraft {
    recordId?: string;
    gameNumber: number;
    type: OddsType;
    side: BetSide;
    threshold: number | null;
    selectionLabel: string;
    detail: string;
    resultValue?: number;
    settledStatus?: BetStatus;
    oddsValue?: number;
    oppositeOddsValue?: number;
    provider?: string;
    actualThreshold?: number | null;
    actualSelectionLabel?: string;
    actualOddsRaw?: number;
    actualOddsNormalized?: number;
    actualOddsFormat?: 'HK' | 'EU';
    actualProvider?: string;
    actualStakeAmount?: number;
}

interface OddsCardProps {
    type: OddsType;
    title: string;
    oddsData?: Odds;
    matchId: string;
    gameNumber: number;
    isAdmin: boolean;
    onRefresh: () => void;
    teamAName: string;
    teamBName: string;
    activeGame?: Game;
    teamAId?: string;
    teamBId?: string;
    currentLeftRecords: StoredOddsResult[];
    currentRightRecords: StoredOddsResult[];
    allRecords: StoredOddsResult[];
    matchStartTime?: string | null;
    onUpsertResult: (draft: ResultDraft) => Promise<void> | void;
    onDeleteResult: (recordId: string) => Promise<void> | void;
}

function getReadinessTone(stage: ReturnType<typeof summarizeRealOddsReadiness>['stage']) {
    if (stage === 'none') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    if (stage === 'boot' || stage === 'usable') return 'border-sky-400/30 bg-sky-500/10 text-sky-100';
    if (stage === 'calibration') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
}

function EditIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

function getTeamLabel(team?: TeamInfo) {
    if (!team) return 'UNK';
    return getTeamShortDisplayName({ name: team.name, shortName: team.shortName });
}

function formatLineValue(value?: number | null) {
    if (!Number.isFinite(value)) return '';
    const numeric = value as number;
    if (Number.isInteger(numeric)) return String(numeric);
    return numeric.toFixed(1);
}

function getHandicapLabel(teamName: string, threshold?: number | null, invert = false) {
    const line = Number(threshold || 0);
    const display = invert ? -line : line;
    const sign = display > 0 ? '+' : '';
    return `${teamName} ${sign}${formatLineValue(display)}`;
}

function getOptionLabel(type: OddsType, side: BetSide, teamAName: string, teamBName: string, threshold?: number | null) {
    if (type === 'WINNER') return side === 'LEFT' ? teamAName : teamBName;
    if (type === 'HANDICAP') {
        return side === 'LEFT' ? getHandicapLabel(teamAName, threshold) : getHandicapLabel(teamBName, threshold, true);
    }
    if (type === 'KILLS') return side === 'LEFT' ? `大于 > ${formatLineValue(threshold)}` : `小于 < ${formatLineValue(threshold)}`;
    return side === 'LEFT' ? `大于 > ${formatLineValue(threshold)}` : `小于 < ${formatLineValue(threshold)}`;
}

function buildDraftThresholdValue(
    type: OddsType,
    side: BetSide,
    rawThreshold: string,
    baseThreshold?: number | null,
    handicapSign?: '+' | '-',
) {
    if (type === 'WINNER') return null;
    const trimmed = rawThreshold.trim();
    if (trimmed === '') return 0;
    const parsed = parseResultNumber(trimmed);
    if (!Number.isFinite(parsed)) return baseThreshold ?? 0;
    if (type !== 'HANDICAP') return parsed ?? 0;
    return buildStoredHandicapThreshold(side, handicapSign ?? getDisplayedHandicapSign(side, baseThreshold), trimmed);
}

function getSignFromThreshold(value?: number | null): '+' | '-' {
    return Number(value || 0) < 0 ? '-' : '+';
}

function getDisplayedHandicapValue(side: BetSide, value?: number | null) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return 0;
    return side === 'LEFT' ? numeric : -numeric;
}

function getDisplayedHandicapSign(side: BetSide, value?: number | null): '+' | '-' {
    return getSignFromThreshold(getDisplayedHandicapValue(side, value));
}

function buildStoredHandicapThreshold(side: BetSide, sign: '+' | '-', rawThreshold: string) {
    const trimmed = rawThreshold.trim();
    if (trimmed === '') return 0;
    const parsed = parseResultNumber(trimmed);
    if (!Number.isFinite(parsed)) return 0;
    const displayValue = Number((((sign === '-' ? -1 : 1) * (parsed as number))).toFixed(3));
    const storedValue = side === 'LEFT' ? displayValue : -displayValue;
    return Number(storedValue.toFixed(3));
}

function getHandicapInputPrefix(optionLabel: string) {
    if (optionLabel.includes(' +')) return '+';
    if (optionLabel.includes(' -')) return '-';
    return '';
}

function getLossBadgeTone(streak: number) {
    if (streak >= 3) {
        return {
            className: 'border-emerald-500/45 bg-emerald-600/15 text-emerald-100',
        };
    }
    return {
        className: 'border-lime-400/35 bg-lime-500/10 text-lime-100',
    };
}

function getWinBadgeTone(streak: number) {
    if (streak >= 3) {
        return {
            className: 'border-red-500/45 bg-red-600/15 text-red-100',
        };
    }
    return {
        className: 'border-rose-400/35 bg-rose-500/10 text-rose-100',
    };
}

function getHitStatus(type: OddsType, oddsData: Odds | undefined, activeGame: Game | undefined, teamAId?: string, teamBId?: string) {
    if (!activeGame || !oddsData) return { left: false, right: false };

    const line = Number(oddsData.threshold || 0);

    if (type === 'WINNER') {
        if (!activeGame.winnerId) return { left: false, right: false };
        return {
            left: activeGame.winnerId === teamAId,
            right: activeGame.winnerId === teamBId,
        };
    }

    if (type === 'KILLS') {
        const totalKills =
            Number(activeGame.totalKills || 0) || Number(activeGame.blueKills || 0) + Number(activeGame.redKills || 0);
        if (!totalKills) return { left: false, right: false };
        return {
            left: totalKills > line,
            right: totalKills < line,
        };
    }

    if (type === 'TIME') {
        if (!activeGame.duration) return { left: false, right: false };
        const minutes = activeGame.duration / 60;
        return {
            left: minutes > line,
            right: minutes < line,
        };
    }

    if (type === 'HANDICAP') {
        if (!teamAId) return { left: false, right: false };

        let scoreA = 0;
        let scoreB = 0;

        if (teamAId === activeGame.blueSideTeamId) {
            scoreA = Number(activeGame.blueKills || 0);
            scoreB = Number(activeGame.redKills || 0);
        } else if (teamAId === activeGame.redSideTeamId) {
            scoreA = Number(activeGame.redKills || 0);
            scoreB = Number(activeGame.blueKills || 0);
        } else {
            return { left: false, right: false };
        }

        return {
            left: scoreA + line > scoreB,
            right: scoreA + line < scoreB,
        };
    }

    return { left: false, right: false };
}

function OddsCard({
    type,
    title,
    oddsData,
    matchId,
    gameNumber,
    isAdmin,
    onRefresh,
    teamAName,
    teamBName,
    activeGame,
    teamAId,
    teamBId,
    currentLeftRecords,
    currentRightRecords,
    allRecords,
    matchStartTime,
    onUpsertResult,
    onDeleteResult,
}: OddsCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [leftOdds, setLeftOdds] = useState((normalizeUnifiedOdds(oddsData?.teamAOdds) ?? 0).toString());
    const [rightOdds, setRightOdds] = useState((normalizeUnifiedOdds(oddsData?.teamBOdds) ?? 0).toString());
    const [threshold, setThreshold] = useState(Number.isFinite(oddsData?.threshold) ? String(Math.abs(oddsData?.threshold as number)) : '');
    const [handicapSign, setHandicapSign] = useState<'+' | '-'>(getDisplayedHandicapSign('LEFT', oddsData?.threshold));
    const [editorSide, setEditorSide] = useState<BetSide | null>(null);
    const [resultInput, setResultInput] = useState('');
    const [resultDetail, setResultDetail] = useState('');
    const [editingRecordId, setEditingRecordId] = useState('');
    const [actualThresholdInput, setActualThresholdInput] = useState('');
    const [actualThresholdSign, setActualThresholdSign] = useState<'+' | '-'>(getSignFromThreshold(0));
    const [actualOddsWholeInput, setActualOddsWholeInput] = useState('');
    const [actualOddsDecimalInput, setActualOddsDecimalInput] = useState('');
    const [actualProviderInput, setActualProviderInput] = useState('');
    const stakeInputRef = useRef<HTMLInputElement | null>(null);
    const isSavingResultRef = useRef(false);

    useEffect(() => {
        setLeftOdds((normalizeUnifiedOdds(oddsData?.teamAOdds) ?? 0).toString());
        setRightOdds((normalizeUnifiedOdds(oddsData?.teamBOdds) ?? 0).toString());
        setThreshold(Number.isFinite(oddsData?.threshold) ? String(Math.abs(oddsData?.threshold as number)) : '');
        setHandicapSign(getDisplayedHandicapSign('LEFT', oddsData?.threshold));
    }, [oddsData?.id, oddsData?.teamAOdds, oddsData?.teamBOdds, oddsData?.threshold, gameNumber]);

    useEffect(() => {
        setIsEditing(false);
        setEditingRecordId('');
        setEditorSide(null);
    }, [gameNumber]);

    const effectiveOddsData: Odds = oddsData || {
        id: '',
        provider: 'Pre-match',
        type,
        teamAOdds: 0,
        teamBOdds: 0,
        threshold: type === 'WINNER' ? null : 0,
        gameNumber,
    };
    const handleSaveOdds = async () => {
        setLoading(true);
        try {
            const normalizeNumericInput = (value: string, fallback = '0') => {
                const trimmed = value.trim();
                if (trimmed === '') return fallback;
                const parsed = Number(trimmed);
                if (!Number.isFinite(parsed)) {
                    throw new Error('invalid-number');
                }
                return String(parsed);
            };

            const normalizedLeft = String(normalizeUnifiedOdds(Number(normalizeNumericInput(leftOdds))) ?? 0);
            const normalizedRight = String(normalizeUnifiedOdds(Number(normalizeNumericInput(rightOdds))) ?? 0);
            const normalizedThresholdBase = type === 'WINNER' ? null : normalizeNumericInput(threshold);
            const normalizedThreshold =
                type === 'HANDICAP'
                    ? String((handicapSign === '-' ? -1 : 1) * Number(normalizedThresholdBase || '0'))
                    : normalizedThresholdBase;

            const payload = new FormData();
            payload.append('teamAOdds', normalizedLeft);
            payload.append('teamBOdds', normalizedRight);
            if (normalizedThreshold !== null) payload.append('threshold', normalizedThreshold);

            if (oddsData) {
                await updateOdds(oddsData.id, payload);
            } else {
                payload.append('matchId', matchId);
                payload.append('provider', 'Pre-match');
                payload.append('type', type);
                payload.append('gameNumber', String(gameNumber));
                await addOdds(payload);
            }

            setLeftOdds(normalizedLeft);
            setRightOdds(normalizedRight);
            if (normalizedThreshold !== null) setThreshold(normalizedThreshold);
            setIsEditing(false);
            onRefresh();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error && error.message === 'invalid-number' ? '\u8bf7\u8f93\u5165\u6709\u6548\u6570\u5b57' : '\u4fdd\u5b58\u76d8\u53e3\u5931\u8d25');
        } finally {
            setLoading(false);
        }
    };

    const getSideRecords = (side: BetSide) => (side === 'LEFT' ? currentLeftRecords : currentRightRecords);
    const getCurrentRecord = (side: BetSide) => {
        const records = getSideRecords(side);
        if (editingRecordId) {
            const editingRecord = records.find((record) => record.id === editingRecordId);
            if (editingRecord) return editingRecord;
        }
        return records[0];
    };
    const getLatestRecord = (side: BetSide) => getSideRecords(side)[0];
    const getCurrentResultValue = (side: BetSide) => {
        const record = getCurrentRecord(side);
        return Number.isFinite(record?.resultValue) ? (record?.resultValue as number) : null;
    };
    const getCurrentStakeAmount = (side: BetSide) => {
        const record = getCurrentRecord(side);
        return Number.isFinite(record?.actualStakeAmount) ? (record?.actualStakeAmount as number) : null;
    };
    const getStatusLabel = (status?: BetStatus) => {
        if (status === 'WIN') return '赢';
        if (status === 'LOSE') return '输';
        if (status === 'PUSH') return '走';
        return '待';
    };
    const getAutoSettledStatus = (side: BetSide, thresholdValue?: number | null) =>
        resolveAutoSettlementStatusFromGame({
            type,
            side,
            threshold: thresholdValue,
            teamAId,
            teamBId,
            game: activeGame,
        });
    const toBeijingDateKey = (value?: string | null) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        return beijing.toISOString().slice(0, 10);
    };
    const getMetricKeysForTeam = (record: StoredOddsResult, teamId: string) => {
        const selectedTeamId = record.side === 'LEFT' ? record.teamAId : record.teamBId;
        if (record.type === 'WINNER' && selectedTeamId === teamId) return ['winner'];
        if (record.type === 'HANDICAP' && selectedTeamId === teamId) return ['handicap'];
        const involvesTeam = record.teamAId === teamId || record.teamBId === teamId;
        if (!involvesTeam) return [];
        if (record.type === 'KILLS') return ['killsAll', record.side === 'LEFT' ? 'killsOver' : 'killsUnder'];
        if (record.type === 'TIME') return ['timeAll', record.side === 'LEFT' ? 'timeOver' : 'timeUnder'];
        return [];
    };
    const getTodayLossStreakForCard = (side: BetSide) => {
        const latest = getLatestRecord(side);
        if (!latest) return null;
        const teamId = side === 'LEFT' ? teamAId : teamBId;
        if (!teamId) return null;
        const targetDateKey = toBeijingDateKey(matchStartTime || latest.matchStartTime || latest.createdAt);
        if (!targetDateKey) return null;
        const metricKeys = getMetricKeysForTeam(latest, teamId);
        if (metricKeys.length === 0) return null;
        const metricKey = metricKeys[metricKeys.length - 1];
        const targetLabel = latest.actualSelectionLabel || latest.selectionLabel;
        const matched = allRecords
            .filter((record) => toBeijingDateKey(record.matchStartTime || record.createdAt) === targetDateKey)
            .filter((record) => record.teamAId === teamId || record.teamBId === teamId)
            .filter((record) => record.type === latest.type)
            .filter((record) => {
                const keys = getMetricKeysForTeam(record, teamId);
                return keys[keys.length - 1] === metricKey;
            })
            .filter((record) => (record.actualSelectionLabel || record.selectionLabel) === targetLabel)
            .sort((a, b) => {
                if (b.gameNumber !== a.gameNumber) return b.gameNumber - a.gameNumber;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

        const grouped = new Map<string, StoredOddsResult[]>();
        for (const record of matched) {
            const groupKey = `${record.matchId}::${record.gameNumber}`;
            const list = grouped.get(groupKey) || [];
            list.push(record);
            grouped.set(groupKey, list);
        }

        let streak = 0;
        const groupedItems = [...grouped.values()].sort((a, b) => {
            const ag = a[0];
            const bg = b[0];
            if ((bg?.gameNumber || 0) !== (ag?.gameNumber || 0)) return (bg?.gameNumber || 0) - (ag?.gameNumber || 0);
            return new Date(bg?.createdAt || 0).getTime() - new Date(ag?.createdAt || 0).getTime();
        });
        for (const group of groupedItems) {
            const status = getGroupedStatusFromRecords(group);
            if (status === 'LOSE') {
                streak += 1;
                continue;
            }
            break;
        }
        if (streak < 2) return null;
        return {
            label: targetLabel,
            streak,
        };
    };
    const getTodayWinStreakForCard = (side: BetSide) => {
        const latest = getLatestRecord(side);
        if (!latest) return null;
        const teamId = side === 'LEFT' ? teamAId : teamBId;
        if (!teamId) return null;
        const targetDateKey = toBeijingDateKey(matchStartTime || latest.matchStartTime || latest.createdAt);
        if (!targetDateKey) return null;
        const metricKeys = getMetricKeysForTeam(latest, teamId);
        if (metricKeys.length === 0) return null;
        const metricKey = metricKeys[metricKeys.length - 1];
        const targetLabel = latest.actualSelectionLabel || latest.selectionLabel;
        const matched = allRecords
            .filter((record) => toBeijingDateKey(record.matchStartTime || record.createdAt) === targetDateKey)
            .filter((record) => record.teamAId === teamId || record.teamBId === teamId)
            .filter((record) => record.type === latest.type)
            .filter((record) => {
                const keys = getMetricKeysForTeam(record, teamId);
                return keys[keys.length - 1] === metricKey;
            })
            .filter((record) => (record.actualSelectionLabel || record.selectionLabel) === targetLabel)
            .sort((a, b) => {
                if (b.gameNumber !== a.gameNumber) return b.gameNumber - a.gameNumber;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

        const grouped = new Map<string, StoredOddsResult[]>();
        for (const record of matched) {
            const groupKey = `${record.matchId}::${record.gameNumber}`;
            const list = grouped.get(groupKey) || [];
            list.push(record);
            grouped.set(groupKey, list);
        }

        let streak = 0;
        const groupedItems = [...grouped.values()].sort((a, b) => {
            const ag = a[0];
            const bg = b[0];
            if ((bg?.gameNumber || 0) !== (ag?.gameNumber || 0)) return (bg?.gameNumber || 0) - (ag?.gameNumber || 0);
            return new Date(bg?.createdAt || 0).getTime() - new Date(ag?.createdAt || 0).getTime();
        });
        for (const group of groupedItems) {
            const status = getGroupedStatusFromRecords(group);
            if (status === 'WIN') {
                streak += 1;
                continue;
            }
            break;
        }
        if (streak < 2) return null;
        return {
            label: targetLabel,
            streak,
        };
    };
    const fillDraftFromRecord = (side: BetSide, recordId?: string) => {
        const existing = recordId ? getSideRecords(side).find((record) => record.id === recordId) : undefined;
        let currentStake = '';
        if (Number.isFinite(existing?.actualStakeAmount)) {
            currentStake = String(existing?.actualStakeAmount);
        } else if (existing?.settledStatus === 'LOSE' && Number.isFinite(existing?.resultValue)) {
            currentStake = String(Math.abs(existing.resultValue as number));
        } else if (existing?.settledStatus === 'WIN' && Number.isFinite(existing?.resultValue)) {
            const profit = getProfitMultiplierFromOdds(existing?.actualOddsRaw);
            if (profit && profit > 0) {
                currentStake = String(Number(((existing.resultValue as number) / profit).toFixed(2)));
            }
        }
        setResultInput(currentStake);
        setResultDetail(existing?.detail || '');
        const actualThresholdValue =
            existing?.actualThreshold === null
                ? ''
                : Number.isFinite(existing?.actualThreshold)
                  ? String(type === 'HANDICAP' ? Math.abs(existing?.actualThreshold as number) : existing?.actualThreshold)
                  : '';
        const actualOddsValue =
            Number.isFinite(existing?.actualOddsRaw)
                ? String(existing?.actualOddsRaw)
                : '';
        const splitOdds = splitOddsParts(actualOddsValue);
        setActualThresholdInput(actualThresholdValue);
        setActualThresholdSign(getDisplayedHandicapSign(side, existing?.actualThreshold));
        setActualOddsWholeInput(splitOdds.whole);
        setActualOddsDecimalInput(splitOdds.decimal);
        setActualProviderInput(existing?.actualProvider || '');
    };
    useEffect(() => {
        if (!editorSide) return;
        fillDraftFromRecord(editorSide, editingRecordId || undefined);
    }, [editorSide, editingRecordId]);

    useEffect(() => {
        if (!editorSide || !stakeInputRef.current) return;
        const timer = window.setTimeout(() => {
            stakeInputRef.current?.focus();
            stakeInputRef.current?.select();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [editorSide, editingRecordId]);

    const resetDraft = () => {
        setResultInput('');
        setResultDetail('');
        setActualThresholdInput('');
        setActualThresholdSign('+');
        setActualOddsWholeInput('');
        setActualOddsDecimalInput('');
        setActualProviderInput('');
    };

    const startEditResult = (side: BetSide, recordId?: string) => {
        setEditingRecordId(recordId || '');
        fillDraftFromRecord(side, recordId);
        setEditorSide(side);
    };

    const startCreateResult = (side: BetSide) => {
        setEditingRecordId('');
        resetDraft();
        if (type === 'HANDICAP') {
            setActualThresholdSign(getDisplayedHandicapSign(side, effectiveOddsData.threshold));
        }
        setEditorSide(side);
    };

    const saveResult = async () => {
        if (!editorSide) return;
        if (isSavingResultRef.current) return;
        isSavingResultRef.current = true;
        const currentEditorSide = editorSide;
        try {
            const parsedStake = resultInput.trim() === "" ? 0 : parseResultNumber(resultInput);
            if (!Number.isFinite(parsedStake) || Number(parsedStake) < 0) {
                alert("\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6295\u6ce8\u91d1\u989d");
                return;
            }

            const thresholdDraft = actualThresholdInput.trim();
            const parsedActualThreshold = type === 'HANDICAP'
                ? buildStoredHandicapThreshold(editorSide, actualThresholdSign, thresholdDraft)
                : (thresholdDraft === "" ? 0 : parseResultNumber(thresholdDraft));
            const combinedOddsInput = buildOddsValue(actualOddsWholeInput, actualOddsDecimalInput);
            const parsedActualOddsRaw = combinedOddsInput === "" ? 0 : parseResultNumber(combinedOddsInput);
            const fallbackOdds = editorSide === "LEFT" ? effectiveOddsData.teamAOdds : effectiveOddsData.teamBOdds;
            const actualOddsRaw = normalizeUnifiedOdds(parsedActualOddsRaw ?? fallbackOdds) ?? 0;
            const actualOddsNormalized = normalizeUnifiedOdds(actualOddsRaw) ?? undefined;
            const actualOddsFormat = detectOddsFormat(actualOddsRaw) ?? undefined;
            const actualThreshold = type === "WINNER" ? null : (parsedActualThreshold ?? effectiveOddsData.threshold ?? null);
            const actualSelectionLabel = getOptionLabel(type, editorSide, teamAName, teamBName, actualThreshold);
            const settledStatus = getAutoSettledStatus(editorSide, actualThreshold);
            const resultValue = calculateResultValueFromStake(parsedStake, settledStatus, actualOddsRaw);

            if (settledStatus === "WIN" && resultValue === undefined) {
                alert("\u5f53\u524d\u8d54\u7387\u65e0\u6cd5\u8ba1\u7b97\u76c8\u5229\uff0c\u8bf7\u68c0\u67e5\u5b9e\u76d8\u8d54\u7387");
                return;
            }

            await onUpsertResult({
                recordId: editingRecordId || undefined,
                gameNumber,
                type,
                side: currentEditorSide,
                threshold: effectiveOddsData.threshold ?? null,
                selectionLabel: getOptionLabel(type, currentEditorSide, teamAName, teamBName, effectiveOddsData.threshold ?? null),
                detail: resultDetail.trim(),
                resultValue,
                settledStatus,
                oddsValue: currentEditorSide === "LEFT" ? effectiveOddsData.teamAOdds : effectiveOddsData.teamBOdds,
                oppositeOddsValue: currentEditorSide === "LEFT" ? effectiveOddsData.teamBOdds : effectiveOddsData.teamAOdds,
                provider: effectiveOddsData.provider,
                actualThreshold,
                actualSelectionLabel,
                actualOddsRaw,
                actualOddsNormalized,
                actualOddsFormat,
                actualProvider: actualProviderInput.trim() || undefined,
                actualStakeAmount: parsedStake,
            });
            setEditingRecordId("");
            resetDraft();
            if (type === 'HANDICAP') {
                setActualThresholdSign(getDisplayedHandicapSign(currentEditorSide, effectiveOddsData.threshold));
            }
            setEditorSide(currentEditorSide);
            window.setTimeout(() => {
                stakeInputRef.current?.focus();
                stakeInputRef.current?.select();
            }, 0);
        } finally {
            isSavingResultRef.current = false;
        }
    };
    const toggleResultEditor = (side: BetSide, latestRecord?: StoredOddsResult) => {
        if (editorSide === side) {
            setEditingRecordId('');
            setEditorSide(null);
            return;
        }
        if (latestRecord) {
            startEditResult(side, latestRecord.id);
            return;
        }
        startCreateResult(side);
    };
    const renderOption = (side: BetSide) => {
        const sideRecords = getSideRecords(side);
        const isLeft = side === 'LEFT';
        const latestRecord = getLatestRecord(side);
        const resultValue = Number.isFinite(latestRecord?.resultValue) ? (latestRecord?.resultValue as number) : null;
        const draftThreshold =
            editorSide === side
                ? type === 'HANDICAP'
                    ? (actualThresholdInput.trim() === '' ? 0 : Number(`${actualThresholdSign === '-' ? '-' : ''}${actualThresholdInput.replace(/^[+-]/, '')}`))
                    : buildDraftThresholdValue(type, side, actualThresholdInput, effectiveOddsData.threshold ?? null)
                : effectiveOddsData.threshold ?? null;
        const optionLabel = getOptionLabel(type, side, teamAName, teamBName, draftThreshold);
        const oddsText = ((normalizeUnifiedOdds(isLeft ? effectiveOddsData.teamAOdds : effectiveOddsData.teamBOdds) ?? 0).toFixed(3));
        const toneClass = 'border border-white/5';
        const labelClass = 'text-slate-500 group-hover:text-white';
        const oddsClass = isLeft ? 'text-white group-hover:text-blue-400' : 'text-white group-hover:text-red-400';

        const panelActive = editorSide === side;
        const totalStakeAmount = sideRecords.reduce((sum, record) => {
            const stake = Number(record.actualStakeAmount);
            return Number.isFinite(stake) && stake >= 0 ? sum + stake : sum;
        }, 0);
        const hasTotalStakeAmount = sideRecords.some((record) => {
            const stake = Number(record.actualStakeAmount);
            return Number.isFinite(stake) && stake >= 0;
        });
        const totalResultValue = sideRecords.reduce((sum, record) => {
            const value = Number(record.resultValue);
            return Number.isFinite(value) ? sum + value : sum;
        }, 0);
        const hasTotalResultValue = sideRecords.some((record) => Number.isFinite(Number(record.resultValue)));
        const allRecordsSettled =
            sideRecords.length > 0 &&
            sideRecords.every((record) => {
                const status = record.settledStatus || getStatusFromResultValue(record.resultValue);
                return status === 'WIN' || status === 'LOSE' || status === 'PUSH';
            });
        const formatCompactSelectionLabel = (label: string) => {
            const text = String(label || '').trim();
            const underMatch = text.match(/小于\s*<?\s*([0-9.]+)/i);
            if (underMatch) return `${underMatch[1]}-`;
            const overMatch = text.match(/大于\s*<?\s*([0-9.]+)/i);
            if (overMatch) return `${overMatch[1]}+`;
            return text;
        };
        const cardSummaryText =
            allRecordsSettled && hasTotalResultValue
                ? `${formatSignedNumber(totalResultValue)}`
                : hasTotalStakeAmount
                  ? `${totalStakeAmount.toFixed(2)}`
                  : '';
        const getSettlementColorClass = (value: number | null | undefined) => {
            if (!Number.isFinite(value)) return 'text-slate-500';
            if ((value as number) > 0) return 'text-rose-300';
            if ((value as number) < 0) return 'text-emerald-300';
            return 'text-slate-300';
        };
        const cardSummaryColorClass =
            allRecordsSettled && hasTotalResultValue
                ? getSettlementColorClass(totalResultValue)
                : cardSummaryText
                  ? 'text-cyan-300'
                  : 'text-slate-500';
        const groupedStakeBySelection = Array.from(
            sideRecords.reduce((map, record) => {
                const rawLabel = String(record.actualSelectionLabel || record.selectionLabel || '').trim() || optionLabel;
                const label = formatCompactSelectionLabel(rawLabel);
                const stake = Number(record.actualStakeAmount);
                const current = map.get(label) || { label, totalStake: 0, updatedAt: '' };
                if (Number.isFinite(stake) && stake >= 0) {
                    current.totalStake += stake;
                }
                const updatedAt = String(record.createdAt || '');
                if (updatedAt && (!current.updatedAt || new Date(updatedAt).getTime() > new Date(current.updatedAt).getTime())) {
                    current.updatedAt = updatedAt;
                }
                map.set(label, current);
                return map;
            }, new Map<string, { label: string; totalStake: number; updatedAt: string }>())
            .values(),
        ).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        const groupedResultBySelection = Array.from(
            sideRecords.reduce((map, record) => {
                const rawLabel = String(record.actualSelectionLabel || record.selectionLabel || '').trim() || optionLabel;
                const label = formatCompactSelectionLabel(rawLabel);
                const result = Number(record.resultValue);
                const current = map.get(label) || { label, totalResult: 0, updatedAt: '' };
                if (Number.isFinite(result)) {
                    current.totalResult += result;
                }
                const updatedAt = String(record.createdAt || '');
                if (updatedAt && (!current.updatedAt || new Date(updatedAt).getTime() > new Date(current.updatedAt).getTime())) {
                    current.updatedAt = updatedAt;
                }
                map.set(label, current);
                return map;
            }, new Map<string, { label: string; totalResult: number; updatedAt: string }>())
            .values(),
        ).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        const lossBadge = getTodayLossStreakForCard(side);
        const winBadge = getTodayWinStreakForCard(side);
        const lossBadgeTone = lossBadge ? getLossBadgeTone(lossBadge.streak) : null;
        const winBadgeTone = winBadge ? getWinBadgeTone(winBadge.streak) : null;

        return (
            <div className={`group relative flex-1 rounded-2xl px-3.5 py-3 transition-all hover:bg-slate-800/80 ${panelActive ? 'border border-cyan-400/40 bg-cyan-500/8 shadow-lg shadow-cyan-950/20' : 'bg-slate-900/40'} ${toneClass}`}>
                {lossBadge ? (
                    <div
                        className={`absolute right-3 top-2 rounded-full border px-2 py-0.5 text-[10px] font-black ${lossBadgeTone?.className}`}
                        title={`${lossBadge.label} 按不同小局统计，今天已连续亏损 ${lossBadge.streak} 局`}
                    >
                        连亏 {lossBadge.streak}
                    </div>
                ) : null}
                {winBadge ? (
                    <div
                        className={`absolute ${lossBadge ? 'right-20' : 'right-3'} top-2 rounded-full border px-2 py-0.5 text-[10px] font-black ${winBadgeTone?.className}`}
                        title={`${winBadge.label} 按不同小局统计，今天已连续盈利 ${winBadge.streak} 局`}
                    >
                        连赢 {winBadge.streak}
                    </div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                    {isLeft ? (
                        <>
                            <span className={`min-w-0 truncate text-[10px] font-black uppercase tracking-tight transition-colors ${labelClass}`}>{optionLabel}</span>
                            <span className={`shrink-0 font-mono text-lg font-black transition-colors sm:text-xl ${oddsClass}`}>{oddsText}</span>
                        </>
                    ) : (
                        <>
                            <span className={`shrink-0 font-mono text-lg font-black transition-colors sm:text-xl ${oddsClass}`}>{oddsText}</span>
                            <span className={`min-w-0 truncate text-right text-[10px] font-black uppercase tracking-tight transition-colors ${labelClass}`}>{optionLabel}</span>
                        </>
                    )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-2">
                    <span className={`text-[10px] ${cardSummaryText ? `font-bold ${cardSummaryColorClass}` : 'text-slate-500'}`}>
                        {cardSummaryText}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${panelActive ? 'border border-cyan-400/30 bg-cyan-500/15 text-cyan-200' : 'border border-white/10 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                toggleResultEditor(side, latestRecord || undefined);
                            }}
                        >
                            {latestRecord ? '编辑记录' : '录入结果'}
                        </button>
                    </div>
                </div>
                {sideRecords.length > 0 && (
                    <div className="mt-2 rounded-lg border border-white/5 bg-slate-950/35 px-2.5 py-2 text-[10px] text-slate-400">
                        {allRecordsSettled ? (
                            groupedResultBySelection.length > 0 ? (
                                <div className="space-y-1">
                                    {groupedResultBySelection.map((item) => (
                                        <div key={item.label} className="flex items-center justify-between gap-2">
                                            <span className="min-w-0 truncate font-bold text-slate-300" title={item.label}>
                                                {item.label}
                                            </span>
                                            <span className={`shrink-0 font-bold ${getSettlementColorClass(item.totalResult)}`}>
                                                {formatSignedNumber(item.totalResult)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={`truncate font-bold ${cardSummaryColorClass}`}>
                                    {cardSummaryText || '-'}
                                </div>
                            )
                        ) : groupedStakeBySelection.length > 0 ? (
                            <div className="space-y-1">
                                {groupedStakeBySelection.map((item) => (
                                    <div key={item.label} className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 truncate font-bold text-slate-300" title={item.label}>
                                            {item.label}
                                        </span>
                                        <span className="shrink-0 font-bold text-cyan-300">
                                            {item.totalStake.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="truncate" title={latestRecord ? `${latestRecord.actualSelectionLabel || latestRecord.selectionLabel}` : ''}>
                                {latestRecord ? `最新记录：${latestRecord.actualSelectionLabel || latestRecord.selectionLabel}` : '-'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };
    return (
        <div className="relative min-w-0 flex flex-col gap-2">
            <div className="relative px-1 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                {title}
                {isAdmin && !isEditing && (
                    <button
                        type="button"
                        title="编辑盘口"
                        aria-label="编辑盘口"
                        onClick={() => setIsEditing(true)}
                        className="absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-blue-600/90 text-white shadow-md shadow-blue-900/30 transition-all hover:bg-blue-500"
                    >
                        <EditIcon className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            {isEditing ? (
                <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-2.5 sm:p-3">
                    <div className="grid min-w-0 gap-2">
                        <div className={`grid min-w-0 gap-2 ${type === 'WINNER' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(92px,1fr)_96px_minmax(92px,1fr)]'}`}>
                            <div className="min-w-0">
                                <OddsSplitField
                                    wholeValue={splitOddsParts(leftOdds).whole}
                                    decimalValue={splitOddsParts(leftOdds).decimal}
                                    onWholeChange={(nextWhole) => setLeftOdds(buildOddsValue(nextWhole, splitOddsParts(leftOdds).decimal))}
                                    onDecimalChange={(nextDecimal) => setLeftOdds(buildOddsValue(splitOddsParts(leftOdds).whole, nextDecimal))}
                                    className="h-10 rounded-xl"
                                    compact={type !== 'WINNER'}
                                    wholePlaceholder="-"
                                    decimalPlaceholder="--"
                                />
                            </div>
                            {type !== 'WINNER' && (
                                type === 'HANDICAP' ? (
                                    <div className="flex min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 focus-within:border-cyan-500 sm:col-start-2 xl:col-start-auto">
                                        <button
                                            type="button"
                                            onClick={() => setHandicapSign((prev) => (prev === '+' ? '-' : '+'))}
                                            className="flex w-9 shrink-0 items-center justify-center border-r border-slate-800 text-sm font-black text-cyan-300 hover:bg-slate-800"
                                            title="切换让分正负号"
                                            aria-label="切换让分正负号"
                                        >
                                            {handicapSign}
                                        </button>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            className="h-10 w-full min-w-0 bg-transparent px-2 text-center text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none"
                                            value={threshold}
                                            placeholder="-"
                                            onChange={(event) => setThreshold(event.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1'))}
                                        />
                                    </div>
                                ) : (
                                    <PrefixedNumericField
                                        value={threshold}
                                        onChange={setThreshold}
                                        placeholder="-"
                                        className="h-10 rounded-xl sm:col-start-2 xl:col-start-auto"
                                    />
                                )
                            )}
                            <div className={`min-w-0 ${type === 'WINNER' ? '' : 'sm:col-span-2 xl:col-span-1'}`}>
                                <OddsSplitField
                                    wholeValue={splitOddsParts(rightOdds).whole}
                                    decimalValue={splitOddsParts(rightOdds).decimal}
                                    onWholeChange={(nextWhole) => setRightOdds(buildOddsValue(nextWhole, splitOddsParts(rightOdds).decimal))}
                                    onDecimalChange={(nextDecimal) => setRightOdds(buildOddsValue(splitOddsParts(rightOdds).whole, nextDecimal))}
                                    className="h-10 rounded-xl"
                                    compact={type !== 'WINNER'}
                                    wholePlaceholder="-"
                                    decimalPlaceholder="--"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                onClick={handleSaveOdds}
                                disabled={loading}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white font-black text-slate-900 shadow-lg transition-all hover:bg-slate-100"
                            >
                                {loading ? '..' : '\u2713'}
                            </button>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-slate-800 font-black text-slate-400 shadow-sm transition-all hover:bg-slate-700 hover:text-white"
                            >
                                {'\u2715'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        {renderOption('LEFT')}
                        {renderOption('RIGHT')}
                    </div>
                    {editorSide && (
                        <div className="mt-2 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3">
                            {(() => {
                                const liveThreshold = buildDraftThresholdValue(
                                    type,
                                    editorSide,
                                    actualThresholdInput,
                                    effectiveOddsData.threshold ?? null,
                                    actualThresholdSign,
                                );
                                const editorLabel = getOptionLabel(type, editorSide, teamAName, teamBName, liveThreshold);
                                const editorRecords = getSideRecords(editorSide);
                                const activeRecord = editingRecordId ? editorRecords.find((record) => record.id === editingRecordId) : undefined;
                                return (
                                    <>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                                                {"\u5b9e\u76d8\u7ed3\u679c\u5f55\u5165"} · {editorLabel}
                                            </div>
                                            {editorRecords.length > 0 ? (
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-200 transition-all hover:bg-cyan-500/20"
                                                    onClick={() => startCreateResult(editorSide)}
                                                >
                                                    {"\u65b0\u589e\u8bb0\u5f55"}
                                                </button>
                                            ) : null}
                                        </div>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(132px,auto)] sm:items-end">
                                            <label className="block">
                                                <HelpTooltipLabel label={"\u6295\u6ce8\u91d1\u989d"} tip={"\u586b\u5199\u4f60\u8fd9\u6b21\u771f\u5b9e\u4e0b\u6ce8\u91d1\u989d\u3002\u7559\u7a7a\u4fdd\u5b58\u65f6\u6309 0 \u5904\u7406\u3002"} />
                                                <input
                                                    ref={stakeInputRef}
                                                    type="text"
                                                    inputMode="decimal"
                                                    className="h-11 w-full min-w-0 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                    value={resultInput}
                                                    placeholder="-"
                                                    onChange={(event) => setResultInput(event.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1'))}
                                                />
                                            </label>
                                            <div className="min-w-[132px]">
                                                <HelpTooltipLabel label={"赛果自动判定"} tip={"\u4e0d\u518d\u624b\u52a8\u9009\u62e9\u8d62\u8f93\u8d70\u5f85\u3002\u7cfb\u7edf\u4f1a\u6839\u636e\u8d5b\u679c\u548c\u5b9e\u76d8\u53e3\u7ebf\u81ea\u52a8\u5224\u65ad\uff1b\u5982\u679c\u8d5b\u679c\u672a\u51fa\uff0c\u5219\u81ea\u52a8\u8bb0\u4e3a\u5f85\u3002"} />
                                                <div className="flex h-11 items-center justify-between rounded-lg border border-white/10 bg-slate-900 px-3 text-xs">
                                                    <span className="text-slate-400">{"\u5f53\u524d\u5224\u5b9a"}</span>
                                                    <span className="font-black text-cyan-200">{getStatusLabel(getAutoSettledStatus(editorSide, liveThreshold))}</span>
                                                </div>
                                            </div>
                                        </div>
                            <div
                                className={`mt-3 grid gap-2 ${
                                    type === 'WINNER'
                                        ? 'grid-cols-1 sm:grid-cols-2'
                                        : 'grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]'
                                }`}
                            >
                                {type !== 'WINNER' ? (
                                    <label className="block">
                                        <HelpTooltipLabel label="实盘口线" tip={type === 'HANDICAP' ? '这里可以手动切换 + / -，因为实盘时同一队伍可能从让分变成受让。你只需要填写盘口数字本体。' : '填写你实际买到的盘口线。留空保存时按 0。'} />
                                        {type === 'HANDICAP' ? (
                                            <div className="flex min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 focus-within:border-cyan-500">
                                                <button
                                                    type="button"
                                                    onClick={() => setActualThresholdSign((prev) => (prev === '+' ? '-' : '+'))}
                                                    className="flex w-10 shrink-0 items-center justify-center border-r border-slate-800 text-sm font-black text-cyan-300 hover:bg-slate-800"
                                                    title="切换实盘口线正负号"
                                                    aria-label="切换实盘口线正负号"
                                                >
                                                    {actualThresholdSign}
                                                </button>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    className="h-10 w-full min-w-0 bg-transparent px-3 text-center text-sm text-white placeholder:text-slate-500 focus:outline-none"
                                                    value={actualThresholdInput}
                                                    placeholder="-"
                                                    onChange={(event) => setActualThresholdInput(event.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1'))}
                                                />
                                            </div>
                                        ) : (
                                            <PrefixedNumericField
                                                value={actualThresholdInput}
                                                onChange={setActualThresholdInput}
                                                placeholder="-"
                                            />
                                        )}
                                    </label>
                                ) : null}
                                <label className="block">
                                    <HelpTooltipLabel label="实盘赔率" tip="赔率统一按 1.x 亚洲盘口径录入与计算。1.80 表示盈利 80%，1.23 表示盈利 23%，2.23 表示盈利 123%。历史旧值 0.80 会按 1.80 解释。留空保存时按 0。" />
                                    <OddsSplitField
                                        wholeValue={actualOddsWholeInput}
                                        decimalValue={actualOddsDecimalInput}
                                        wholePlaceholder="-"
                                        decimalPlaceholder="---"
                                        onWholeChange={setActualOddsWholeInput}
                                        onDecimalChange={setActualOddsDecimalInput}
                                    />
                                </label>
                                <label className="block">
                                    <HelpTooltipLabel label="实盘来源 / 平台" tip="记录这笔实盘来自哪个平台或场景，例如 Pinnacle、赛中、补仓等。" />
                                    <input
                                        type="text"
                                        className="h-10 w-full min-w-0 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                        value={actualProviderInput}
                                        placeholder="例如 Pinnacle / 某平台"
                                        onChange={(event) => setActualProviderInput(event.target.value)}
                                    />
                                </label>
                            </div>
                            <textarea
                                rows={3}
                                className="mt-2 w-full resize-y rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                value={resultDetail}
                                placeholder="详细记录：这个盘口最终结果说明（可选）"
                                onChange={(event) => setResultDetail(event.target.value)}
                            />
                            {editorRecords.length > 0 ? (
                                <div className="mt-2 rounded-lg border border-white/8 bg-slate-950/45 p-2 text-[11px] text-slate-400">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="font-bold text-slate-300">该选项已录入 {editorRecords.length} 条实盘记录</div>
                                        <div className="text-[10px] text-slate-500">点击记录可直接回改</div>
                                    </div>
                                    <div className="space-y-1.5">
                                        {editorRecords.slice(0, 4).map((record, index) => (
                                            <button
                                                key={record.id}
                                                type="button"
                                                onClick={() => startEditResult(editorSide, record.id)}
                                                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left transition-all ${
                                                    activeRecord?.id === record.id
                                                        ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
                                                        : 'border-white/8 bg-slate-900/80 text-slate-300 hover:border-white/15 hover:bg-slate-900'
                                                }`}
                                            >
                                                <span className="min-w-0 truncate">
                                                    #{index + 1} · {record.actualSelectionLabel || record.selectionLabel} · 投注 {Number.isFinite(record.actualStakeAmount) ? record.actualStakeAmount : 0}
                                                </span>
                                                <span className={`shrink-0 font-bold ${Number(record.resultValue || 0) > 0 ? 'text-rose-300' : Number(record.resultValue || 0) < 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                                                    {Number.isFinite(record.resultValue) ? formatSignedNumber(record.resultValue as number) : '0'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <div className="mt-3 flex items-center justify-end gap-2">
                                {activeRecord && (
                                    <button
                                        type="button"
                                        className="h-9 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                                        onClick={() => {
                                            if (activeRecord) onDeleteResult(activeRecord.id);
                                            setEditingRecordId('');
                                            setEditorSide(null);
                                        }}
                                    >
                                        删除记录
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="h-9 rounded-lg border border-white/10 bg-slate-800 px-3 text-xs font-bold text-slate-300 hover:bg-slate-700"
                                    onClick={() => {
                                        setEditingRecordId('');
                                        setEditorSide(null);
                                    }}
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    className="h-9 rounded-lg bg-cyan-500 px-3 text-xs font-black text-slate-950 hover:bg-cyan-400"
                                    onClick={saveResult}
                                    title="Ctrl+Enter / Ctrl+S"
                                >
                                    {activeRecord ? '保存修改' : '保存结果'}
                                </button>
                            </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function OddsManager({
    matchId,
    initialOdds,
    games = [],
    teamA,
    teamB,
    activeGameNumber = 1,
    isAdmin = false,
    matchStartTime,
    tournament,
    stage,
}: OddsManagerProps) {
    const router = useRouter();
    const [records, setRecords] = useState<StoredOddsResult[]>([]);
    const [allRecords, setAllRecords] = useState<StoredOddsResult[]>([]);
    const reloadRecordsRef = useRef<(() => Promise<void>) | null>(null);

    const migrateLegacyManualOdds = async () => {
        if (typeof window === 'undefined') return;
        if (window.localStorage.getItem(LEGACY_MANUAL_ODDS_MIGRATION_KEY) === '1') return;

        const legacyRecords = loadAllLegacyStoredOdds();
        if (legacyRecords.length === 0) {
            window.localStorage.setItem(LEGACY_MANUAL_ODDS_MIGRATION_KEY, '1');
            return;
        }

        const result = await mergeLegacyManualOddsRecords(legacyRecords);
        if (result.inserted >= 0) {
            window.localStorage.setItem(LEGACY_MANUAL_ODDS_MIGRATION_KEY, '1');
        }
    };

    useEffect(() => {
        let cancelled = false;

        const reload = async () => {
            try {
                await migrateLegacyManualOdds();
                const [matchRecords, nextAllRecords] = await Promise.all([
                    fetchManualOddsForMatch(matchId),
                    fetchManualOddsRecords(),
                ]);
                if (cancelled) return;
                setRecords(matchRecords);
                setAllRecords(nextAllRecords);
            } catch (error) {
                console.error('manual odds reload failed', error);
            }
        };

        reloadRecordsRef.current = reload;
        void reload();
        return () => {
            cancelled = true;
            reloadRecordsRef.current = null;
        };
    }, [matchId]);

    useEffect(() => {
        if (records.length === 0) return;

        const reconciled = records.map((record) => reconcileStoredOddsRecordFromGames(record, games));
        const changed = reconciled.some((record, index) => {
            const current = records[index];
            return record.settledStatus !== current.settledStatus || record.resultValue !== current.resultValue;
        });

        if (!changed) return;
        void saveRecords(reconciled);
    }, [games, records]);

    const teamAName = getTeamLabel(teamA);
    const teamBName = getTeamLabel(teamB);
    const activeGame = games.find((game) => game.gameNumber === activeGameNumber);

    const refreshData = () => router.refresh();
    const getOddsByType = (type: string) => initialOdds.find((odds) => odds.type === type && odds.gameNumber === activeGameNumber);

    const saveRecords = async (next: StoredOddsResult[]) => {
        setRecords(next);
        try {
            const saveResult = await replaceManualOddsForMatchSafe(matchId, next);
            if (!saveResult.success) {
                throw new Error(saveResult.error);
            }
            const saved = saveResult.records;
            const nextAllRecords = await fetchManualOddsRecords();
            setRecords(saved);
            setAllRecords(nextAllRecords);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('manual-odds-updated'));
            }
        } catch (error) {
            console.error('manual odds save failed', error);
            alert(`盘口记录保存失败：${error instanceof Error ? error.message : '未知错误'}`);
            await reloadRecordsRef.current?.();
        }
    };

    const upsertResult = async (draft: ResultDraft) => {
        const resultValue = Number.isFinite(draft.resultValue) ? draft.resultValue : undefined;
        const existingIndex = draft.recordId ? records.findIndex((item) => item.id === draft.recordId) : -1;

        const nextRecord: StoredOddsResult = {
            id: existingIndex >= 0 ? records[existingIndex].id : draft.recordId || createStoredOddsId(),
            matchId,
            gameNumber: draft.gameNumber,
            type: draft.type,
            side: draft.side,
            threshold: draft.threshold,
            selectionLabel: draft.selectionLabel,
            detail: draft.detail,
            createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : new Date().toISOString(),
            resultValue,
            settledStatus: draft.settledStatus || getStatusFromResultValue(resultValue),
            oddsValue: Number.isFinite(draft.oddsValue) && (draft.oddsValue as number) > 0 ? draft.oddsValue : undefined,
            oppositeOddsValue:
                Number.isFinite(draft.oppositeOddsValue) && (draft.oppositeOddsValue as number) > 0 ? draft.oppositeOddsValue : undefined,
            provider: draft.provider,
            actualThreshold: draft.actualThreshold === null ? null : (Number.isFinite(draft.actualThreshold) ? draft.actualThreshold : undefined),
            actualSelectionLabel: draft.actualSelectionLabel?.trim() || undefined,
            actualOddsRaw: Number.isFinite(draft.actualOddsRaw) && (draft.actualOddsRaw as number) > 0 ? draft.actualOddsRaw : undefined,
            actualOddsNormalized:
                Number.isFinite(draft.actualOddsNormalized) && (draft.actualOddsNormalized as number) > 0 ? draft.actualOddsNormalized : undefined,
            actualOddsFormat: draft.actualOddsFormat,
            actualProvider: draft.actualProvider?.trim() || undefined,
            actualStakeAmount:
                Number.isFinite(draft.actualStakeAmount) && (draft.actualStakeAmount as number) >= 0 ? draft.actualStakeAmount : undefined,
            teamAId: teamA?.id,
            teamBId: teamB?.id,
            teamAName: teamA?.name,
            teamBName: teamB?.name,
            teamARegion: teamA?.region || undefined,
            teamBRegion: teamB?.region || undefined,
            matchStartTime: matchStartTime || undefined,
            tournament: tournament || undefined,
            stage: stage || undefined,
        };

        if (existingIndex >= 0) {
            const next = [...records];
            next[existingIndex] = nextRecord;
            await saveRecords(next);
            return;
        }

        await saveRecords([...records, nextRecord]);
    };

    const deleteResult = async (recordId: string) => {
        await saveRecords(records.filter((item) => item.id !== recordId));
    };

    const getRecordsForCard = (type: OddsType, side: BetSide) =>
        records
            .filter((item) => item.type === type && item.gameNumber === activeGameNumber && item.side === side)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const summaries = useMemo(() => {
        return [teamA, teamB]
            .filter((team): team is TeamInfo => !!team)
            .map((team) => buildTeamOddsSummary(allRecords, team));
    }, [allRecords, teamA, teamB]);

    const [activeSummaryTeamId, setActiveSummaryTeamId] = useState('');

    useEffect(() => {
        if (summaries.length === 0) {
            setActiveSummaryTeamId('');
            return;
        }
        if (summaries.some((summary) => summary.teamId === activeSummaryTeamId)) return;
        setActiveSummaryTeamId(summaries[0].teamId);
    }, [activeSummaryTeamId, summaries]);

    const activeSummary = summaries.find((summary) => summary.teamId === activeSummaryTeamId) || summaries[0] || null;
    const readinessSummary = useMemo(() => summarizeRealOddsReadiness(records), [records]);

    return (
        <div className="glass rounded-3xl px-3 py-5 xl:px-3 2xl:px-3.5">
            <div className={`mb-4 rounded-2xl border p-4 ${getReadinessTone(readinessSummary.stage)}`}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em]">真实数据录入规范</div>
                        <div className="mt-2 text-sm leading-6 opacity-95">{readinessSummary.stageLabel}。{readinessSummary.stageMessage}</div>
                    </div>
                    <div className="rounded-2xl border border-current/20 bg-black/10 px-3 py-2 text-xs leading-6">
                        <div>当前比赛记录：{readinessSummary.totalRecords} 条</div>
                        <div>完整真实样本：{readinessSummary.effectiveRecords} 条</div>
                        <div>记录完整度：{Math.round(readinessSummary.readyRate * 100)}%</div>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
                    <div className="rounded-2xl border border-current/15 bg-black/10 px-3 py-2 text-xs leading-6">
                        缺投注金额 {readinessSummary.missingStakeCount} 条，缺结算结果 {readinessSummary.missingSettlementCount} 条，缺实盘赔率 {readinessSummary.missingOddsCount} 条。
                    </div>
                    <div className="rounded-2xl border border-current/15 bg-black/10 px-3 py-2 text-xs leading-6">
                        缺平台来源 {readinessSummary.missingProviderCount} 条，缺实盘口线 {readinessSummary.missingLineCount} 条。{readinessSummary.nextTargetCount !== null ? `下一阶段目标 ${readinessSummary.nextTargetCount} 条完整真实样本。` : '当前已达到稳定样本阶段。'}
                    </div>
                    <div className="rounded-2xl border border-current/15 bg-black/10 px-3 py-2 text-xs leading-6">
                        {REAL_ODDS_FIELD_RULES.map((rule) => rule.label).join(' / ')} 这几项越完整，后面策略中心的样本可信度越高。
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,3fr)_minmax(0,2fr)] xl:items-start 2xl:grid-cols-[minmax(420px,3fr)_minmax(0,2fr)]">
                <div className="min-w-0 space-y-3">
                    {activeSummary && (
                        <div className="rounded-2xl border border-white/10 bg-slate-900/35 p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">队伍盘口统计</div>
                                    <div className="mt-1 text-xs text-slate-400">和盘口录入区并排显示，切换查看单队结果。</div>
                                </div>
                                <div className="text-xs text-slate-500">当前比赛: Game {activeGameNumber}</div>
                            </div>
                            {summaries.length > 1 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {summaries.map((summary) => {
                                        const active = summary.teamId === activeSummary.teamId;
                                        return (
                                            <button
                                                key={summary.teamId}
                                                type="button"
                                                onClick={() => setActiveSummaryTeamId(summary.teamId)}
                                                className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${
                                                    active
                                                        ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-950/20'
                                                        : 'border border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/20 hover:text-white'
                                                }`}
                                            >
                                                {summary.teamName}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="mt-3">
                                <TeamOddsSummaryCard
                                    summary={activeSummary}
                                    compact
                                    subtitle="当前队伍历史盘口结果（按单队，不按交手对阵聚合）"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex flex-col gap-4">
                    <OddsCard
                        type="WINNER"
                        title="单局 - 胜负"
                        oddsData={getOddsByType('WINNER')}
                        matchId={matchId}
                        gameNumber={activeGameNumber}
                        isAdmin={!!isAdmin}
                        onRefresh={refreshData}
                        teamAName={teamAName}
                        teamBName={teamBName}
                        activeGame={activeGame}
                        teamAId={teamA?.id}
                        teamBId={teamB?.id}
                        currentLeftRecords={getRecordsForCard('WINNER', 'LEFT')}
                        currentRightRecords={getRecordsForCard('WINNER', 'RIGHT')}
                        allRecords={allRecords}
                        matchStartTime={matchStartTime}
                        onUpsertResult={upsertResult}
                        onDeleteResult={deleteResult}
                    />
                    <OddsCard
                        type="HANDICAP"
                        title="击杀让分"
                        oddsData={getOddsByType('HANDICAP')}
                        matchId={matchId}
                        gameNumber={activeGameNumber}
                        isAdmin={!!isAdmin}
                        onRefresh={refreshData}
                        teamAName={teamAName}
                        teamBName={teamBName}
                        activeGame={activeGame}
                        teamAId={teamA?.id}
                        teamBId={teamB?.id}
                        currentLeftRecords={getRecordsForCard('HANDICAP', 'LEFT')}
                        currentRightRecords={getRecordsForCard('HANDICAP', 'RIGHT')}
                        allRecords={allRecords}
                        matchStartTime={matchStartTime}
                        onUpsertResult={upsertResult}
                        onDeleteResult={deleteResult}
                    />
                    <OddsCard
                        type="KILLS"
                        title="总击杀大小"
                        oddsData={getOddsByType('KILLS')}
                        matchId={matchId}
                        gameNumber={activeGameNumber}
                        isAdmin={!!isAdmin}
                        onRefresh={refreshData}
                        teamAName={teamAName}
                        teamBName={teamBName}
                        activeGame={activeGame}
                        teamAId={teamA?.id}
                        teamBId={teamB?.id}
                        currentLeftRecords={getRecordsForCard('KILLS', 'LEFT')}
                        currentRightRecords={getRecordsForCard('KILLS', 'RIGHT')}
                        allRecords={allRecords}
                        matchStartTime={matchStartTime}
                        onUpsertResult={upsertResult}
                        onDeleteResult={deleteResult}
                    />
                    <OddsCard
                        type="TIME"
                        title="比赛时长大小"
                        oddsData={getOddsByType('TIME')}
                        matchId={matchId}
                        gameNumber={activeGameNumber}
                        isAdmin={!!isAdmin}
                        onRefresh={refreshData}
                        teamAName={teamAName}
                        teamBName={teamBName}
                        activeGame={activeGame}
                        teamAId={teamA?.id}
                        teamBId={teamB?.id}
                        currentLeftRecords={getRecordsForCard('TIME', 'LEFT')}
                        currentRightRecords={getRecordsForCard('TIME', 'RIGHT')}
                        allRecords={allRecords}
                        matchStartTime={matchStartTime}
                        onUpsertResult={upsertResult}
                        onDeleteResult={deleteResult}
                    />
                </div>
            </div>
        </div>
    );
}















