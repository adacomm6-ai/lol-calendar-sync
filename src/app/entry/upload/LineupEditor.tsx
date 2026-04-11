'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { getHeroes } from './hero-actions';

interface Hero {
    id: string;
    name: string;
    alias: string | null;
    title: string | null;
    avatarUrl: string;
}

interface LineupEditorProps {
    data: any;
    onUpdate: (newData: any) => void;
}

const HERO_SHORTCUTS: Record<string, string> = {
    ivy: 'Ivern',
    ape: 'Aphelios',
    ali: 'Alistar',
    kai: 'Kaisa',
    thr: 'Thresh',
    tf: 'TwistedFate',
    mf: 'MissFortune',
    j4: 'JarvanIV',
    kog: 'KogMaw',
    rek: 'RekSai',
    mao: 'Maokai',
    hei: 'Heimerdinger',
    cass: 'Cassiopeia',
    noc: 'Nocturne',
    blitz: 'Blitzcrank',
    heca: 'Hecarim',
    kata: 'Katarina',
    nid: 'Nidalee',
    ser: 'Seraphine',
    tris: 'Tristana',
    vlad: 'Vladimir',
    vol: 'Volibear',
    ww: 'Warwick',
    xin: 'XinZhao',
    yas: 'Yasuo',
    yone: 'Yone',
    zil: 'Zilean',
    rum: 'Rumble',
    ren: 'Renekton',
    ks: 'KSante',
    ksa: 'KSante',
    cho: 'Chogath',
    kha: 'Khazix',
    vel: 'Velkoz',
    lb: 'Leblanc',
    wu: 'MonkeyKing',
};

const HERO_CANONICAL_OVERRIDES: Record<string, string> = {
    wukong: 'MonkeyKing',
    monkeyking: 'MonkeyKing',
    renataglasc: 'Renata',
    nunuwillump: 'Nunu',
    nunuandwillump: 'Nunu',
    kaisa: 'Kaisa',
    drmundo: 'DrMundo',
    missfortune: 'MissFortune',
    twistedfate: 'TwistedFate',
    tahmkench: 'TahmKench',
    xinzhao: 'XinZhao',
    kogmaw: 'KogMaw',
    kogmow: 'KogMaw',
    chogath: 'Chogath',
    khazix: 'Khazix',
    velkoz: 'Velkoz',
    belveth: 'Belveth',
    ksante: 'KSante',
    kaisaadc: 'Kaisa',
    '\u8d75\u4fe1': 'XinZhao',
    '\u5fb7\u90a6\u603b\u7ba1': 'XinZhao',
    '\u6df1\u6e0a\u5de8\u53e3': 'KogMaw',
    '\u514b\u683c\u83ab': 'KogMaw',
};

const OCR_SIMILARITY_REPLACEMENTS: Array<[RegExp, string]> = [
    [/0/g, 'o'],
    [/1/g, 'i'],
    [/3/g, 'e'],
    [/4/g, 'a'],
    [/5/g, 's'],
    [/7/g, 't'],
    [/8/g, 'b'],
];

const UNKNOWN_HERO_KEYS = new Set(['', 'unknown', 'unk', 'none', 'null']);

function normalizeHeroKey(value?: string | null): string {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, 'and')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase();
}

function normalizeOcrHeroKey(value?: string | null): string {
    let key = normalizeHeroKey(value);
    for (const [pattern, replacement] of OCR_SIMILARITY_REPLACEMENTS) {
        key = key.replace(pattern, replacement);
    }
    return key;
}

