'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { addPlayer, updatePlayer, deletePlayer } from '../../actions/team-actions';

type Player = {
    id: string;
    name: string;
    role: string;
    split: string;
    teamId: string;
};

interface RosterEditorProps {
    teamId: string;
    initialPlayers: Player[];
}

const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT', 'COACH'];
const ROLE_LABELS: Record<string, string> = {
    TOP: '上单',
    JUNGLE: '打野',
    MID: '中单',
    ADC: '下路',
    BOT: '下路',
    SUPPORT: '辅助',
    COACH: '教练',
    UNKNOWN: '未知',
};

const YEARLESS_KEY = '未标注年份';

function normalizeRosterRole(value: string): string {
    const role = String(value || '').trim().toUpperCase();
    if (!role) return 'UNKNOWN';

    if (['TOP', '上单'].includes(role)) return 'TOP';
    if (['JUG', 'JGL', 'JNG', 'JUN', 'JUNGLE', '打野'].includes(role)) return 'JUNGLE';
    if (['MID', '中单'].includes(role)) return 'MID';
    if (['ADC', 'AD', 'BOT', '下路'].includes(role)) return 'ADC';
    if (['SUP', 'SUPPORT', '辅助'].includes(role)) return 'SUPPORT';
    if (['COACH', '教练'].includes(role)) return 'COACH';

    return role;
}


function extractYears(split: string): string[] {
    const explicitYears = Array.from(new Set((split.match(/20\d{2}/g) || []).map((y) => y.trim())));
    if (explicitYears.length > 0) return explicitYears;

    const text = String(split || '').toLowerCase();
    if (text.includes('split') || text.includes('赛段') || text.includes('spring') || text.includes('summer') || text.includes('winter')) {
        return [String(new Date().getFullYear())];
    }

    return [];
}

export default function RosterEditor({ teamId, initialPlayers }: RosterEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [players, setPlayers] = useState(
        initialPlayers.map((player) => ({
            ...player,
            role: normalizeRosterRole(player.role),
        })),
    );
    const [isPending, startTransition] = useTransition();

    const yearSections = useMemo(() => {
        const years = new Set<string>();
        let hasYearless = false;

        players.forEach((player) => {
            const list = extractYears(player.split || '');
            if (list.length === 0) {
                hasYearless = true;
                return;
            }
            list.forEach((y) => years.add(y));
        });

        if (years.size === 0 && !hasYearless) {
            years.add(String(new Date().getFullYear()));
        }

        const sortedYears = Array.from(years).sort((a, b) => Number(b) - Number(a));
        const sections = sortedYears.map((year) => ({ key: year, label: `${year} 年` }));

        if (hasYearless) {
            sections.push({ key: YEARLESS_KEY, label: YEARLESS_KEY });
        }

        return sections;
    }, [players]);

    const getPlayersForYear = (yearKey: string) => {
        return players.filter((player) => {
            const playerYears = extractYears(player.split || '');
            if (playerYears.length === 0) {
                return yearKey === YEARLESS_KEY;
            }
            if (yearKey === YEARLESS_KEY) return false;
            return playerYears.includes(yearKey);
        });
    };

    const handleAdd = (yearKey: string) => {
        const name = prompt('请输入选手名称:');
        if (!name) return;

        const role = normalizeRosterRole(prompt('请输入位置 (TOP/JUNGLE/MID/ADC/SUPPORT/COACH):', 'TOP')?.toUpperCase() || 'TOP');
        const split = yearKey === YEARLESS_KEY ? String(new Date().getFullYear()) : yearKey;

        startTransition(async () => {
            const res = await addPlayer(teamId, name, role, split);
            if (!res.success) {
                alert('添加失败: ' + res.error);
            }
        });
    };

    const handleDelete = async (id: string) => {
        if (!(await confirmAction('确定要删除该选手吗？'))) return;

        startTransition(async () => {
            const res = await deletePlayer(id);
            if (res.success) {
                setPlayers((prev) => prev.filter((item) => item.id !== id));
            } else {
                alert('删除失败: ' + res.error);
            }
        });
    };

    const handleUpdate = (id: string, field: 'name' | 'role', value: string) => {
        const normalizedValue = field === 'role' ? normalizeRosterRole(value) : value;
        setPlayers((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: normalizedValue } : item)));
        startTransition(async () => {
            await updatePlayer(id, { [field]: normalizedValue });
        });
    };

    return (
        <div className="relative overflow-hidden rounded-sm border border-gray-200 bg-white shadow-sm">
            <div className="absolute right-2 top-2 z-10">
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`rounded px-3 py-1 text-xs font-bold shadow-sm transition-colors ${
                        isEditing ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    {isEditing ? '完成编辑' : '编辑名单'}
                </button>
            </div>

            <div className="divide-y divide-gray-200">
                {yearSections.map((section) => {
                    const sectionPlayers = getPlayersForYear(section.key);
                    const sortedPlayers = [...sectionPlayers].sort((a, b) => ROLES.indexOf(normalizeRosterRole(a.role)) - ROLES.indexOf(normalizeRosterRole(b.role)));

                    return (
                        <div key={section.key} className="flex min-h-[180px] flex-col">
                            <div className="flex items-center justify-between border-b border-gray-200 bg-[#F7F7F9] px-4 py-3">
                                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">{section.label}</h2>
                            </div>

                            <div className="relative flex-1 p-0">
                                {sortedPlayers.length === 0 && !isEditing ? (
                                    <div className="p-8 text-center">
                                        <span className="text-xs text-gray-400">NO ROSTER</span>
                                    </div>
                                ) : (
                                    <table className="w-full">
                                        <tbody>
                                            {sortedPlayers.map((player) => (
                                                <tr key={player.id} className="group border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50">
                                                    <td className="w-20 px-4 py-2.5">
                                                        {isEditing ? (
                                                            <select
                                                                value={normalizeRosterRole(player.role)}
                                                                onChange={(event) => handleUpdate(player.id, 'role', normalizeRosterRole(event.target.value))}
                                                                className="w-full rounded border border-gray-300 bg-white px-1 py-0.5 text-xs"
                                                            >
                                                                {ROLES.map((role) => (
                                                                    <option key={role} value={role}>
                                                                        {role}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span className="text-[11px] font-bold uppercase text-gray-400">{ROLE_LABELS[normalizeRosterRole(player.role)] || player.role}</span>
                                                        )}
                                                    </td>
                                                    <td className="relative px-4 py-2.5 text-left">
                                                        {isEditing ? (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={player.name}
                                                                    onChange={(event) => handleUpdate(player.id, 'name', event.target.value)}
                                                                    onBlur={(event) => handleUpdate(player.id, 'name', event.target.value)}
                                                                    className="w-full rounded border border-gray-300 px-2 py-0.5 text-sm font-semibold text-[#202D37] focus:border-blue-500 focus:outline-none"
                                                                />
                                                                <button
                                                                    onClick={() => handleDelete(player.id)}
                                                                    className="p-1 text-red-400 hover:text-red-600"
                                                                    title="删除"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <Link href={`/players?search=${encodeURIComponent(player.name)}`} className="text-sm font-semibold text-[#202D37] hover:text-blue-600 hover:underline">
                                                                {player.name}
                                                            </Link>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {isEditing && (
                                    <div className="border-t border-gray-100 bg-gray-50/50 p-4 text-center">
                                        <button
                                            onClick={() => handleAdd(section.key)}
                                            className="w-full rounded-full border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                                        >
                                            + 添加选手
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {isPending && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
                </div>
            )}
        </div>
    );
}


