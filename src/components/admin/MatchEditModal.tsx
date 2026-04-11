'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MatchFormData, getRegionMappedTeams, upsertMatch } from '@/app/admin/schedule/actions';
import type { MatchStageOption } from '@/lib/config-shared';

type Team = { id: string; name: string; shortName: string | null; region: string };

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

interface MatchEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    match?: MatchFormData | null;
    teams: Team[];
    existingTournaments: string[];
    systemRegions?: string[];
    otherMatches: any[];
    stageOptions?: MatchStageOption[];
    onSaveSuccess: (savedMatch?: any) => void | Promise<void>;
}

const FALLBACK_STAGE_OPTIONS: MatchStageOption[] = [
    { id: 'Regular Season', label: '常规赛', category: 'regular', enabled: true },
    { id: 'Play-In', label: 'Play-In', category: 'playin', enabled: true },
    { id: 'Group Stage', label: '小组赛', category: 'regular', enabled: true },
    { id: 'Swiss Stage', label: '瑞士轮', category: 'regular', enabled: true },
    { id: 'Playoffs', label: '季后赛', category: 'playoff', enabled: true },
    { id: 'Grand Final', label: '总决赛', category: 'playoff', enabled: true },
];

export default function MatchEditModal({
    isOpen,
    onClose,
    match,
    teams,
    existingTournaments,
    systemRegions,
    otherMatches,
    stageOptions,
    onSaveSuccess,
}: MatchEditModalProps) {
    const normalizedOptions = useMemo(() => {
        const source = (stageOptions || [])
            .filter((s) => s && s.id && s.id.trim().length > 0)
            .map((s) => ({
                id: s.id.trim(),
                label: (s.label || s.id).trim(),
                category: s.category || 'other',
                enabled: s.enabled !== false,
            }))
            .filter((s) => s.enabled);

        return source.length > 0 ? source : FALLBACK_STAGE_OPTIONS;
    }, [stageOptions]);

    const defaultRegularStage = normalizedOptions[0]?.id || 'Regular Season';

    const defaultState = useMemo(
        (): MatchFormData => ({
            startTime: '',
            teamAId: '',
            teamBId: '',
            status: 'SCHEDULED',
            format: 'BO3',
            tournament: 'LPL',
            stage: defaultRegularStage,
            gameVersion: '',
        }),
        [defaultRegularStage],
    );

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<MatchFormData>(match || defaultState);
    const [isCustomTournament, setIsCustomTournament] = useState(false);
    const [isCustomStage, setIsCustomStage] = useState(false);
    const [teamRegionFilter, setTeamRegionFilter] = useState('');
    const [teamKeyword, setTeamKeyword] = useState('');
    const [regionMappedTeamIds, setRegionMappedTeamIds] = useState<string[]>([]);
    const [regionMappedTournaments, setRegionMappedTournaments] = useState<string[]>([]);
    const [regionMapLoading, setRegionMapLoading] = useState(false);

    const regions = useMemo(() => {
        const baseRegions =
            systemRegions ||
            Array.from(
                new Set(
                    teams.flatMap((t) =>
                        (t.region || '')
                            .split(',')
                            .map((s) => s.trim().split(/[\s,]+/)[0])
                            .filter(Boolean),
                    ),
                ),
            );
        return baseRegions.filter((r) => !!r && r.length > 1 && !/^\d+$/.test(r)).sort();
    }, [systemRegions, teams]);
    const normalizedRegionFilter = useMemo(() => String(teamRegionFilter || '').trim().toUpperCase(), [teamRegionFilter]);

    const teamRegionMatches = useCallback((regionText: string, regionNorm: string) => {
        const raw = String(regionText || '').trim();
        const upper = raw.toUpperCase();

        if (!regionNorm) return true;

        if (regionNorm === 'WORLDS' || regionNorm === 'WORLD') {
            return (
                upper.includes('WORLD') ||
                upper.includes('WORLDS') ||
                upper.includes('MSI') ||
                raw.includes('世界赛') ||
                raw.includes('全球先锋赛') ||
                raw.includes('全球总决赛')
            );
        }

        if (regionNorm === 'OTHER' || regionNorm === '其它赛区' || regionNorm === '其他赛区') {
            const isOther =
                upper.includes('OTHER') ||
                raw.includes('其它赛区') ||
                raw.includes('其他赛区') ||
                upper.includes('LEC') ||
                upper.includes('LCS') ||
                upper.includes('LTA') ||
                upper.includes('CBLOL') ||
                upper.includes('LJL') ||
                upper.includes('LLA') ||
                upper.includes('LCP') ||
                upper.includes('PCS') ||
                upper.includes('VCS') ||
                upper.includes('TCL');

            const isCore = upper.includes('LPL') || upper.includes('LCK') || upper.includes('WORLD') || upper.includes('WORLDS');
            return isOther && !isCore;
        }

        return upper.includes(regionNorm);
    }, []);

    const tournamentMatchesRegion = useCallback((tournamentName: string, regionNorm: string) => {
        const raw = String(tournamentName || '').trim();
        const upper = raw.toUpperCase();

        if (!regionNorm) return true;

        if (regionNorm === 'WORLDS' || regionNorm === 'WORLD') {
            return (
                upper.includes('WORLD') ||
                upper.includes('WORLDS') ||
                upper.includes('MSI') ||
                upper.includes('ALL-STAR') ||
                raw.includes('世界赛') ||
                raw.includes('全球先锋赛') ||
                raw.includes('全球总决赛')
            );
        }

        if (regionNorm === 'OTHER' || regionNorm === '其它赛区' || regionNorm === '其他赛区') {
            const isOther =
                upper.includes('OTHER') ||
                raw.includes('其它赛区') ||
                raw.includes('其他赛区') ||
                upper.includes('LEC') ||
                upper.includes('LCS') ||
                upper.includes('LTA') ||
                upper.includes('CBLOL') ||
                upper.includes('LJL') ||
                upper.includes('LLA') ||
                upper.includes('LCP') ||
                upper.includes('PCS') ||
                upper.includes('VCS') ||
                upper.includes('TCL');

            const isWorld =
                upper.includes('WORLD') ||
                upper.includes('WORLDS') ||
                upper.includes('MSI') ||
                raw.includes('世界赛') ||
                raw.includes('全球先锋赛') ||
                raw.includes('全球总决赛');

            return isOther && !isWorld;
        }

        return upper.includes(regionNorm);
    }, []);

    const filteredTournaments = useMemo(() => {
        const mapped = regionMappedTournaments.filter((t): t is string => !!t && t.trim().length > 0);
        const source = mapped.length > 0 ? mapped : existingTournaments;
        const filtered = normalizedRegionFilter
            ? source.filter((t) => tournamentMatchesRegion(t, normalizedRegionFilter))
            : source;

        return Array.from(new Set(filtered));
    }, [existingTournaments, normalizedRegionFilter, regionMappedTournaments, tournamentMatchesRegion]);

    const mappedTeamIdSet = useMemo(() => new Set(regionMappedTeamIds), [regionMappedTeamIds]);

    const filteredTeams = useMemo(() => {
        const keyword = String(teamKeyword || '').trim().toLowerCase();
        let list = teams;

        if (normalizedRegionFilter) {
            if (mappedTeamIdSet.size > 0) {
                list = list.filter((team) => mappedTeamIdSet.has(team.id));
            } else {
                list = list.filter((team) => teamRegionMatches(team.region || '', normalizedRegionFilter));
            }
        }

        if (keyword) {
            list = list.filter((team) => {
                const name = String(team.name || '').toLowerCase();
                const shortName = String(team.shortName || '').toLowerCase();
                return name.includes(keyword) || shortName.includes(keyword);
            });
        }

        return [...list].sort((a, b) => String(a.shortName || a.name).localeCompare(String(b.shortName || b.name)));
    }, [mappedTeamIdSet, normalizedRegionFilter, teamKeyword, teamRegionMatches, teams]);

    const activeStageOptions = normalizedOptions;

    const handleQuickTime = useCallback((dayOffset: number) => {
        const base = new Date();
        base.setDate(base.getDate() + dayOffset);
        base.setHours(17, 0, 0, 0);
        setFormData((prev) => ({ ...prev, startTime: toBeijingInputValue(base) }));
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const initial = match
            ? {
                  ...match,
                  startTime: toBeijingInputValue(match.startTime as string),
              }
            : {
                  ...defaultState,
                  startTime: defaultState.startTime || toBeijingInputValue(new Date()),
              };

        setFormData(initial);

        setIsCustomTournament(!existingTournaments.includes(initial.tournament || ''));
        setIsCustomStage(!activeStageOptions.some((s) => s.id === initial.stage));

        const tournamentText = String(initial.tournament || '');
        const inferredRegion =
            tournamentMatchesRegion(tournamentText, 'LPL')
                ? 'LPL'
                : tournamentMatchesRegion(tournamentText, 'LCK')
                  ? 'LCK'
                  : tournamentMatchesRegion(tournamentText, 'WORLDS')
                    ? 'WORLDS'
                    : tournamentMatchesRegion(tournamentText, 'OTHER')
                      ? 'OTHER'
                      : '';
        setTeamRegionFilter(inferredRegion);
        setTeamKeyword('');
    }, [
        defaultState,
        existingTournaments,
        isOpen,
        match,        tournamentMatchesRegion,    ]);

    useEffect(() => {
        if (!isOpen) return;

        const normalizedRegion = String(teamRegionFilter || '').trim().toUpperCase();
        if (!normalizedRegion) {
            setRegionMappedTeamIds([]);
            setRegionMappedTournaments([]);
            setRegionMapLoading(false);
            return;
        }

        let cancelled = false;
        setRegionMapLoading(true);
        getRegionMappedTeams(normalizedRegion)
            .then((res: any) => {
                if (cancelled) return;
                if (res?.success) {
                    setRegionMappedTeamIds(Array.isArray(res.teamIds) ? res.teamIds : []);
                    setRegionMappedTournaments(Array.isArray(res.tournaments) ? res.tournaments : []);
                } else {
                    setRegionMappedTeamIds([]);
                    setRegionMappedTournaments([]);
                }
            })
            .catch(() => {
                if (cancelled) return;
                setRegionMappedTeamIds([]);
                setRegionMappedTournaments([]);
            })
            .finally(() => {
                if (!cancelled) {
                    setRegionMapLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, teamRegionFilter]);
    useEffect(() => {
        const normalizedRegion = String(teamRegionFilter || '').trim().toUpperCase();
        if (!normalizedRegion) return;

        if (filteredTournaments.length === 0) {
            if (!isCustomTournament) {
                setIsCustomTournament(true);
            }
            if (!(formData.tournament || '').toUpperCase().includes(normalizedRegion)) {
                setFormData((prev) => ({ ...prev, tournament: `${new Date().getFullYear()} ${normalizedRegion}` }));
            }
            return;
        }

        if (isCustomTournament) return;
        if (!filteredTournaments.includes(formData.tournament || '')) {
            setFormData((prev) => ({ ...prev, tournament: filteredTournaments[0] }));
        }
    }, [filteredTournaments, formData.tournament, isCustomTournament, teamRegionFilter]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const payload = { ...formData };
        if (payload.startTime && !payload.startTime.endsWith('Z') && !payload.startTime.includes('+')) {
            payload.startTime = `${payload.startTime}:00+08:00`;
        }

        const res = (await upsertMatch(payload)) as { success: boolean; error?: string; warning?: string; match?: any };

        if (res.success) {
            if (res.warning) alert(res.warning);
            await onSaveSuccess(res.match);
            onClose();
        } else {
            alert('保存失败: ' + (res.error || 'Unknown error'));
        }

        setLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[95vh] flex overflow-hidden transition-all duration-300"
            >
                <div
                    className="flex flex-col overflow-y-auto pr-4 w-full space-y-4"
                >
                    <h2 className="text-xl font-bold mb-2">{formData.id ? '编辑赛程' : '新建赛程'}</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <div className="flex justify-between items-end mb-1">
                                <label className="block text-xs font-bold text-slate-400">开始时间（北京时间）</label>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => handleQuickTime(0)} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700">今天 17:00</button>
                                    <button type="button" onClick={() => handleQuickTime(1)} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700">明天 17:00</button>
                                </div>
                            </div>
                            <input
                                type="datetime-local"
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                value={formData.startTime}
                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                            />
                        </div>

                        <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50">
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-xs font-bold text-slate-400">筛选战队赛区:</label>
                                <select className="bg-slate-900 border border-slate-700 rounded p-1.5 text-white text-xs" value={teamRegionFilter} onChange={(e) => setTeamRegionFilter(e.target.value)}>
                                    <option value="">全部赛区</option>
                                    {regions.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="mb-3">
                                <input
                                    type="text"
                                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                                    placeholder="搜索队伍（简称 / 全称）"
                                    value={teamKeyword}
                                    onChange={(e) => setTeamKeyword(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">蓝方</label>
                                    <select className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" value={formData.teamAId || ''} onChange={(e) => setFormData({ ...formData, teamAId: e.target.value })}>
                                        <option value="">（待定）</option>
                                        {filteredTeams.map((t) => (
                                            <option key={t.id} value={t.id}>{t.shortName || t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">红方</label>
                                    <select className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" value={formData.teamBId || ''} onChange={(e) => setFormData({ ...formData, teamBId: e.target.value })}>
                                        <option value="">（待定）</option>
                                        {filteredTeams.map((t) => (
                                            <option key={t.id} value={t.id}>{t.shortName || t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {regionMapLoading && (
                                <p className="text-xs text-slate-400 mt-2">正在加载该赛区队伍映射...</p>
                            )}
                            {filteredTeams.length === 0 && (
                                <p className="text-xs text-amber-300 mt-2">
                                    当前筛选条件下没有匹配队伍。若该赛区是新导入，请先同步赛程后再选择。
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="flex justify-between items-center text-xs font-bold text-slate-400 mb-1">
                                    <span>赛事名称</span>
                                    {isCustomTournament && (
                                        <button
                                            type="button"
                                            className="text-[10px] text-blue-400 hover:underline"
                                            onClick={() => {
                                                setIsCustomTournament(false);
                                                setFormData({ ...formData, tournament: filteredTournaments[0] || existingTournaments[0] || '' });
                                            }}
                                        >
                                            返回选择
                                        </button>
                                    )}
                                </label>
                                {isCustomTournament ? (
                                    <input
                                        type="text"
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                        value={formData.tournament}
                                        onChange={(e) => setFormData({ ...formData, tournament: e.target.value })}
                                        placeholder="输入自定义赛事名"
                                        required
                                    />
                                ) : (
                                    <select
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                        value={filteredTournaments.includes(formData.tournament) ? formData.tournament : ''}
                                        onChange={(e) => {
                                            if (e.target.value === '__CUSTOM__') {
                                                setIsCustomTournament(true);
                                                setFormData({ ...formData, tournament: '' });
                                            } else {
                                                setFormData({ ...formData, tournament: e.target.value });
                                            }
                                        }}
                                    >
                                        <option value="" disabled>--选择赛事--</option>
                                        {filteredTournaments.map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                        <option value="__CUSTOM__">(+) 自定义录入</option>
                                    </select>
                                )}
                            </div>

                            <div>
                                <label className="flex justify-between items-center text-xs font-bold text-slate-400 mb-1">
                                    <span>阶段</span>
                                    {isCustomStage && (
                                        <button
                                            type="button"
                                            className="text-[10px] text-blue-400 hover:underline"
                                            onClick={() => {
                                                setIsCustomStage(false);
                                                const fallback = activeStageOptions[0]?.id || defaultRegularStage;
                                                setFormData({ ...formData, stage: fallback });
                                            }}
                                        >
                                            返回选择
                                        </button>
                                    )}
                                </label>

                                {isCustomStage ? (
                                    <input
                                        type="text"
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                        value={formData.stage}
                                        onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                                        placeholder="输入自定义阶段"
                                        required
                                    />
                                ) : (
                                    <select
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                        value={activeStageOptions.some((s) => s.id === formData.stage) ? formData.stage : ''}
                                        onChange={(e) => {
                                            if (e.target.value === '__CUSTOM__') {
                                                setIsCustomStage(true);
                                                setFormData({ ...formData, stage: '' });
                                            } else {
                                                setFormData({ ...formData, stage: e.target.value });
                                            }
                                        }}
                                    >
                                        <option value="" disabled>--选择阶段--</option>
                                        {activeStageOptions.map((s) => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                        <option value="__CUSTOM__">(+) 自定义录入</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">赛制</label>
                                <select className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white" value={formData.format} onChange={(e) => setFormData({ ...formData, format: e.target.value })}>
                                    <option value="BO1">BO1</option>
                                    <option value="BO3">BO3</option>
                                    <option value="BO5">BO5</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">状态</label>
                                <select className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                                    <option value="SCHEDULED">未开始</option>
                                    <option value="LIVE">进行中</option>
                                    <option value="FINISHED">已结束</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Game Version（手动覆盖）</label>
                            <input
                                type="text"
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                                value={formData.gameVersion || ''}
                                onChange={(e) => setFormData({ ...formData, gameVersion: e.target.value })}
                                placeholder="例如 PATCH 26.02；留空按规则自动分配"
                            />
                        </div>

                        <div className="text-[11px] text-slate-500">当前本地赛程总数：{otherMatches.length}</div>

                        <div className="flex justify-end gap-3 mt-6 pb-2">
                            <button type="button" onClick={onClose} className="text-slate-400 hover:text-white px-4 py-2">取消</button>
                            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold">
                                {loading ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}






