function buildHeroKeys(hero: Hero): string[] {
    const keys = new Set<string>();
    const add = (v?: string | null) => {
        const key = normalizeHeroKey(v);
        if (key) keys.add(key);
    };

    add(hero.name);
    add(hero.alias);
    add(hero.title);
    add(hero.id);
    add(hero.name.replace(/([a-z])([A-Z])/g, '$1 $2'));

    const canonical = normalizeHeroKey(hero.name);
    if (canonical === 'monkeyking') add('Wukong');
    if (canonical === 'nunu') {
        add('NunuWillump');
        add('NunuAndWillump');
        add('Nunu & Willump');
    }
    if (canonical === 'renata') add('RenataGlasc');
    if (canonical === 'xinzhao') add('Xin Zhao');
    if (canonical === 'kogmaw') {
        add("Kog'Maw");
        add('Kog Maw');
    }
    if (canonical === 'ksante') add("K'Sante");
    if (canonical === 'kaisa') add("Kai'Sa");
    if (canonical === 'chogath') add("Cho'Gath");
    if (canonical === 'khazix') add("Kha'Zix");
    if (canonical === 'velkoz') add("Vel'Koz");

    return Array.from(keys);
}

function resolveCanonicalHeroKey(rawKey: string): string {
    const shortcut = HERO_SHORTCUTS[rawKey];
    if (shortcut) return normalizeHeroKey(shortcut);

    const alias = HERO_CANONICAL_OVERRIDES[rawKey];
    if (alias) return normalizeHeroKey(alias);

    return rawKey;
}

function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i++) matrix[i][0] = i;
    for (let j = 0; j < cols; j++) matrix[0][j] = j;

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }

    return matrix[rows - 1][cols - 1];
}

function findHeroMatch(
    rawHeroName: string,
    heroList: Hero[],
    heroIndex: Map<string, Hero>,
    heroKeysById: Map<string, string[]>,
): Hero | undefined {
    const rawKey = normalizeHeroKey(rawHeroName);
    if (UNKNOWN_HERO_KEYS.has(rawKey)) return undefined;

    const canonicalKey = resolveCanonicalHeroKey(rawKey);
    const ocrKey = normalizeOcrHeroKey(rawHeroName);
    const ocrCanonical = resolveCanonicalHeroKey(ocrKey);

    const candidateKeys = Array.from(new Set([
        rawKey,
        canonicalKey,
        ocrKey,
        ocrCanonical,
    ].filter((k) => !!k && !UNKNOWN_HERO_KEYS.has(k))));

    for (const key of candidateKeys) {
        const exact = heroIndex.get(key);
        if (exact) return exact;
    }

    let best: Hero | undefined;
    let bestScore = 0;

    for (const hero of heroList) {
        const keys = heroKeysById.get(hero.id) || [];
        for (const candidateKey of candidateKeys) {
            if (candidateKey.length < 2) continue;
            for (const key of keys) {
                let score = 0;
                if (key === candidateKey) {
                    score = 100;
                } else if (key.startsWith(candidateKey) || candidateKey.startsWith(key)) {
                    score = Math.min(key.length, candidateKey.length) + 4;
                } else if (key.includes(candidateKey) || candidateKey.includes(key)) {
                    score = Math.min(key.length, candidateKey.length) + 2;
                }

                if (score > bestScore) {
                    bestScore = score;
                    best = hero;
                }
            }
        }
    }

    if (best && bestScore >= 5) return best;

    let fuzzyBest: Hero | undefined;
    let fuzzyBestDistance = Number.POSITIVE_INFINITY;
    let fuzzyBestCoverage = -1;

    for (const hero of heroList) {
        const keys = heroKeysById.get(hero.id) || [];
        for (const candidateKey of candidateKeys) {
            if (candidateKey.length < 3) continue;
            for (const key of keys) {
                const maxLen = Math.max(candidateKey.length, key.length);
                const dist = levenshteinDistance(candidateKey, key);

                let allowedDistance = 1;
                if (maxLen > 8) allowedDistance = 2;
                if (maxLen > 12) allowedDistance = 3;

                if (dist > allowedDistance) continue;

                const coverage = maxLen - dist;
                const isBetter =
                    dist < fuzzyBestDistance ||
                    (dist === fuzzyBestDistance && coverage > fuzzyBestCoverage);

                if (isBetter) {
                    fuzzyBest = hero;
                    fuzzyBestDistance = dist;
                    fuzzyBestCoverage = coverage;
                }
            }
        }
    }

    return fuzzyBest;
}

