'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    searchMatches,
    deleteMatch,
    importFromWiki,
    refreshPlayoffBracket,
    MatchFormData,
    updateMatchStage,
    bulkUpdateMatches,
} from './actions';
import MatchEditModal from '@/components/admin/MatchEditModal';
import ManualSchedulePlannerModal from '@/components/admin/ManualSchedulePlannerModal';
import type { MatchStageOption } from '@/lib/config-shared';

type Team = { id: string; name: string; shortName: string | null; region: string };

const SYNC_PRESETS = {
    LPL: {
        scoreggTournamentId: '922',
        tournamentInput: '',
        sourceStageName: '',
        sourceStagePhase: '',
        localTournament: '2026 第一赛段',
        defaultFormat: 'BO3',
    },
    LCK: {
        scoreggTournamentId: '927',
        tournamentInput: '',
        sourceStageName: '',
        sourceStagePhase: '',
        localTournament: '2026 LCK杯',
        defaultFormat: 'BO3',
    },
    OTHER: {
        scoreggTournamentId: '931',
        tournamentInput: '',
        sourceStageName: '',
        sourceStagePhase: '',
        localTournament: '2026 lec春季赛',
        defaultFormat: 'BO3',
    },
    WORLDS: {
        scoreggTournamentId: '',
        tournamentInput: '',
        sourceStageName: '',
        sourceStagePhase: '',
        localTournament: '2026 全球先锋赛',
        defaultFormat: 'BO5',
    },
};

function EditIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

function getStatusLabel(status?: string | null): string {
    switch (String(status || '').toUpperCase()) {
        case 'LIVE':
            return '\u8fdb\u884c\u4e2d';
        case 'FINISHED':
        case 'COMPLETED':
            return '\u5df2\u7ed3\u675f';
        case 'SCHEDULED':
        default:
            return '\u672a\u5f00\u8d5b';
    }
}