export default function LineupEditor({ data, onUpdate }: LineupEditorProps) {
    const [heroes, setHeroes] = useState<Hero[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [editName, setEditName] = useState('');
    const [editDamage, setEditDamage] = useState<number | string>('');

    const { heroIndex, heroKeysById } = useMemo(() => {
        const index = new Map<string, Hero>();
        const keyMap = new Map<string, string[]>();

        for (const hero of heroes) {
            const keys = buildHeroKeys(hero);
            keyMap.set(hero.id, keys);
            for (const key of keys) {
                if (!index.has(key)) index.set(key, hero);
            }
        }

        return { heroIndex: index, heroKeysById: keyMap };
    }, [heroes]);

    const autoMatchAvatars = useCallback((heroList: Hero[]) => {
        if (!data || !data.damage_data || heroList.length === 0) return;

        const localHeroIndex = new Map<string, Hero>();
        const localHeroKeys = new Map<string, string[]>();
        for (const hero of heroList) {
            const keys = buildHeroKeys(hero);
            localHeroKeys.set(hero.id, keys);
            for (const key of keys) {
                if (!localHeroIndex.has(key)) localHeroIndex.set(key, hero);
            }
        }

        const hasUsableAvatar = (avatar?: string | null) => {
            const value = (avatar || '').trim().toLowerCase();
            if (!value) return false;
            return !value.includes('unknown') && value !== '?';
        };

        let hasUpdates = false;
        const newData = { ...data };

        newData.damage_data = newData.damage_data.map((p: any) => {
            const rawHero = (p.hero || '').trim();
            if (!rawHero) return p;

            const match = findHeroMatch(rawHero, heroList, localHeroIndex, localHeroKeys);
            if (!match) return p;

            const currentHeroKey = normalizeHeroKey(p.hero);
            const nextHeroKey = normalizeHeroKey(match.name);
            const avatarKey = normalizeHeroKey(p.hero_avatar || '');
            const expectedAvatarKey = normalizeHeroKey(match.avatarUrl || '');

            const avatarMismatch = !avatarKey || (expectedAvatarKey ? avatarKey !== expectedAvatarKey : !avatarKey.includes(nextHeroKey));
            const shouldPatchAvatar = !hasUsableAvatar(p.hero_avatar) || avatarMismatch;
            const shouldPatchName = currentHeroKey !== nextHeroKey;
            const shouldPatchAlias = (p.hero_alias || '') !== (match.alias || '');

            if (!shouldPatchAvatar && !shouldPatchName && !shouldPatchAlias) {
                return p;
            }

            hasUpdates = true;
            return {
                ...p,
                hero: match.name,
                hero_alias: match.alias,
                hero_avatar: match.avatarUrl,
            };
        });

        if (hasUpdates) onUpdate(newData);
    }, [data, onUpdate]);

    useEffect(() => {
        getHeroes().then((res) => {
            if (!res.success) return;
            const loadedHeroes = res.heroes;
            setHeroes(loadedHeroes);
            autoMatchAvatars(loadedHeroes);
        });
    }, [data?.damage_data?.length, autoMatchAvatars]);

    const normalizedSearch = normalizeHeroKey(search);
    const filteredHeroes = heroes.filter((h) => {
        if (!normalizedSearch) return true;
        return (
            normalizeHeroKey(h.name).includes(normalizedSearch) ||
            normalizeHeroKey(h.alias).includes(normalizedSearch) ||
            normalizeHeroKey(h.title).includes(normalizedSearch)
        );
    });

    const startEditing = (index: number) => {
        setEditingIndex(index);
        setEditName(data.damage_data[index].name);
        setEditDamage(data.damage_data[index].damage);
        setSearch('');
    };

    const handleSelectHero = (hero: Hero) => {
        if (editingIndex === null) return;

        const newData = { ...data };
        newData.damage_data = [...data.damage_data];
        newData.damage_data[editingIndex] = { ...newData.damage_data[editingIndex] };

        const player = newData.damage_data[editingIndex];
        player.name = editName;
        player.hero = hero.name;
        player.hero_alias = hero.alias;
        player.hero_avatar = hero.avatarUrl;
        player.damage = Number(editDamage) || 0;

        onUpdate(newData);
        setEditingIndex(null);
    };

    const handleSaveNameOrDamage = () => {
        if (editingIndex === null) return;

        const newData = { ...data };
        newData.damage_data = [...data.damage_data];
        newData.damage_data[editingIndex] = { ...newData.damage_data[editingIndex] };
        newData.damage_data[editingIndex].name = editName;
        newData.damage_data[editingIndex].damage = Number(editDamage) || 0;

        onUpdate(newData);
        setEditingIndex(null);
    };

    const movePlayer = (index: number, direction: 'up' | 'down') => {
        const newData = { ...data };
        newData.damage_data = [...data.damage_data];

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newData.damage_data.length) return;

        const temp = newData.damage_data[index];
        newData.damage_data[index] = newData.damage_data[targetIndex];
        newData.damage_data[targetIndex] = temp;

        onUpdate(newData);
    };

    if (!data || !data.damage_data) return null;

    const blueTeamPlayers = data.damage_data.filter((p: any) => p.team === 'Blue' || p.team === data.damage_data[0].team);
    const redTeamPlayers = data.damage_data.filter((p: any) => p.team !== 'Blue' && p.team !== data.damage_data[0].team);

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mt-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <span>✏️</span> 阵容修正
                </h3>
                <button
                    onClick={() => autoMatchAvatars(heroes)}
                    className="text-[10px] bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 px-2 py-1 rounded transition"
                >
                    🔄 自动匹配头像
                </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 bg-blue-900/10 border border-blue-900/30 p-2 rounded text-blue-200">
                提示：点击任意选手卡片即可修正姓名、伤害数值，或手动选择英雄。支持自动匹配英雄别名、空格和符号变体，例如 Xin Zhao、Kog&apos;Maw。            </p>

            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <div className="text-blue-400 font-bold text-xs uppercase mb-2 flex justify-between">
                            <span>蓝色方</span>
                            <span className="text-slate-600">顺序</span>
                        </div>

                        {blueTeamPlayers.map((p: any, idx: number, arr: any[]) => {
                            const absIdx = data.damage_data.indexOf(p);
                            const heroInfo = findHeroMatch(p.hero || '', heroes, heroIndex, heroKeysById);
                            const isFirst = idx === 0;

                            return (
                                <div key={`blue-${idx}`} className="flex gap-2">
                                    <div className="flex flex-col justify-center gap-0.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); movePlayer(absIdx, 'up'); }}
                                            disabled={isFirst}
                                            className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed rounded text-[10px]"
                                        >
                                            ↑                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); movePlayer(absIdx, 'down'); }}
                                            disabled={idx === arr.length - 1}
                                            className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed rounded text-[10px]"
                                        >
                                            ↓                                        </button>
                                    </div>

                                    <div
                                        onClick={() => startEditing(absIdx)}
                                        className="flex-1 flex items-center gap-3 p-2 rounded bg-slate-800/50 hover:bg-slate-700 cursor-pointer transition border border-transparent hover:border-slate-500"
                                    >
                                        <div className="w-10 h-10 rounded overflow-hidden bg-slate-700 relative shrink-0">
                                            {(heroInfo?.avatarUrl || p.hero_avatar) ? (
                                                <Image
                                                    src={heroInfo?.avatarUrl || p.hero_avatar || ''}
                                                    alt={p.hero}
                                                    fill
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">?</div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-white text-sm font-bold truncate">{p.name}</div>
                                            <div className="text-slate-400 text-xs truncate">
                                                {heroInfo ? `${heroInfo.alias} (${heroInfo.name})` : (p.hero !== 'Unknown' ? p.hero : '选择英雄...')}
                                            </div>
                                        </div>

                                        <div className="text-slate-500 text-xs font-mono">{Number(p.damage).toLocaleString()}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="space-y-2">
                        <div className="text-red-400 font-bold text-xs uppercase mb-2 flex justify-between">
                            <span>红色方</span>
                            <span className="text-slate-600">顺序</span>
                        </div>

                        {redTeamPlayers.map((p: any, idx: number, arr: any[]) => {
                            const absIdx = data.damage_data.indexOf(p);
                            const heroInfo = findHeroMatch(p.hero || '', heroes, heroIndex, heroKeysById);

                            return (
                                <div key={`red-${idx}`} className="flex gap-2 flex-row-reverse">
                                    <div className="flex flex-col justify-center gap-0.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); movePlayer(absIdx, 'up'); }}
                                            disabled={idx === 0}
                                            className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed rounded text-[10px]"
                                        >
                                            ↑                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); movePlayer(absIdx, 'down'); }}
                                            disabled={idx === arr.length - 1}
                                            className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed rounded text-[10px]"
                                        >
                                            ↓                                        </button>
                                    </div>

                                    <div
                                        onClick={() => startEditing(absIdx)}
                                        className="flex-1 flex flex-row-reverse items-center gap-3 p-2 rounded bg-slate-800/50 hover:bg-slate-700 cursor-pointer transition border border-transparent hover:border-slate-500 text-right"
                                    >
                                        <div className="w-10 h-10 rounded overflow-hidden bg-slate-700 relative shrink-0">
                                            {(heroInfo?.avatarUrl || p.hero_avatar) ? (
                                                <Image
                                                    src={heroInfo?.avatarUrl || p.hero_avatar || ''}
                                                    alt={p.hero}
                                                    fill
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">?</div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-white text-sm font-bold truncate">{p.name}</div>
                                            <div className="text-slate-400 text-xs truncate">
                                                {heroInfo ? `${heroInfo.alias} (${heroInfo.name})` : (p.hero !== 'Unknown' ? p.hero : '选择英雄...')}
                                            </div>
                                        </div>

                                        <div className="text-slate-500 text-xs font-mono">{Number(p.damage).toLocaleString()}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {editingIndex !== null && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setEditingIndex(null)}
                >
                    <div
                        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-4 pb-3 border-b border-slate-800 sticky top-0 bg-slate-900 rounded-t-xl z-10">
                            <h3 className="text-lg font-bold text-white">编辑信息</h3>
                            <button
                                onClick={() => setEditingIndex(null)}
                                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-600 transition-colors text-lg"
                            >
                                ×                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 pt-3">
                            <div className="mb-4">
                                <label className="block text-xs text-slate-400 mb-1">选手名称</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-xs text-slate-400 mb-1">伤害数值</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500"
                                        value={editDamage}
                                        onChange={(e) => setEditDamage(e.target.value)}
                                    />
                                    <button
                                        onClick={handleSaveNameOrDamage}
                                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded text-sm transition whitespace-nowrap"
                                    >
                                        保存名称/数值                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-slate-800 my-2" />

                            <label className="block text-xs text-slate-400 mb-1">选择英雄并保存</label>
                            <input
                                type="text"
                                placeholder="搜索英雄..."
                                className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white mb-2 focus:border-blue-500 outline-none"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />

                            <div className="space-y-2 pr-2 custom-scrollbar">
                                {filteredHeroes.map((hero) => (
                                    <div
                                        key={hero.id}
                                        onClick={() => handleSelectHero(hero)}
                                        className="flex items-center gap-3 p-2 rounded hover:bg-slate-800 cursor-pointer group"
                                    >
                                        <div className="w-10 h-10 rounded overflow-hidden relative">
                                            <Image src={hero.avatarUrl} alt={hero.name} fill className="object-cover" />
                                        </div>
                                        <div>
                                            <div className="text-slate-200 font-bold group-hover:text-blue-400 transition">{hero.alias}</div>
                                            <div className="text-slate-500 text-xs">{hero.name}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