function toBeijingInputValue(isoString: string | Date | null | undefined): string {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    const beijingMs = d.getTime() + 8 * 60 * 60 * 1000;
    const bj = new Date(beijingMs);
    const yyyy = bj.getUTCFullYear();
    const MM = String(bj.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(bj.getUTCDate()).padStart(2, '0');
    const hh = String(bj.getUTCHours()).padStart(2, '0');
    const mm = String(bj.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

export default function ScheduleManagerClient({
    initialMatches,
    teams,
    existingTournaments,
    systemRegions,
    stageOptions,
    localOnly = true,
}: {
    initialMatches: any[];
    teams: Team[];
    existingTournaments: string[];
    systemRegions?: string[];
    stageOptions?: MatchStageOption[];
    localOnly?: boolean;
}) {
    const showLegacyManualPlanner = false;
    const [matches, setMatches] = useState(initialMatches);
    const [loading, setLoading] = useState(false);
    const [stageUpdatingId, setStageUpdatingId] = useState<string | null>(null);

    const [filterDate, setFilterDate] = useState('');
    const [filterDateMode, setFilterDateMode] = useState<'ON' | 'BEFORE' | 'AFTER'>('ON');
    const [filterStatus, setFilterStatus] = useState<'RECENT' | 'ALL' | 'FINISHED'>('RECENT');
    const [filterRegion, setFilterRegion] = useState('');
    const [filterTournament, setFilterTournament] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
    const [isPlayoffRefreshOpen, setIsPlayoffRefreshOpen] = useState(false);
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [isManualPlannerOpen, setIsManualPlannerOpen] = useState(false);
    const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
    const [bulkTournament, setBulkTournament] = useState('');
    const [bulkStage, setBulkStage] = useState('');
    const [bulkFormat, setBulkFormat] = useState('');
    const [bulkStatus, setBulkStatus] = useState('');
    const [bulkGameVersion, setBulkGameVersion] = useState('');
    const [bulkClearVersion, setBulkClearVersion] = useState(false);

    const [playoffRefreshTournament, setPlayoffRefreshTournament] = useState('');
    const [playoffRefreshLocalTournament, setPlayoffRefreshLocalTournament] = useState('');
    const [playoffRefreshResult, setPlayoffRefreshResult] = useState<any>(null);

    const [wikiTournament, setWikiTournament] = useState('');
    const [editingMatch, setEditingMatch] = useState<MatchFormData | null>(null);
    const [pendingDeleteMatch, setPendingDeleteMatch] = useState<any | null>(null);
    const filterDateRef = useRef<HTMLInputElement | null>(null);

    const regions: string[] = useMemo(
        () =>
            (systemRegions ||
                Array.from(
                    new Set(
                        teams.flatMap((t) =>
                            (t.region || '')
                                .split(',')
                                .map((s) => s.trim().split(/[\s,]+/)[0])
                                .filter(Boolean),
                        ),
                    ),
                ))
                .filter((r): r is string => !!r && r.length > 1 && !/^\d+$/.test(r))
                .sort(),
        [systemRegions, teams],
    );
    const defaultRegularStage = useMemo(() => {
        const options = stageOptions || [];
        const found = options.find((opt) => (opt.enabled !== false) && opt.category !== 'playoff');
        return found?.id || 'Regular Season';
    }, [stageOptions]);
    const stageLabelMap = useMemo(() => {
        return new Map((stageOptions || []).map((s) => [s.id, s.label || s.id]));
    }, [stageOptions]);
    const enabledStageOptions = useMemo(
        () => (stageOptions || []).filter((opt) => opt.enabled !== false),
        [stageOptions],
    );

    const availableTournaments = useMemo(
        () =>
            filterRegion
                ? existingTournaments.filter(
                      (t) => t.toLowerCase().includes(filterRegion.toLowerCase()) || filterRegion === '其他',
                  )
                : existingTournaments,
        [existingTournaments, filterRegion],
    );

    const flattenedMatches = useMemo(
        () =>
            [...matches].sort((a, b) => {
                if (!a.startTime && !b.startTime) return 0;
                if (!a.startTime) return 1;
                if (!b.startTime) return -1;
                return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
            }),
        [matches],
    );

    const selectableMatchIds = useMemo(
        () => flattenedMatches.map((m: any) => m.id).filter(Boolean),
        [flattenedMatches],
    );
    const allVisibleSelected = useMemo(
        () => selectableMatchIds.length > 0 && selectableMatchIds.every((id) => selectedMatchIds.includes(id)),
        [selectableMatchIds, selectedMatchIds],
    );

    useEffect(() => {
        setSelectedMatchIds((prev) => prev.filter((id) => selectableMatchIds.includes(id)));
    }, [selectableMatchIds]);
    const normalizeRegionCode = (raw?: string | null): 'LPL' | 'LCK' | 'OTHER' | 'WORLDS' | '' => {
        const text = String(raw || '')
            .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
            .trim();
        const upper = text.toUpperCase();
        if (!upper) return '';
        if (upper.includes('LPL')) return 'LPL';
        if (upper.includes('LCK')) return 'LCK';
        if (upper.includes('WORLDS') || upper.includes('WORLD') || upper.includes('MSI') || text.includes('\u4E16\u754C\u8D5B') || text.includes('\u5168\u7403\u5148\u950B\u8D5B')) return 'WORLDS';
        if (upper.includes('OTHER') || upper.includes('LEC') || upper.includes('LCS') || upper.includes('LTA') || upper.includes('CBLOL') || upper.includes('LJL') || upper.includes('LLA') || upper.includes('LCP') || upper.includes('PCS') || upper.includes('VCS') || upper.includes('TCL') || text.includes('\u5176\u5B83\u8D5B\u533A') || text.includes('\u5176\u4ED6\u8D5B\u533A')) return 'OTHER';
        return '';
    };

    const getMatchRegion = (m: any) => {
        const tournament = String(m.tournament || '');
        const fromTournament = normalizeRegionCode(tournament);
        if (fromTournament) return fromTournament;

        const fromTeam = normalizeRegionCode(m.teamA?.region) || normalizeRegionCode(m.teamB?.region);
        if (fromTeam) return fromTeam;

        const sortedRegions = [...regions]
            .map((r) => normalizeRegionCode(r) || r)
            .sort((a, b) => b.length - a.length);
        for (const r of sortedRegions) {
            if (String(r) && tournament.toUpperCase().includes(String(r).toUpperCase())) return String(r);
        }

        return 'OTHER';
    };
    const openDatePicker = () => {
        const input = filterDateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        if (!input) return;
        try {
            if (typeof input.showPicker === 'function') {
                input.showPicker();
            } else {
                input.focus();
            }
        } catch {
            input.focus();
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        const dateParam = filterDate || undefined;
        const regionParam = filterTournament || filterRegion;
        const res = await searchMatches(dateParam, regionParam, {
            dateMode: filterDateMode,
            statusFilter: filterStatus,
        });
        if (res.success && res.matches) {
            setMatches(res.matches);
        } else {
            alert('\u641c\u7d22\u5931\u8d25: ' + res.error);
        }
        setLoading(false);
    };

    const handleSaveSuccess = async (savedMatch?: any) => {
        if (!savedMatch || !savedMatch.id) return;

        setMatches((prev) => {
            const existingIndex = prev.findIndex((m: any) => m.id === savedMatch.id);
            if (existingIndex >= 0) {
                const next = [...prev];
                next[existingIndex] = { ...next[existingIndex], ...savedMatch };
                return next;
            }
            return [savedMatch, ...prev];
        });
    };

    const handleEdit = (match: any) => {
        setEditingMatch({
            id: match.id,
            startTime: match.startTime ? toBeijingInputValue(match.startTime) : '',
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            status: match.status,
            format: match.format,
            tournament: match.tournament,
            stage: match.stage,
            gameVersion: match.gameVersion || '',
        });
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        const now = new Date();
        now.setHours(17, 0, 0, 0);
        setEditingMatch({
            startTime: toBeijingInputValue(now),
            teamAId: '',
            teamBId: '',
            status: 'SCHEDULED',
            format: 'BO3',
            tournament: `2026 ${filterRegion || 'LPL'} Split 1`,
            stage: defaultRegularStage,
            gameVersion: '',
        });
        setIsModalOpen(true);
    };

    
    const requestDelete = (match: any) => {
        setPendingDeleteMatch(match);
    };

    const handleDeleteConfirm = async () => {
        if (!pendingDeleteMatch?.id) return;
        const id = pendingDeleteMatch.id;
        setPendingDeleteMatch(null);
        const snapshot = matches;
        setMatches((prev) => prev.filter((m: any) => m.id !== id));
        setLoading(true);
        const res = await deleteMatch(id);
        if (!res.success) {
            setMatches(snapshot);
            alert('删除失败: ' + res.error);
        }
        setLoading(false);
    };
    const handleQuickUpdateStage = async (matchId: string, nextStage: string) => {
        const snapshot = matches;
        setStageUpdatingId(matchId);
        setMatches((prev) =>
            prev.map((m: any) =>
                m.id === matchId
                    ? { ...m, stage: nextStage }
                    : m,
            ),
        );
        const res = await updateMatchStage(matchId, nextStage);
        if (!res.success) {
            setMatches(snapshot);
            alert('阶段更新失败: ' + res.error);
        }
        setStageUpdatingId(null);
    };

    const handleBulkApply = async () => {
        if (selectedMatchIds.length === 0) {
            alert('请先勾选需要批量修改的比赛');
            return;
        }

        const updates: any = {};
        if (bulkTournament.trim()) updates.tournament = bulkTournament.trim();
        if (bulkStage.trim()) updates.stage = bulkStage.trim();
        if (bulkFormat.trim()) updates.format = bulkFormat.trim().toUpperCase();
        if (bulkStatus.trim()) updates.status = bulkStatus.trim().toUpperCase();

        if (bulkClearVersion) {
            updates.clearGameVersion = true;
        } else if (bulkGameVersion.trim()) {
            updates.gameVersion = bulkGameVersion.trim();
        }

        if (Object.keys(updates).length === 0) {
            alert('\u8bf7\u81f3\u5c11\u586b\u5199\u4e00\u4e2a\u9700\u8981\u6279\u91cf\u4fee\u6539\u7684\u5b57\u6bb5');
            return;
        }

        if (!(await confirmAction('将批量更新已勾选的 ' + selectedMatchIds.length + ' 场比赛，是否继续？'))) {
            return;
        }

        const localPatch: Record<string, any> = {};
        if (updates.tournament) localPatch.tournament = updates.tournament;
        if (updates.stage) localPatch.stage = updates.stage;
        if (updates.format) localPatch.format = updates.format;
        if (updates.status) localPatch.status = updates.status;
        if (updates.clearGameVersion) {
            localPatch.gameVersion = null;
        } else if (updates.gameVersion) {
            localPatch.gameVersion = updates.gameVersion;
        }

        setLoading(true);
        const res = await bulkUpdateMatches(selectedMatchIds, updates);
        if (!res.success) {
            alert('\u6279\u91cf\u4fee\u6539\u5931\u8d25: ' + res.error);
            setLoading(false);
            return;
        }

        alert('\u6279\u91cf\u4fee\u6539\u5b8c\u6210\uff1a\u5df2\u66f4\u65b0 ' + res.count + ' \u573a\u6bd4\u8d5b');
        const idSet = new Set(selectedMatchIds);
        setMatches((prev) =>
            prev.map((m: any) => (idSet.has(m.id) ? { ...m, ...localPatch } : m)),
        );
        setSelectedMatchIds([]);
        setIsBulkEditOpen(false);
        setBulkTournament('');
        setBulkStage('');
        setBulkFormat('');
        setBulkStatus('');
        setBulkGameVersion('');
        setBulkClearVersion(false);
        setLoading(false);
    };

    const toggleMatchSelection = (matchId: string) => {
        setSelectedMatchIds((prev) =>
            prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId],
        );
    };

    const toggleSelectAllVisible = () => {
        setSelectedMatchIds((prev) => {
            if (allVisibleSelected) {
                return prev.filter((id) => !selectableMatchIds.includes(id));
            }

            return Array.from(new Set([...prev, ...selectableMatchIds]));
        });
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white min-h-[600px]">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                <h1 className="text-2xl font-bold">赛程列表</h1>
                <div className="flex flex-wrap gap-2">
                    {!localOnly && (
                        <button
                            onClick={() => setIsWikiModalOpen(true)}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-bold text-sm"
                        >
                            + Wiki 导入
                        </button>
                    )}
                    {!localOnly && (
                        <button
                            onClick={() => {
                                setIsPlayoffRefreshOpen(true);
                                setPlayoffRefreshResult(null);
                            }}
                            className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded font-bold text-sm"
                        >
                            淘汰赛程更新
                        </button>
                    )}
                    <button
                        onClick={() => setIsManualPlannerOpen(true)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded font-bold text-sm"
                    >
                        {'\u624b\u5de5\u6574\u7406\u8d5b\u7a0b'}
                    </button>
                    <button
                        onClick={() => setIsBulkEditOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-bold text-sm"
                    >
                        批量修改
                    </button>
                    <button
                        onClick={handleCreate}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold text-sm"
                    >
                        + 单场比赛
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-4 mb-6 bg-slate-800/50 p-4 rounded-lg items-end border border-slate-700/50">
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-bold">{'1. \u8d5b\u533a\u8fc7\u6ee4'}</label>
                    <select
                        className="bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white min-w-[120px]"
                        value={filterRegion}
                        onChange={(e) => {
                            setFilterRegion(e.target.value);
                            setFilterTournament('');
                        }}
                    >
                        <option value="">{'\u5168\u90e8\u8d5b\u533a / All'}</option>
                        {regions.map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-bold">{'2. \u8d5b\u4e8b\u8fc7\u6ee4'}</label>
                    <select
                        className="bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white min-w-[220px]"
                        value={filterTournament}
                        onChange={(e) => setFilterTournament(e.target.value)}
                    >
                        <option value="">{'\u5168\u90e8\u8d5b\u4e8b'}</option>
                        {availableTournaments.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-bold">{'\u72b6\u6001\u7b5b\u9009'}</label>
                    <select
                        className="bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white min-w-[170px]"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as 'RECENT' | 'ALL' | 'FINISHED')}
                    >
                        <option value="RECENT">{'\u9ed8\u8ba4\uff1a\u6700\u8fd1\u9879\u76ee\uff08\u672a\u7ed3\u675f\uff09'}</option>
                        <option value="ALL">{'\u5168\u90e8\u72b6\u6001'}</option>
                        <option value="FINISHED">{'\u4ec5\u5df2\u7ed3\u675f'}</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-bold">{'\u65e5\u671f\u65b9\u5f0f'}</label>
                    <select
                        className="bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white min-w-[160px]"
                        value={filterDateMode}
                        onChange={(e) => setFilterDateMode(e.target.value as 'ON' | 'BEFORE' | 'AFTER')}
                    >
                        <option value="ON">{'\u5f53\u5929'}</option>
                        <option value="BEFORE">{'\u65e5\u671f\u4e4b\u524d\uff08\u542b\u5f53\u5929\uff09'}</option>
                        <option value="AFTER">{'\u65e5\u671f\u4e4b\u540e\uff08\u542b\u5f53\u5929\uff09'}</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1 ml-auto">
                    <label className="text-xs text-slate-400 font-bold">{'\u65e5\u671f\uff08\u53ef\u9009\uff09'}</label>
                    <input
                        ref={filterDateRef}
                        type="date"
                        className="bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white cursor-pointer"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        onClick={openDatePicker}
                        onFocus={openDatePicker}
                    />
                </div>

                <button
                    onClick={handleSearch}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-1.5 rounded font-bold text-sm h-[34px]"
                    disabled={loading}
                >
                    {loading ? '\u67e5\u8be2\u4e2d...' : '\u641c\u7d22'}
                </button>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2 text-slate-300">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        disabled={selectableMatchIds.length === 0}
                    />
                    <span>全选当前列表</span>
                </label>
                <span className="text-slate-400">
                    已勾选 <span className="font-bold text-white">{selectedMatchIds.length}</span> 场比赛
                </span>
                {selectedMatchIds.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setSelectedMatchIds([])}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        清空勾选
                    </button>
                )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/50">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#1e293b] text-slate-300 font-bold uppercase tracking-wider text-xs border-b border-slate-700">
                        <tr>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-14 text-center">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                                    checked={allVisibleSelected}
                                    onChange={toggleSelectAllVisible}
                                    aria-label="全选当前列表比赛"
                                    disabled={selectableMatchIds.length === 0}
                                />
                            </th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-24">赛区</th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-48">赛事</th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-32">阶段</th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-40">时间（北京时间）</th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-64 text-center">对阵</th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-16 text-center">赛制</th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-44 text-center">版本 / 编辑</th>
                            <th className="px-4 py-3 border-r border-slate-700/50 w-24 text-center">状态</th>
                            <th className="px-4 py-3 text-center w-20">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {flattenedMatches.map((m: any) => {
                            const dateObj = m.startTime ? new Date(m.startTime) : null;
                            const timeStr = dateObj
                                ? new Intl.DateTimeFormat('zh-CN', {
                                      timeZone: 'Asia/Shanghai',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false,
                                  }).format(dateObj)
                                : 'TBD';

                            const region = getMatchRegion(m);

                            return (
                                <tr key={m.id} className="hover:bg-slate-700/40 transition-colors group">
                                    <td className="px-4 py-2 border-r border-slate-700/30 text-center">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                                            checked={selectedMatchIds.includes(m.id)}
                                            onChange={() => toggleMatchSelection(m.id)}
                                            aria-label={`勾选比赛 ${m.teamA?.shortName || m.teamA?.name || 'TBD'} 对阵 ${m.teamB?.shortName || m.teamB?.name || 'TBD'}`}
                                        />
                                    </td>
                                    <td className="px-4 py-2 border-r border-slate-700/30 text-slate-300 font-medium">
                                        <span className="px-2 py-0.5 bg-slate-800 rounded text-xs">{region}</span>
                                    </td>
                                    <td className="px-4 py-2 border-r border-slate-700/30 text-slate-300 truncate max-w-[200px]" title={m.tournament}>
                                        {m.tournament || '-'}
                                    </td>
                                    <td className="px-4 py-2 border-r border-slate-700/30 text-slate-400 max-w-[170px]">
                                        <select
                                            className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                                            value={m.stage || ''}
                                            onChange={(e) => handleQuickUpdateStage(m.id, e.target.value)}
                                            disabled={loading || stageUpdatingId === m.id}
                                            title={m.stage || ''}
                                        >
                                            {m.stage && !enabledStageOptions.some((opt) => opt.id === m.stage) && (
                                                <option value={m.stage}>
                                                    {stageLabelMap.get(m.stage || '') || m.stage}（自定义）                                                </option>
                                            )}
                                            {enabledStageOptions.map((opt) => (
                                                <option key={opt.id} value={opt.id}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-2 border-r border-slate-700/30 font-mono text-slate-400 text-xs">{timeStr}</td>
                                    <td className="px-4 py-2 border-r border-slate-700/30 font-bold text-slate-200">
                                        <div className="flex items-center justify-center gap-2">
                                            <span
                                                className={`w-20 text-right truncate ${
                                                    m.winnerId && m.teamA && m.winnerId === m.teamA.id ? 'text-green-400' : ''
                                                }`}
                                                title={m.teamA?.name || 'TBD'}
                                            >
                                                {m.teamA?.shortName || m.teamA?.name || 'TBD'}
                                            </span>
                                            <span className="text-slate-600 px-1 text-[10px]">VS</span>
                                            <span
                                                className={`w-20 text-left truncate ${
                                                    m.winnerId && m.teamB && m.winnerId === m.teamB.id ? 'text-green-400' : ''
                                                }`}
                                                title={m.teamB?.name || 'TBD'}
                                            >
                                                {m.teamB?.shortName || m.teamB?.name || 'TBD'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 border-r border-slate-700/30 text-center text-slate-500 text-xs font-bold">{m.format}</td>
                                    <td className="relative px-4 py-2 border-r border-slate-700/30 text-center">
                                        <div className="relative min-h-[28px] flex items-center justify-center">
                                            <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${
                                                    m.gameVersion
                                                        ? 'bg-cyan-900/30 text-cyan-300 border border-cyan-700/40'
                                                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                                                }`}
                                            >
                                                {m.gameVersion || 'VERSION TBD'}
                                            </span>
                                            <button
                                                onClick={() => handleEdit(m)}
                                                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white border border-white/20 flex items-center justify-center shadow-md shadow-blue-900/40 transition-all"
                                                title="编辑版本 / 比赛"
                                                aria-label="编辑版本 / 比赛"
                                            >
                                                <EditIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 border-r border-slate-700/30 text-center">
                                        <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${
                                                m.status === 'LIVE'
                                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                    : (String(m.status || '').toUpperCase() === 'FINISHED' || String(m.status || '').toUpperCase() === 'COMPLETED')
                                                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                                      : 'bg-blue-900/40 text-blue-300 border border-blue-800'
                                            }`}
                                        >
                                            {getStatusLabel(m.status)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-center opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => requestDelete(m)} className="text-red-400 hover:text-red-300 font-medium text-xs">
                                            删除
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {flattenedMatches.length === 0 && (
                            <tr>
                                <td colSpan={10} className="text-center py-20 text-slate-500">
                                    未找到符合筛选条件的比赛
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>


            {pendingDeleteMatch && (
                <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                        <div className="px-5 py-4 border-b border-slate-800">
                            <h3 className="text-base font-bold text-white">确认删除比赛</h3>
                            <p className="text-xs text-slate-400 mt-1">该操作无法撤销，请确认是否继续。</p>
                        </div>
                        <div className="px-5 py-4 text-sm text-slate-200">
                            <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
                                <span className="text-slate-400">对阵：</span>
                                <span className="font-semibold">
                                    {(pendingDeleteMatch.teamA?.shortName || pendingDeleteMatch.teamA?.name || 'TBD')}
                                    {'  VS  '}
                                    {(pendingDeleteMatch.teamB?.shortName || pendingDeleteMatch.teamB?.name || 'TBD')}
                                </span>
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setPendingDeleteMatch(null)}
                                className="px-4 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 rounded-md bg-red-600/90 hover:bg-red-500 text-white font-semibold transition-colors"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <MatchEditModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingMatch(null);
                }}
                match={editingMatch}
                teams={teams}
                existingTournaments={existingTournaments}
                systemRegions={systemRegions}
                otherMatches={matches}
                stageOptions={stageOptions}
                onSaveSuccess={handleSaveSuccess}
            />

            <ManualSchedulePlannerModal
                isOpen={isManualPlannerOpen}
                onClose={() => setIsManualPlannerOpen(false)}
                systemRegions={systemRegions}
                stageOptions={stageOptions}
                existingTournaments={existingTournaments}
                defaultRegion={filterRegion || regions[0] || 'LPL'}
                onImportSuccess={handleSearch}
            />

            {showLegacyManualPlanner && isManualPlannerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-2xl">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-2xl font-bold">手工整理赛程</h2>
                            <button
                                type="button"
                                onClick={() => setIsManualPlannerOpen(false)}
                                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
                            >
                                关闭
                            </button>
                        </div>
                        <p className="mt-4 text-sm text-slate-300">隔离测试弹层正常打开，说明崩溃点在真实手工整理组件内部。</p>
                    </div>
                </div>
            )}


            {isBulkEditOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-2xl shadow-2xl">
                        <h2 className="text-xl font-bold mb-2">批量修改已勾选比赛</h2>
                        <p className="text-sm text-slate-400 mb-4">
                            当前将影响 <span className="text-white font-bold">{selectedMatchIds.length}</span> 场比赛；留空字段不会修改。
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{"\u8d5b\u4e8b\u540d\u79f0\uff08Tournament\uff09"}</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                    placeholder={"\u7559\u7a7a\u5219\u4e0d\u6539"}
                                    value={bulkTournament}
                                    onChange={(e) => setBulkTournament(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{"\u9636\u6bb5\uff08Stage\uff09"}</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                    value={bulkStage}
                                    onChange={(e) => setBulkStage(e.target.value)}
                                >
                                    <option value="">{"\u4e0d\u4fee\u6539"}</option>
                                    {enabledStageOptions.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{"\u8d5b\u5236\uff08Format\uff09"}</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                    value={bulkFormat}
                                    onChange={(e) => setBulkFormat(e.target.value)}
                                >
                                    <option value="">{"\u4e0d\u4fee\u6539"}</option>
                                    <option value="BO1">BO1</option>
                                    <option value="BO3">BO3</option>
                                    <option value="BO5">BO5</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{"\u72b6\u6001\uff08Status\uff09"}</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                    value={bulkStatus}
                                    onChange={(e) => setBulkStatus(e.target.value)}
                                >
                                    <option value="">{"\u4e0d\u4fee\u6539"}</option>
                                    <option value="SCHEDULED">未开赛（SCHEDULED）</option>
                                    <option value="LIVE">进行中（LIVE）</option>
                                    <option value="FINISHED">已结束（FINISHED）</option>
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-400 mb-1">{"\u6e38\u620f\u7248\u672c\uff08Game Version\uff09"}</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                    placeholder={"\u5982 26.05\uff0c\u7559\u7a7a\u5219\u4e0d\u6539"}
                                    value={bulkGameVersion}
                                    disabled={bulkClearVersion}
                                    onChange={(e) => setBulkGameVersion(e.target.value)}
                                />
                                <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={bulkClearVersion}
                                        onChange={(e) => setBulkClearVersion(e.target.checked)}
                                    />
                                    {"\u6e05\u7a7a\u6e38\u620f\u7248\u672c"}
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setIsBulkEditOpen(false)}
                                className="text-slate-400 hover:text-white px-4 py-2"
                            >
                                {"\u53d6\u6d88"}
                            </button>
                            <button
                                onClick={handleBulkApply}
                                disabled={loading}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded font-bold"
                            >
                                {loading ? '\u5904\u7406\u4e2d...' : '\u6267\u884c\u6279\u91cf\u4fee\u6539'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!localOnly && isWikiModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
                        <h2 className="text-xl font-bold mb-4">从 Leaguepedia 导入</h2>
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-400 mb-1">赛事名或 URL</label>
                            <input
                                type="text"
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                placeholder="LPL 2026 Split 1 或 https://lol.fandom.com/wiki/..."
                                value={wikiTournament}
                                onChange={(e) => setWikiTournament(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setIsWikiModalOpen(false)} className="text-slate-400 hover:text-white px-4 py-2">
                                取消
                            </button>
                            <button
                                onClick={async () => {
                                    setLoading(true);
                                    const res = await importFromWiki(wikiTournament);
                                    if (res.success) {
                                        alert(res.message || '导入成功');
                                        setIsWikiModalOpen(false);
                                        setWikiTournament('');
                                        await handleSearch();
                                    } else {
                                        alert('导入失败: ' + res.error);
                                    }
                                    setLoading(false);
                                }}
                                disabled={loading}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded font-bold"
                            >
                                {loading ? '抓取中...' : '开始导入'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {!localOnly && isPlayoffRefreshOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-xl shadow-2xl max-h-[80vh] flex flex-col">
                        <h2 className="text-xl font-bold mb-4">淘汰赛赛程更新</h2>

                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Leaguepedia 赛事名称 / URL</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                    placeholder="LPL/2026 Season/Split 1 Playoffs"
                                    value={playoffRefreshTournament}
                                    onChange={(e) => setPlayoffRefreshTournament(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">本地赛事（可选）</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                    value={playoffRefreshLocalTournament}
                                    onChange={(e) => setPlayoffRefreshLocalTournament(e.target.value)}
                                >
                                    <option value="">自动识别</option>
                                    {existingTournaments.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {playoffRefreshResult?.success !== undefined && (
                            <div
                                className={`mb-4 p-4 rounded-lg border overflow-y-auto max-h-60 ${
                                    playoffRefreshResult.success ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'
                                }`}
                            >
                                {playoffRefreshResult.success ? (
                                    <>
                                        <p className="font-bold text-green-400 mb-2">{playoffRefreshResult.message}</p>
                                        <div className="space-y-1">
                                            {playoffRefreshResult.details?.map((d: string, i: number) => (
                                                <p key={i} className="text-xs text-slate-300">
                                                    {d}
                                                </p>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-red-400 font-bold">{playoffRefreshResult.error}</p>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-slate-800">
                            <button
                                onClick={() => {
                                    setIsPlayoffRefreshOpen(false);
                                    setPlayoffRefreshResult(null);
                                }}
                                className="text-slate-400 hover:text-white px-4 py-2"
                            >
                                关闭
                            </button>
                            <button
                                onClick={async () => {
                                    if (!playoffRefreshTournament.trim()) {
                                        alert('请输入 Leaguepedia 赛事名称或 URL');
                                        return;
                                    }
                                    setLoading(true);
                                    const res = await refreshPlayoffBracket(
                                        playoffRefreshTournament.trim(),
                                        playoffRefreshLocalTournament || undefined,
                                    );
                                    setPlayoffRefreshResult(res);
                                    if (res.success) await handleSearch();
                                    setLoading(false);
                                }}
                                disabled={loading}
                                className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded font-bold"
                            >
                                {loading ? '拉取中...' : '开始更新'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}









