import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import ChampionImage from '../ChampionImage';
import { updateGameManualData } from '@/app/entry/upload/actions';

// Extracted from Champion images dir
const CHAMPIONS = [
    { id: 'Aatrox', cn: 'Aatrox' },
    { id: 'Ahri', cn: 'Ahri' },
    { id: 'Akali', cn: 'Akali' },
    { id: 'Akshan', cn: 'Akshan' },
    { id: 'Alistar', cn: 'Alistar' },
    { id: 'Ambessa', cn: 'Ambessa' },
    { id: 'Amumu', cn: 'Amumu' },
    { id: 'Anivia', cn: 'Anivia' },
    { id: 'Annie', cn: 'Annie' },
    { id: 'Aphelios', cn: 'Aphelios' },
    { id: 'Ashe', cn: 'Ashe' },
    { id: 'AurelionSol', cn: 'AurelionSol' },
    { id: 'Aurora', cn: 'Aurora' },
    { id: 'Azir', cn: 'Azir' },
    { id: 'Bard', cn: 'Bard' },
    { id: 'Belveth', cn: 'Belveth' },
    { id: 'Blitzcrank', cn: 'Blitzcrank' },
    { id: 'Brand', cn: 'Brand' },
    { id: 'Braum', cn: 'Braum' },
    { id: 'Briar', cn: 'Briar' },
    { id: 'Caitlyn', cn: 'Caitlyn' },
    { id: 'Camille', cn: 'Camille' },
    { id: 'Cassiopeia', cn: 'Cassiopeia' },
    { id: 'Chogath', cn: 'Chogath' },
    { id: 'Corki', cn: 'Corki' },
    { id: 'Darius', cn: 'Darius' },
    { id: 'Diana', cn: 'Diana' },
    { id: 'Draven', cn: 'Draven' },
    { id: 'DrMundo', cn: 'DrMundo' },
    { id: 'Ekko', cn: 'Ekko' },
    { id: 'Elise', cn: 'Elise' },
    { id: 'Evelynn', cn: 'Evelynn' },
    { id: 'Ezreal', cn: 'Ezreal' },
    { id: 'Fiddlesticks', cn: 'Fiddlesticks' },
    { id: 'Fiora', cn: 'Fiora' },
    { id: 'Fizz', cn: 'Fizz' },
    { id: 'Galio', cn: 'Galio' },
    { id: 'Gangplank', cn: 'Gangplank' },
    { id: 'Garen', cn: 'Garen' },
    { id: 'Gnar', cn: 'Gnar' },
    { id: 'Gragas', cn: 'Gragas' },
    { id: 'Graves', cn: 'Graves' },
    { id: 'Gwen', cn: 'Gwen' },
    { id: 'Hecarim', cn: 'Hecarim' },
    { id: 'Heimerdinger', cn: 'Heimerdinger' },
    { id: 'Hwei', cn: 'Hwei' },
    { id: 'Illaoi', cn: 'Illaoi' },
    { id: 'Irelia', cn: 'Irelia' },
    { id: 'Ivern', cn: 'Ivern' },
    { id: 'Janna', cn: 'Janna' },
    { id: 'JarvanIV', cn: 'JarvanIV' },
    { id: 'Jax', cn: 'Jax' },
    { id: 'Jayce', cn: 'Jayce' },
    { id: 'Jhin', cn: 'Jhin' },
    { id: 'Jinx', cn: 'Jinx' },
    { id: 'Kaisa', cn: 'Kaisa' },
    { id: 'Kalista', cn: 'Kalista' },
    { id: 'Karma', cn: 'Karma' },
    { id: 'Karthus', cn: 'Karthus' },
    { id: 'Kassadin', cn: 'Kassadin' },
    { id: 'Katarina', cn: 'Katarina' },
    { id: 'Kayle', cn: 'Kayle' },
    { id: 'Kayn', cn: 'Kayn' },
    { id: 'Kennen', cn: 'Kennen' },
    { id: 'Khazix', cn: 'Khazix' },
    { id: 'Kindred', cn: 'Kindred' },
    { id: 'Kled', cn: 'Kled' },
    { id: 'KogMaw', cn: 'KogMaw' },
    { id: 'KSante', cn: 'KSante' },
    { id: 'Leblanc', cn: 'Leblanc' },
    { id: 'LeeSin', cn: 'LeeSin' },
    { id: 'Leona', cn: 'Leona' },
    { id: 'Lillia', cn: 'Lillia' },
    { id: 'Lissandra', cn: 'Lissandra' },
    { id: 'Lucian', cn: 'Lucian' },
    { id: 'Lulu', cn: 'Lulu' },
    { id: 'Lux', cn: 'Lux' },
    { id: 'Malphite', cn: 'Malphite' },
    { id: 'Malzahar', cn: 'Malzahar' },
    { id: 'Maokai', cn: 'Maokai' },
    { id: 'MasterYi', cn: 'MasterYi' },
    { id: 'Mel', cn: 'Mel' },
    { id: 'Milio', cn: 'Milio' },
    { id: 'MissFortune', cn: 'MissFortune' },
    { id: 'MonkeyKing', cn: 'MonkeyKing' },
    { id: 'Mordekaiser', cn: 'Mordekaiser' },
    { id: 'Morgana', cn: 'Morgana' },
    { id: 'Naafiri', cn: 'Naafiri' },
    { id: 'Nami', cn: 'Nami' },
    { id: 'Nasus', cn: 'Nasus' },
    { id: 'Nautilus', cn: 'Nautilus' },
    { id: 'Neeko', cn: 'Neeko' },
    { id: 'Nidalee', cn: 'Nidalee' },
    { id: 'Nilah', cn: 'Nilah' },
    { id: 'Nocturne', cn: 'Nocturne' },
    { id: 'Nunu', cn: 'Nunu' },
    { id: 'Olaf', cn: 'Olaf' },
    { id: 'Orianna', cn: 'Orianna' },
    { id: 'Ornn', cn: 'Ornn' },
    { id: 'Pantheon', cn: 'Pantheon' },
    { id: 'Poppy', cn: 'Poppy' },
    { id: 'Pyke', cn: 'Pyke' },
    { id: 'Qiyana', cn: 'Qiyana' },
    { id: 'Quinn', cn: 'Quinn' },
    { id: 'Rakan', cn: 'Rakan' },
    { id: 'Rammus', cn: 'Rammus' },
    { id: 'RekSai', cn: 'RekSai' },
    { id: 'Rell', cn: 'Rell' },
    { id: 'Renata', cn: 'Renata' },
    { id: 'Renekton', cn: 'Renekton' },
    { id: 'Rengar', cn: 'Rengar' },
    { id: 'Riven', cn: 'Riven' },
    { id: 'Rumble', cn: 'Rumble' },
    { id: 'Ryze', cn: 'Ryze' },
    { id: 'Samira', cn: 'Samira' },
    { id: 'Sejuani', cn: 'Sejuani' },
    { id: 'Senna', cn: 'Senna' },
    { id: 'Seraphine', cn: 'Seraphine' },
    { id: 'Sett', cn: 'Sett' },
    { id: 'Shaco', cn: 'Shaco' },
    { id: 'Shen', cn: 'Shen' },
    { id: 'Shyvana', cn: 'Shyvana' },
    { id: 'Singed', cn: 'Singed' },
    { id: 'Sion', cn: 'Sion' },
    { id: 'Sivir', cn: 'Sivir' },
    { id: 'Skarner', cn: 'Skarner' },
    { id: 'Smolder', cn: 'Smolder' },
    { id: 'Sona', cn: 'Sona' },
    { id: 'Soraka', cn: 'Soraka' },
    { id: 'Swain', cn: 'Swain' },
    { id: 'Sylas', cn: 'Sylas' },
    { id: 'Syndra', cn: 'Syndra' },
    { id: 'TahmKench', cn: 'TahmKench' },
    { id: 'Taliyah', cn: 'Taliyah' },
    { id: 'Talon', cn: 'Talon' },
    { id: 'Taric', cn: 'Taric' },
    { id: 'Teemo', cn: 'Teemo' },
    { id: 'Thresh', cn: 'Thresh' },
    { id: 'Tristana', cn: 'Tristana' },
    { id: 'Trundle', cn: 'Trundle' },
    { id: 'Tryndamere', cn: 'Tryndamere' },
    { id: 'TwistedFate', cn: 'TwistedFate' },
    { id: 'Twitch', cn: 'Twitch' },
    { id: 'Udyr', cn: 'Udyr' },
    { id: 'Urgot', cn: 'Urgot' },
    { id: 'Varus', cn: 'Varus' },
    { id: 'Vayne', cn: 'Vayne' },
    { id: 'Veigar', cn: 'Veigar' },
    { id: 'Velkoz', cn: 'Velkoz' },
    { id: 'Vex', cn: 'Vex' },
    { id: 'Vi', cn: 'Vi' },
    { id: 'Viego', cn: 'Viego' },
    { id: 'Viktor', cn: 'Viktor' },
    { id: 'Vladimir', cn: 'Vladimir' },
    { id: 'Volibear', cn: 'Volibear' },
    { id: 'Warwick', cn: 'Warwick' },
    { id: 'Xayah', cn: 'Xayah' },
    { id: 'Xerath', cn: 'Xerath' },
    { id: 'XinZhao', cn: 'XinZhao' },
    { id: 'Yasuo', cn: 'Yasuo' },
    { id: 'Yone', cn: 'Yone' },
    { id: 'Yorick', cn: 'Yorick' },
    { id: 'Yunara', cn: 'Yunara' },
    { id: 'Yuumi', cn: 'Yuumi' },
    { id: 'Zaahen', cn: 'Zaahen' },
    { id: 'Zac', cn: 'Zac' },
    { id: 'Zed', cn: 'Zed' },
    { id: 'Zeri', cn: 'Zeri' },
    { id: 'Ziggs', cn: 'Ziggs' },
    { id: 'Zilean', cn: 'Zilean' },
    { id: 'Zoe', cn: 'Zoe' },
    { id: 'Zyra', cn: 'Zyra' },
];

interface GameSummaryPanelProps {
    game: any;
    match: any;
    activeGameNumber: number;
    isAdmin?: boolean;
}

const ROLE_PLACEHOLDERS = ['\u4e0a\u5355', '\u6253\u91ce', '\u4e2d\u5355', '\u4e0b\u8def', '\u8f85\u52a9'];
const ROLE_KEYS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

function InlineEditIcon({ className = 'w-3 h-3' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}


export default function GameSummaryPanel({ game, match, activeGameNumber, isAdmin = false }: GameSummaryPanelProps) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const hydratedGameKeyRef = useRef('');

    // UI State for Hero Search
    const [activeHeroEdit, setActiveHeroEdit] = useState<{ team: 'A' | 'B', index: number } | null>(null);
    const [heroSearchText, setHeroSearchText] = useState("");

    // Helper to parser analysis JSON safely
    const parseAnalysis = (jsonStr: string | null) => {
        if (!jsonStr) return null;
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            return null;
        }
    };

    const normalizePlayerName = (value: string | null | undefined) =>
        String(value || '').trim().toLowerCase();
    const normalizeRosterRole = (value: string | null | undefined) => {
        const normalized = String(value || '').trim().toLowerCase().replace(/[_\s-]+/g, '');
        if (!normalized) return null;

        if (normalized === '1') return 'TOP';
        if (normalized === '2') return 'JUNGLE';
        if (normalized === '3') return 'MID';
        if (normalized === '4') return 'ADC';
        if (normalized === '5') return 'SUPPORT';
        if (['top', 'toplane', 'baronlane', '\u4e0a\u5355'].includes(normalized)) return 'TOP';
        if (['jun', 'jg', 'jungle', '\u6253\u91ce'].includes(normalized)) return 'JUNGLE';
        if (['mid', 'middle', 'midlane', '\u4e2d\u5355'].includes(normalized)) return 'MID';
        if (['adc', 'ad', 'bot', 'bottom', 'bottomlane', 'carry', '\u4e0b\u8def'].includes(normalized)) return 'ADC';
        if (['sup', 'support', 'roam', '\u8f85\u52a9'].includes(normalized)) return 'SUPPORT';

        return null;
    };
    const getRoleKey = (index: number) => ROLE_KEYS[index] || `ROLE_${index + 1}`;
    const getRolePlaceholder = (index: number) => ROLE_PLACEHOLDERS[index] || `\u4f4d\u7f6e${index + 1}`;
    const attachSourceIndex = (players: any[]) =>
        players.map((player, index) => ({
            ...player,
            __sourceIndex: typeof player?.__sourceIndex === 'number' ? player.__sourceIndex : index,
        }));
    const getPlayerSourceIndex = (player: any, fallbackIndex: number) =>
        typeof player?.__sourceIndex === 'number' ? player.__sourceIndex : fallbackIndex;
    const stripPlayerMeta = (player: any) => {
        const next = { ...player };
        delete next.__sourceIndex;
        delete next.__displayOrder;
        delete next.__roleOrder;
        return next;
    };
    const buildRosterCandidatesByRole = (roster: any[]) => {
        const candidateMap = new Map<string, any[]>();
        const seen = new Set<string>();

        roster.forEach((member: any) => {
            const roleKey = normalizeRosterRole(member?.role || member?.position || member?.lane);
            const name = String(member?.name || '').trim();
            if (!roleKey || !name) return;

            const id = String(member?.id || '').trim();
            const uniqueKey = `${roleKey}::${id || normalizePlayerName(name)}`;
            if (seen.has(uniqueKey)) return;
            seen.add(uniqueKey);

            const nextMember = { id, name, roleKey };
            candidateMap.set(roleKey, [...(candidateMap.get(roleKey) || []), nextMember]);
        });

        return candidateMap;
    };
    const getRoleCandidates = (candidateMap: Map<string, any[]>, roleIndex: number) =>
        candidateMap.get(getRoleKey(roleIndex)) || [];
    const getCandidateOptionValue = (candidate: any) =>
        candidate?.id ? `id:${candidate.id}` : `name:${normalizePlayerName(candidate?.name)}`;
    const findMatchingCandidate = (player: any, candidates: any[]) => {
        const playerId = String(player?.playerId || '').trim();
        const playerName = normalizePlayerName(player?.playerName || player?.name);

        return candidates.find((candidate) => {
            const candidateId = String(candidate?.id || '').trim();
            const candidateName = normalizePlayerName(candidate?.name);
            if (playerId && candidateId && playerId === candidateId) return true;
            if (playerName && candidateName && playerName === candidateName) return true;
            return false;
        }) || null;
    };
    const getManualPlayerIdentity = (player: any) => ({
        name: String(player?.playerName || player?.name || '').trim(),
        id: String(player?.playerId || '').trim(),
    });
    const getEffectivePlayerIdentity = (player: any, candidates: any[]) => {
        const matched = findMatchingCandidate(player, candidates);
        if (matched) {
            return {
                name: matched.name,
                id: String(matched.id || '').trim(),
                matched: true,
            };
        }

        const manual = getManualPlayerIdentity(player);
        if (manual.name || manual.id) {
            return {
                name: manual.name,
                id: manual.id,
                matched: false,
            };
        }

        if (candidates.length > 0) {
            const fallback = candidates[0];
            return {
                name: fallback.name,
                id: String(fallback.id || '').trim(),
                matched: true,
            };
        }

        return { name: '', id: '', matched: false };
    };
    const applyEffectivePlayerIdentity = (player: any, candidates: any[]) => {
        const effective = getEffectivePlayerIdentity(player, candidates);
        const next = { ...player };

        if (!String(next.playerName || next.name || '').trim() && effective.name) {
            next.playerName = effective.name;
            next.name = effective.name;
        }
        if (!String(next.playerId || '').trim() && effective.id) {
            next.playerId = effective.id;
        }

        return next;
    };
    const getRosterOrder = (player: any, roster: any[]) => {
        const playerId = String(player?.playerId || '').trim();
        const playerName = normalizePlayerName(player?.playerName || player?.name);
        const rosterIndex = roster.findIndex((member: any) => {
            const memberId = String(member?.id || '').trim();
            const memberName = normalizePlayerName(member?.name);
            if (playerId && memberId && playerId === memberId) return true;
            if (playerName && memberName && playerName === memberName) return true;
            return false;
        });
        return rosterIndex >= 0 ? rosterIndex : 999;
    };
    const getStatRoleOrder = (player: any) => {
        const roleKey = normalizeRosterRole(player?.role || player?.position || player?.lane);
        if (roleKey === 'TOP') return 0;
        if (roleKey === 'JUNGLE') return 1;
        if (roleKey === 'MID') return 2;
        if (roleKey === 'ADC') return 3;
        if (roleKey === 'SUPPORT') return 4;
        return 999;
    };
    const sortStatsForDisplay = (players: any[], roster: any[]) =>
        [...players]
            .map((player, fallbackIndex) => ({
                ...player,
                __roleOrder: getStatRoleOrder(player),
                __displayOrder: getRosterOrder(player, roster),
                __sourceIndex: getPlayerSourceIndex(player, fallbackIndex),
            }))
            .sort((left, right) => {
                if (left.__roleOrder !== right.__roleOrder) {
                    return left.__roleOrder - right.__roleOrder;
                }
                if (left.__displayOrder !== right.__displayOrder) {
                    return left.__displayOrder - right.__displayOrder;
                }
                return left.__sourceIndex - right.__sourceIndex;
            });

    const normalizeKdaInput = (value: string) => {
        const cleaned = String(value || '')
            .replace(/[，,]/g, '/')
            .replace(/\s+/g, '')
            .replace(/[^0-9/]/g, '');

        const parts = cleaned.split('/');
        if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
            return {
                k: Number(parts[0]),
                d: Number(parts[1]),
                a: Number(parts[2]),
            };
        }

        return null;
    };

    const toNonNegativeInt = (value: any): number => {
        const digits = String(value ?? '').replace(/[^0-9]/g, '');
        if (!digits) return 0;
        const parsed = parseInt(digits, 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    const getPlayerKdaTriplet = (player: any): { k: number; d: number; a: number } => {
        const hasNumericFields = [player?.kills, player?.deaths, player?.assists].some((v) => v !== undefined && v !== null && String(v) !== "");
        if (hasNumericFields) {
            return {
                k: toNonNegativeInt(player?.kills),
                d: toNonNegativeInt(player?.deaths),
                a: toNonNegativeInt(player?.assists),
            };
        }

        const parsed = normalizeKdaInput(String(player?.kda || ""));
        if (parsed) {
            return { k: parsed.k, d: parsed.d, a: parsed.a };
        }

        return { k: 0, d: 0, a: 0 };
    };

    const extractPlayersFromParsed = (parsed: any, side: 'A' | 'B') => {
        if (!parsed) return [];
        if (Array.isArray(parsed) && parsed.length > 0) return attachSourceIndex(parsed);
        if (Array.isArray(parsed?.players) && parsed.players.length > 0) return attachSourceIndex(parsed.players);

        const sidePlayers = side === 'A' ? parsed?.teamA?.players : parsed?.teamB?.players;
        if (Array.isArray(sidePlayers) && sidePlayers.length > 0) return attachSourceIndex(sidePlayers);

        if (Array.isArray(parsed?.damage_data) && parsed.damage_data.length > 0) {
            const start = side === 'A' ? 0 : 5;
            const end = side === 'A' ? 5 : 10;
            const sliced = parsed.damage_data.slice(start, end);
            if (sliced.length > 0) return attachSourceIndex(sliced);
        }

        return [];
    };

    const getInitialStats = useCallback((statsBlob: string | null, side: 'A' | 'B', analysisBlob?: string | null) => {
        const parsedStats = parseAnalysis(statsBlob);
        const fromStats = extractPlayersFromParsed(parsedStats, side);
        if (fromStats.length > 0) return fromStats;

        const parsedAnalysis = parseAnalysis(analysisBlob || null);
        const fromAnalysis = extractPlayersFromParsed(parsedAnalysis, side);
        if (fromAnalysis.length > 0) return fromAnalysis;

        return attachSourceIndex(Array.from({ length: 5 }, () => ({})));
    }, []);

    const createEditSnapshot = useCallback(() => ({
        winnerId: game?.winnerId || null,
        blueTenMinKills: game?.blueTenMinKills ?? '',
        redTenMinKills: game?.redTenMinKills ?? '',
        blueKills: game?.blueKills || 0,
        redKills: game?.redKills || 0,
        duration: game?.duration || 0,
        blueSideTeamId: game?.blueSideTeamId || match.teamA?.id,
        redSideTeamId: game?.redSideTeamId || match.teamB?.id,
        teamAStats: getInitialStats(game?.teamAStats || null, 'A', game?.analysisData),
        teamBStats: getInitialStats(game?.teamBStats || null, 'B', game?.analysisData),
    }), [
        game?.winnerId,
        game?.blueTenMinKills,
        game?.redTenMinKills,
        game?.blueKills,
        game?.redKills,
        game?.duration,
        game?.blueSideTeamId,
        game?.redSideTeamId,
        game?.teamAStats,
        game?.teamBStats,
        game?.analysisData,
        match.teamA?.id,
        match.teamB?.id,
        getInitialStats,
    ]);

    // Initial Data Sync: only hydrate when entering a different game/tab, not on every parent refresh.
    useEffect(() => {
        if (!game) return;
        const nextGameKey = `${game.id || 'unknown'}:${activeGameNumber}`;
        if (hydratedGameKeyRef.current === nextGameKey && editData) return;
        hydratedGameKeyRef.current = nextGameKey;
        setEditData(createEditSnapshot());
    }, [game?.id, activeGameNumber, editData, createEditSnapshot]);

    if (!game) {
        return (
            <div className="flex-1 glass rounded-3xl overflow-hidden flex flex-col justify-center items-center p-10 min-h-[400px]">
                <span className="text-slate-500 font-black text-xs uppercase tracking-[0.2em] animate-pulse">Initializing Game Data Stream...</span>
            </div>
        );
    }

    const updateStatsByKey = (key: 'teamAStats' | 'teamBStats', updater: (stats: any[]) => any[]) => {
        setEditData((current: any) => ({
            ...current,
            [key]: updater([...(current?.[key] || [])]),
        }));
    };
    const resolveStatsKey = (team: 'A' | 'B' | 'teamAStats' | 'teamBStats') =>
        team === 'A' ? 'teamAStats' : team === 'B' ? 'teamBStats' : team;
    const handlePlayerChange = (team: 'A' | 'B' | 'teamAStats' | 'teamBStats', index: number, field: string, value: any) => {
        const key = resolveStatsKey(team);
        const newStats = [...editData[key]];
        const player = { ...newStats[index] };

        if (field === 'kda') {
            player.kda = value;
            const parsed = normalizeKdaInput(value);
            if (parsed) {
                player.kills = parsed.k;
                player.deaths = parsed.d;
                player.assists = parsed.a;
            }
        } else if (field === 'kills' || field === 'deaths' || field === 'assists') {
            const current = getPlayerKdaTriplet(player);
            const nextValue = toNonNegativeInt(value);
            if (field === 'kills') current.k = nextValue;
            if (field === 'deaths') current.d = nextValue;
            if (field === 'assists') current.a = nextValue;
            player.kills = current.k;
            player.deaths = current.d;
            player.assists = current.a;
            player.kda = `${current.k}/${current.d}/${current.a}`;
        } else if (field === 'hero') {
            player.championName = value;
            player.hero = value; // Legacy compat
        } else if (field === 'name') {
            player.playerName = value;
            player.name = value; // Legacy compat
            player.playerId = '';
        } else {
            player[field] = value;
        }

        newStats[index] = player;
        setEditData({ ...editData, [key]: newStats });
    };
    const handlePlayerSelection = (team: 'A' | 'B' | 'teamAStats' | 'teamBStats', index: number, candidate: any) => {
        const key = resolveStatsKey(team);
        updateStatsByKey(key, (stats) => {
            const next = [...stats];
            const player = { ...(next[index] || {}) };
            player.playerName = candidate?.name || '';
            player.name = candidate?.name || '';
            player.playerId = String(candidate?.id || '').trim();
            next[index] = player;
            return next;
        });
    };

    const display = editData || {
        blueTenMinKills: game.blueTenMinKills ?? '',
        redTenMinKills: game.redTenMinKills ?? '',
        blueKills: game.blueKills || 0,
        redKills: game.redKills || 0,
        duration: game.duration || 0,
        blueSideTeamId: game.blueSideTeamId || match.teamA?.id,
        redSideTeamId: game.redSideTeamId || match.teamB?.id,
        teamAStats: getInitialStats(game.teamAStats, 'A', game.analysisData),
        teamBStats: getInitialStats(game.teamBStats, 'B', game.analysisData),
    };
    // FIXED: Use current display side teams so roster autofill and side switching stay in sync.
    let blueTeam = match.teamA;
    let redTeam = match.teamB;

    if (display.blueSideTeamId) {
        blueTeam = match.teamA?.id === display.blueSideTeamId ? match.teamA : match.teamB;
    }
    if (display.redSideTeamId) {
        redTeam = match.teamA?.id === display.redSideTeamId ? match.teamA : match.teamB;
    }

    const blueTeamName = blueTeam?.shortName || blueTeam?.name || 'Blue Team';
    const redTeamName = redTeam?.shortName || redTeam?.name || 'Red Team';

    const isBlueWin = display.winnerId === blueTeam?.id || display.winnerId === 'Blue';
    const isRedWin = display.winnerId === redTeam?.id || display.winnerId === 'Red';

    const hasBlueTenMinKills = display.blueTenMinKills !== '' && display.blueTenMinKills !== null && display.blueTenMinKills !== undefined;
    const hasRedTenMinKills = display.redTenMinKills !== '' && display.redTenMinKills !== null && display.redTenMinKills !== undefined;
    const hasTenMinKillStats = hasBlueTenMinKills && hasRedTenMinKills;
    const blueTenMinDisplay = hasBlueTenMinKills ? Number(display.blueTenMinKills) : null;
    const redTenMinDisplay = hasRedTenMinKills ? Number(display.redTenMinKills) : null;
    const totalTenMinDisplay = hasTenMinKillStats ? Number(display.blueTenMinKills) + Number(display.redTenMinKills) : null;

    // Create a Set of valid player IDs from the match rosters to prevent 404s
    const validPlayerIds = new Set<string>();
    match.teamA?.players?.forEach((p: any) => validPlayerIds.add(p.id));
    match.teamB?.players?.forEach((p: any) => validPlayerIds.add(p.id));

    // Name-based fallback map for stale playerId cases after dedupe/migration
    const rosterPlayerByTeamAndName = new Map<string, string>();
    const rosterPlayerByName = new Map<string, string>();
    const registerRosterPlayer = (teamId: string | null | undefined, p: any) => {
        const nameKey = normalizePlayerName(p?.name);
        if (!nameKey) return;

        if (!rosterPlayerByName.has(nameKey)) {
            rosterPlayerByName.set(nameKey, p.id);
        }
        if (teamId) {
            const teamKey = `${teamId}::${nameKey}`;
            if (!rosterPlayerByTeamAndName.has(teamKey)) {
                rosterPlayerByTeamAndName.set(teamKey, p.id);
            }
        }
    };
    match.teamA?.players?.forEach((p: any) => registerRosterPlayer(match.teamA?.id, p));
    match.teamB?.players?.forEach((p: any) => registerRosterPlayer(match.teamB?.id, p));

    const resolvePlayerHref = (
        playerId: string | null | undefined,
        playerName: string | null | undefined,
        primaryTeamId?: string | null,
        secondaryTeamId?: string | null,
    ) => {
        const id = typeof playerId === 'string' ? playerId.trim() : '';
        if (id && validPlayerIds.has(id)) {
            return `/players/${id}`;
        }

        const nameKey = normalizePlayerName(playerName);
        if (nameKey) {
            const primary = primaryTeamId ? rosterPlayerByTeamAndName.get(`${primaryTeamId}::${nameKey}`) : null;
            const secondary = secondaryTeamId ? rosterPlayerByTeamAndName.get(`${secondaryTeamId}::${nameKey}`) : null;
            const anyTeam = rosterPlayerByName.get(nameKey);
            const fallbackId = primary || secondary || anyTeam;
            if (fallbackId) {
                return `/players/${fallbackId}`;
            }
        }

        return `/players?search=${encodeURIComponent(String(playerName || '').trim())}`;
    };
    // Smart Alignment: Check if stats need to be swapped based on roster alignment
    // Sometimes data source has Team A stats in teamBStats column or vice versa
    let alignedTeamAStats = display.teamAStats;
    let alignedTeamBStats = display.teamBStats;

    if (match.teamA?.players && match.teamB?.players) {
        let aStatsForA = 0, aStatsForB = 0;
        let bStatsForA = 0, bStatsForB = 0;

        const teamAIds = new Set(match.teamA.players.map((p: any) => p.id));
        const teamBIds = new Set(match.teamB.players.map((p: any) => p.id));

        // Create Name Sets for fallback (lowercase for case-insensitive match)
        const teamANames = new Set(match.teamA.players.map((p: any) => p.name?.toLowerCase()));
        const teamBNames = new Set(match.teamB.players.map((p: any) => p.name?.toLowerCase()));

        display.teamAStats?.forEach((p: any) => {
            const pId = p.playerId;
            const pName = (p.playerName || p.name)?.toLowerCase();

            // Try ID match first
            if (pId) {
                if (teamAIds.has(pId)) { aStatsForA += 2; return; } // +2 for strong ID match
                if (teamBIds.has(pId)) { aStatsForB += 2; return; }
            }

            // Fallback to Name match
            if (pName) {
                if (teamANames.has(pName)) aStatsForA += 1; // +1 for name match
                else if (teamBNames.has(pName)) aStatsForB += 1;
            }
        });

        display.teamBStats?.forEach((p: any) => {
            const pId = p.playerId;
            const pName = (p.playerName || p.name)?.toLowerCase();

            if (pId) {
                if (teamAIds.has(pId)) { bStatsForA += 2; return; }
                if (teamBIds.has(pId)) { bStatsForB += 2; return; }
            }

            if (pName) {
                if (teamANames.has(pName)) bStatsForA += 1;
                else if (teamBNames.has(pName)) bStatsForB += 1;
            }
        });

        // if teamAStats matches B better than A, AND teamBStats matches A better than B -> SWAP
        // Using strict greater than to avoid aggressive swapping on ties
        if (aStatsForB > aStatsForA && bStatsForA > bStatsForB) {
            alignedTeamAStats = display.teamBStats;
            alignedTeamBStats = display.teamAStats;
        }
    }

    // Determine which stats go to Blue (Left) and Red (Right) using ALIGNED stats
    const isSwapped = blueTeam?.id === match.teamB?.id;
    const bluePlayerStats = isSwapped ? alignedTeamBStats : alignedTeamAStats;
    const redPlayerStats = isSwapped ? alignedTeamAStats : alignedTeamBStats;
    const orderedBluePlayerStats = sortStatsForDisplay(bluePlayerStats || [], blueTeam?.players || []);
    const orderedRedPlayerStats = sortStatsForDisplay(redPlayerStats || [], redTeam?.players || []);
    const blueStatsKey: 'teamAStats' | 'teamBStats' = bluePlayerStats === display.teamAStats ? 'teamAStats' : 'teamBStats';
    const redStatsKey: 'teamAStats' | 'teamBStats' = redPlayerStats === display.teamAStats ? 'teamAStats' : 'teamBStats';
    const blueRosterCandidatesByRole = buildRosterCandidatesByRole(blueTeam?.players || []);
    const redRosterCandidatesByRole = buildRosterCandidatesByRole(redTeam?.players || []);
    const blueRoleIndexBySource = new Map<number, number>(
        orderedBluePlayerStats.map((player: any, index: number) => [getPlayerSourceIndex(player, index), index]),
    );
    const redRoleIndexBySource = new Map<number, number>(
        orderedRedPlayerStats.map((player: any, index: number) => [getPlayerSourceIndex(player, index), index]),
    );
    const getSideCandidates = (side: 'blue' | 'red', roleIndex: number) =>
        getRoleCandidates(side === 'blue' ? blueRosterCandidatesByRole : redRosterCandidatesByRole, roleIndex);
    const getSelectOptions = (player: any, candidates: any[]) => {
        const manual = getManualPlayerIdentity(player);
        const matched = findMatchingCandidate(player, candidates);
        if ((!matched && (manual.name || manual.id)) || candidates.length === 0) {
            return [
                {
                    id: manual.id,
                    name: manual.name || getRolePlaceholder(0),
                    isManual: true,
                },
                ...candidates,
            ];
        }
        return candidates;
    };
    const buildStatsForSave = (statsKey: 'teamAStats' | 'teamBStats') => {
        const rawStats = [...(editData?.[statsKey] || [])];
        const roleIndexMap = statsKey === blueStatsKey ? blueRoleIndexBySource : redRoleIndexBySource;
        const candidateMap = statsKey === blueStatsKey ? blueRosterCandidatesByRole : redRosterCandidatesByRole;

        return rawStats.map((player: any, fallbackIndex: number) => {
            const sourceIndex = getPlayerSourceIndex(player, fallbackIndex);
            const roleIndex = roleIndexMap.get(sourceIndex) ?? fallbackIndex;
            const candidates = getRoleCandidates(candidateMap, roleIndex);
            return stripPlayerMeta(applyEffectivePlayerIdentity(player, candidates));
        });
    };
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const result = await updateGameManualData(game.id, {
                winnerId: editData.winnerId || null,
                blueTenMinKills: editData.blueTenMinKills === '' ? null : Number(editData.blueTenMinKills),
                redTenMinKills: editData.redTenMinKills === '' ? null : Number(editData.redTenMinKills),
                blueKills: Number(editData.blueKills),
                redKills: Number(editData.redKills),
                totalKills: Number(editData.blueKills) + Number(editData.redKills),
                duration: Number(editData.duration),
                blueSideTeamId: editData.blueSideTeamId,
                redSideTeamId: editData.redSideTeamId,
                teamAStats: JSON.stringify(buildStatsForSave('teamAStats')),
                teamBStats: JSON.stringify(buildStatsForSave('teamBStats')),
            });

            if (!result?.success) {
                throw new Error(result?.error || 'Save failed');
            }

            setEditData((current: any) => current ? { ...current } : current);
            setIsEditing(false);
            router.refresh();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Save failed');
            console.error(error);
        } finally {
            setIsSaving(false);
            setActiveHeroEdit(null);
        }
    };

    return (
        <div className="flex-1 glass rounded-3xl overflow-hidden flex flex-col relative group">

            {/* HERO SELECT MODAL - UI FIX: mount with Portal to body to avoid overflow clipping */}
            {activeHeroEdit && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setActiveHeroEdit(null)}>
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-white uppercase  tracking-tighter">SELECT CHAMPION</h3>
                            <button onClick={() => setActiveHeroEdit(null)} className="text-slate-500 hover:text-white p-1 transition">
                                ✕
                            </button>
                        </div>
                        <input
                            autoFocus
                            className="w-full bg-slate-950 border border-slate-800 text-white text-base px-6 py-4 rounded-2xl focus:outline-none focus:border-blue-500/30 mb-6 transition-all shadow-inner placeholder-slate-700 font-bold"
                            placeholder="SEARCH CHAMPION..."
                            value={heroSearchText}
                            onChange={e => setHeroSearchText(e.target.value)}
                        />
                        <div className="flex-1 overflow-y-auto grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-x-3 gap-y-5 p-2">
                            {CHAMPIONS.filter(c => c.id.toLowerCase().includes(heroSearchText.toLowerCase()) || c.cn.includes(heroSearchText)).map(champ => (
                                <div
                                    key={champ.id}
                                    className="flex flex-col items-center gap-2 rounded-xl cursor-pointer transition-all group"
                                    onClick={() => {
                                        handlePlayerChange(activeHeroEdit.team, activeHeroEdit.index, 'hero', champ.id);
                                        setActiveHeroEdit(null);
                                    }}
                                >
                                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 relative border border-slate-800 group-hover:border-blue-500 group-hover:shadow-lg group-hover:shadow-blue-500/20 group-hover:-translate-y-1 transition-all">
                                        <ChampionImage name={champ.id} className="w-full h-full" fallbackContent={<div className="bg-slate-800 w-full h-full"></div>} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold truncate w-full text-center group-hover:text-white transition-colors" title={champ.cn}>{champ.cn}</span>
                                </div>
                            ))}
                            {CHAMPIONS.filter(c => c.id.toLowerCase().includes(heroSearchText.toLowerCase()) || c.cn.includes(heroSearchText)).length === 0 && (
                                <div className="col-span-full py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">NO HEROES FOUND</div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Action Bar (Top Right Overlay) */}
            <div className="absolute top-4 right-4 z-[100] flex items-center gap-2">
                {isAdmin && (
                    <>
                        {isEditing ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setActiveHeroEdit(null);
                                        setEditData({
                                            winnerId: game.winnerId || null,
                                            blueTenMinKills: game.blueTenMinKills ?? '',
                                            redTenMinKills: game.redTenMinKills ?? '',
                                            blueKills: game.blueKills || 0,
                                            redKills: game.redKills || 0,
                                            duration: game.duration || 0,
                                            blueSideTeamId: game.blueSideTeamId || match.teamA?.id,
                                            redSideTeamId: game.redSideTeamId || match.teamB?.id,
                                            teamAStats: getInitialStats(game.teamAStats, 'A', game.analysisData),
                                            teamBStats: getInitialStats(game.teamBStats, 'B', game.analysisData),
                                        });
                                    }}
                                    type="button"
                                    title="取消"
                                    aria-label="取消"
                                    className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/15 flex items-center justify-center"
                                >
                                    ×
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    type="button"
                                    title="完成"
                                    aria-label="完成"
                                    className="w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white border border-white/20 flex items-center justify-center disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    ) : (
                                        '√'
                                    )}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                type="button"
                                title="Edit data"
                                aria-label="Edit data"
                                className="w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 transition-all border border-white/20 flex items-center justify-center"
                            >
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* COMPACT SUMMARY HEADER */}
            <div className={`p-6 pb-4 relative overflow-hidden ${isEditing ? 'bg-blue-50/50 border-b border-gray-100' : ''}`}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-full bg-blue-50/30 blur-3xl rounded-full pointer-events-none"></div>

                <div className="flex items-center justify-between relative z-10 px-4 lg:px-6">
                    {/* Left Team (Blue) */}
                    <div className="flex flex-col items-center flex-1 pr-16 lg:pr-24">
                        {isEditing ? (
                            <select
                                className="bg-slate-900 border border-slate-800 text-white font-black text-xl lg:text-2xl p-2 rounded-xl text-center mb-1 max-w-[140px] truncate shadow-sm"
                                value={display.blueSideTeamId || match.teamA?.id}
                                onChange={(e) => setEditData({ ...display, blueSideTeamId: e.target.value })}
                            >
                                <option value={match.teamA?.id}>{match.teamA?.shortName || match.teamA?.name}</option>
                                <option value={match.teamB?.id}>{match.teamB?.shortName || match.teamB?.name}</option>
                            </select>
                        ) : (
                            <span className="text-2xl lg:text-3xl font-black text-white tracking-tight text-center leading-tight truncate w-full px-2  uppercase">{blueTeamName}</span>
                        )}
                        {isEditing ? (
                            <input
                                type="text"
                                inputMode="numeric"
                                className="w-20 bg-slate-900 border border-slate-800 text-center text-4xl font-black text-blue-400 p-2 rounded-2xl mt-1 shadow-inner"
                                value={display.blueKills}
                                onChange={(e) => setEditData({ ...display, blueKills: e.target.value })}
                            />
                        ) : (
                            <span className="text-4xl lg:text-6xl font-black text-blue-400 mt-2">{display.blueKills}</span>
                        )}
                        {isEditing ? (
                            <button
                                type="button"
                                onClick={() => {
                                    const blueId = display.blueSideTeamId || match.teamA?.id;
                                    setEditData({ ...display, winnerId: display.winnerId === blueId ? null : blueId });
                                }}
                                className={`px-3 py-1 mt-2 text-[9px] font-black rounded-full uppercase tracking-widest transition-all border ${display.winnerId === (display.blueSideTeamId || match.teamA?.id)
                                    ? 'bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-500/30'
                                    : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-blue-400 hover:text-blue-400'
                                    }`}
                            >
                                {display.winnerId === (display.blueSideTeamId || match.teamA?.id) ? '✓ 胜方' : '设为胜方'}
                            </button>
                        ) : (
                            isBlueWin && (
                                <span className="px-3 py-1 mt-2 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded-full border border-blue-500/20 uppercase tracking-widest">VICTOR</span>
                            )
                        )}
                    </div>

                    {/* Center Stats (Total & Duration) - Absolutely Centered */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center z-20 bg-gray-50/80 backdrop-blur-md px-6 py-3 rounded-3xl border border-gray-100 shadow-sm">
                        <div className="flex flex-col items-center justify-center">
                            <span className="text-3xl lg:text-5xl font-black text-gray-900 leading-none tracking-tighter">
                                {Number(display.blueKills) + Number(display.redKills)}
                            </span>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] mt-1">TOTAL KILLS</span>

                            {isEditing ? (
                                <div className="flex items-center gap-1 mt-2">
                                    <div className="flex items-center bg-white border border-gray-100 rounded-xl px-2 py-1 shadow-inner">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            className="w-10 bg-transparent text-center text-sm font-black text-gray-900 focus:outline-none appearance-none"
                                            placeholder="MM"
                                            value={Math.floor((display.duration || 0) / 60)}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                const secs = (display.duration || 0) % 60;
                                                setEditData({ ...display, duration: (val * 60) + secs });
                                            }}
                                        />
                                        <span className="text-gray-300 text-sm font-black">:</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            className="w-10 bg-transparent text-center text-sm font-black text-gray-900 focus:outline-none appearance-none"
                                            placeholder="SS"
                                            max={59}
                                            value={(display.duration || 0) % 60}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                const mins = Math.floor((display.duration || 0) / 60);
                                                setEditData({ ...display, duration: (mins * 60) + val });
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
                                    {Math.floor((display.duration || 0) / 60)}:{(display.duration || 0) % 60 < 10 ? '0' : ''}{(display.duration || 0) % 60}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right Team (Red) */}
                    <div className="flex flex-col items-center flex-1 pl-16 lg:pl-24">
                        {isEditing ? (
                            <select
                                className="bg-slate-900 border border-slate-800 text-white font-black text-xl lg:text-2xl p-2 rounded-xl text-center mb-1 max-w-[140px] truncate shadow-sm"
                                value={display.redSideTeamId || match.teamB?.id}
                                onChange={(e) => setEditData({ ...display, redSideTeamId: e.target.value })}
                            >
                                <option value={match.teamA?.id}>{match.teamA?.shortName || match.teamA?.name}</option>
                                <option value={match.teamB?.id}>{match.teamB?.shortName || match.teamB?.name}</option>
                            </select>
                        ) : (
                            <span className="text-2xl lg:text-3xl font-black text-white tracking-tight text-center leading-tight truncate w-full px-2  uppercase">{redTeamName}</span>
                        )}
                        {isEditing ? (
                            <input
                                type="text"
                                inputMode="numeric"
                                className="w-20 bg-slate-900 border border-slate-800 text-center text-4xl font-black text-red-400 p-2 rounded-2xl mt-1 shadow-inner"
                                value={display.redKills}
                                onChange={(e) => setEditData({ ...display, redKills: e.target.value })}
                            />
                        ) : (
                            <span className="text-4xl lg:text-6xl font-black text-red-500 mt-2">{display.redKills}</span>
                        )}
                        {isEditing ? (
                            <button
                                type="button"
                                onClick={() => {
                                    const redId = display.redSideTeamId || match.teamB?.id;
                                    setEditData({ ...display, winnerId: display.winnerId === redId ? null : redId });
                                }}
                                className={`px-3 py-1 mt-2 text-[9px] font-black rounded-full uppercase tracking-widest transition-all border ${display.winnerId === (display.redSideTeamId || match.teamB?.id)
                                    ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/30'
                                    : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-red-400 hover:text-red-400'
                                    }`}
                            >
                                {display.winnerId === (display.redSideTeamId || match.teamB?.id) ? '✓ 胜方' : '设为胜方'}
                            </button>
                        ) : (
                            isRedWin && (
                                <span className="px-3 py-1 mt-2 bg-red-500/10 text-red-400 text-[9px] font-black rounded-full border border-red-500/20 uppercase tracking-widest">VICTOR</span>
                            )
                        )}
                    </div>
                </div>

                <div className="relative z-10 mb-2 mt-6 flex justify-center gap-4">
                    <div className={`flex w-48 flex-col items-center rounded-2xl border border-gray-100 bg-gray-50 p-3 shadow-sm ${isEditing ? 'border-blue-500/30' : ''}`}>
                        <span className="mb-2 text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">10M KILL RECORDS</span>
                        <div className="flex w-full items-center justify-between px-2">
                            {isEditing ? (
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-12 rounded-lg border border-gray-100 bg-white p-1 text-center text-base font-black text-blue-600 shadow-inner"
                                    value={display.blueTenMinKills}
                                    onChange={(e) => setEditData({ ...display, blueTenMinKills: e.target.value })}
                                />
                            ) : (
                                <span className={`font-black ${hasBlueTenMinKills ? 'text-lg text-blue-600' : 'text-xs text-gray-400'}`}>
                                    {hasBlueTenMinKills ? blueTenMinDisplay : '未统计'}
                                </span>
                            )}

                            <div className="flex flex-col items-center border-x border-gray-200 px-3">
                                <span className={`leading-none font-black ${hasTenMinKillStats ? 'text-xl text-gray-900' : 'text-xs text-gray-400'}`}>
                                    {hasTenMinKillStats ? totalTenMinDisplay : '未统计'}
                                </span>
                            </div>

                            {isEditing ? (
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-12 rounded-lg border border-gray-100 bg-white p-1 text-center text-base font-black text-red-500 shadow-inner"
                                    value={display.redTenMinKills}
                                    onChange={(e) => setEditData({ ...display, redTenMinKills: e.target.value })}
                                />
                            ) : (
                                <span className={`font-black ${hasRedTenMinKills ? 'text-lg text-red-500' : 'text-xs text-gray-400'}`}>
                                    {hasRedTenMinKills ? redTenMinDisplay : '未统计'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-0 border-t border-gray-100 rounded-none overflow-hidden shrink-0">
                {/* SPLIT / MIRRORED SCOREBOARD */}
                <div className="flex flex-1">
                    {/* BLUE TEAM */}
                    <div className="flex-1 border-r border-gray-100 bg-blue-50/10 p-6">
                        <div className="flex text-[9px] font-black text-gray-400 uppercase mb-4 px-2 tracking-[0.2em]">
                            <span className="w-10">Hero</span>
                            <span className="flex-1 pl-4">Player / Identifier</span>
                            <span className="w-36 text-right mr-3 group-hover/stats:text-blue-400 transition-colors cursor-help">KDA</span>
                        </div>
                        <div className="space-y-3">
                            {orderedBluePlayerStats.map((p: any, i: number) => {
                                const heroName = p.championName || p.hero;
                                const rolePlaceholder = getRolePlaceholder(i);
                                const roleCandidates = getSideCandidates('blue', i);
                                const effectivePlayer = getEffectivePlayerIdentity(p, roleCandidates);
                                const playerName = effectivePlayer.name;
                                const playerHref = resolvePlayerHref(effectivePlayer.id || p.playerId, playerName, blueTeam?.id, redTeam?.id);
                                const sourceIndex = getPlayerSourceIndex(p, i);
                                const selectOptions = getSelectOptions(p, roleCandidates);
                                const selectedValue = findMatchingCandidate(p, roleCandidates)
                                    ? getCandidateOptionValue(findMatchingCandidate(p, roleCandidates))
                                    : ((getManualPlayerIdentity(p).name || getManualPlayerIdentity(p).id) && selectOptions[0]?.isManual
                                        ? `manual:${getManualPlayerIdentity(p).id || normalizePlayerName(getManualPlayerIdentity(p).name)}`
                                        : (roleCandidates[0] ? getCandidateOptionValue(roleCandidates[0]) : ''));

                                return (
                                    <div key={sourceIndex} className="flex items-center px-2 py-2 rounded-2xl hover:bg-slate-800/50 transition-all border-b border-transparent last:border-0 relative group">
                                        <div className="w-10 h-10 bg-slate-800 rounded-xl border border-white/5 relative shrink-0 overflow-hidden">
                                            {heroName ? (
                                                <ChampionImage
                                                    name={heroName}
                                                    className="w-full h-full"
                                                    fallbackContent={
                                                        <span className="text-[6px] text-white flex items-center justify-center h-full break-words text-center leading-none bg-slate-900 p-0.5">
                                                            {heroName}
                                                        </span>
                                                    }
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-slate-900/40" />
                                            )}
                                            {isEditing && (
                                                <div
                                                    className="absolute inset-0 z-10 cursor-pointer bg-slate-900/60 backdrop-blur-[2px] hover:bg-slate-900/80 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveHeroEdit({ team: 'A', index: sourceIndex });
                                                        setHeroSearchText('');
                                                    }}
                                                >
                                                    <span className="w-6 h-6 rounded-full bg-blue-600/90 border border-white/20 text-white flex items-center justify-center shadow-md pointer-events-none"><InlineEditIcon className="w-3 h-3" /></span>
                                                </div>
                                            )}

                                            {isEditing && activeHeroEdit?.team === 'A' && activeHeroEdit?.index === sourceIndex && (
                                                <div className="absolute inset-0 ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0f141e] rounded-lg pointer-events-none z-20"></div>
                                            )}
                                        </div>

                                        <div className="flex-1 pl-5 min-w-0 pr-2">
                                            {isEditing ? (
                                                roleCandidates.length > 1 ? (
                                                    <select
                                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-sm text-white font-bold shadow-inner"
                                                        value={selectedValue}
                                                        onChange={(e) => {
                                                            const nextCandidate = selectOptions.find((option) => {
                                                                if (option?.isManual) {
                                                                    return e.target.value === `manual:${option.id || normalizePlayerName(option.name)}`;
                                                                }
                                                                return getCandidateOptionValue(option) === e.target.value;
                                                            });
                                                            if (!nextCandidate || nextCandidate?.isManual) return;
                                                            handlePlayerSelection(blueStatsKey, sourceIndex, nextCandidate);
                                                        }}
                                                    >
                                                        {selectOptions.map((option, optionIndex) => (
                                                            <option
                                                                key={`${option.isManual ? 'manual' : 'candidate'}-${optionIndex}-${option.id || option.name}`}
                                                                value={option?.isManual ? `manual:${option.id || normalizePlayerName(option.name)}` : getCandidateOptionValue(option)}
                                                            >
                                                                {option.name || rolePlaceholder}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-sm text-white font-bold shadow-inner placeholder:text-slate-500 placeholder:italic"
                                                        value={playerName}
                                                        placeholder={rolePlaceholder}
                                                        onChange={(e) => handlePlayerChange(blueStatsKey, sourceIndex, 'name', e.target.value)}
                                                    />
                                                )
                                            ) : playerName ? (
                                                <Link
                                                    href={playerHref}
                                                    className="font-black text-slate-300 text-sm truncate block hover:underline cursor-pointer tracking-tight hover:text-blue-400"
                                                    title={playerName}
                                                >
                                                    {playerName}
                                                </Link>
                                            ) : (
                                                <span className="font-black text-slate-500/65 text-sm truncate block tracking-tight italic">
                                                    {rolePlaceholder}
                                                </span>
                                            )}
                                        </div>

                                        <div className="w-36 shrink-0 text-right flex flex-col items-end pr-2">
                                            {isEditing ? (
                                                <div className="w-full h-10 bg-slate-900/95 border border-blue-500/70 rounded-xl px-2 flex items-center justify-end gap-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30">
                                                    <input
                                                        className="w-8 bg-transparent text-center text-sm text-white font-mono outline-none"
                                                        inputMode="numeric"
                                                        placeholder="K"
                                                        value={String(getPlayerKdaTriplet(p).k)}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onChange={(e) => handlePlayerChange(blueStatsKey, sourceIndex, 'kills', e.target.value)}
                                                    />
                                                    <span className="text-slate-500 text-xs font-black">/</span>
                                                    <input
                                                        className="w-8 bg-transparent text-center text-sm text-white font-mono outline-none"
                                                        inputMode="numeric"
                                                        placeholder="D"
                                                        value={String(getPlayerKdaTriplet(p).d)}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onChange={(e) => handlePlayerChange(blueStatsKey, sourceIndex, 'deaths', e.target.value)}
                                                    />
                                                    <span className="text-slate-500 text-xs font-black">/</span>
                                                    <input
                                                        className="w-8 bg-transparent text-center text-sm text-white font-mono outline-none"
                                                        inputMode="numeric"
                                                        placeholder="A"
                                                        value={String(getPlayerKdaTriplet(p).a)}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onChange={(e) => handlePlayerChange(blueStatsKey, sourceIndex, 'assists', e.target.value)}
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    {(p.kda || (p.kills !== undefined && p.deaths !== undefined && p.assists !== undefined)) ? (
                                                        <span className="text-xs font-mono font-bold text-slate-300 group-hover:text-blue-400 transition-colors tracking-tighter">
                                                            {p.kda || `${p.kills}/${p.deaths}/${p.assists}`}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-700 font-mono">-/-/-</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {/* RED TEAM */}
                    <div className="flex-1 bg-red-50/10 p-6">
                        <div className="flex text-[9px] font-black text-gray-400 uppercase mb-4 px-2 tracking-[0.2em] justify-end">
                            <span className="w-36 text-left ml-3 group-hover/stats:text-red-400 transition-colors cursor-help">KDA</span>
                            <span className="flex-1 text-right pr-4">Player / Identifier</span>
                            <span className="w-10 text-right">Hero</span>
                        </div>
                        <div className="space-y-3">
                            {orderedRedPlayerStats.map((p: any, i: number) => {
                                const heroName = p.championName || p.hero;
                                const rolePlaceholder = getRolePlaceholder(i);
                                const roleCandidates = getSideCandidates('red', i);
                                const effectivePlayer = getEffectivePlayerIdentity(p, roleCandidates);
                                const playerName = effectivePlayer.name;
                                const playerHref = resolvePlayerHref(effectivePlayer.id || p.playerId, playerName, redTeam?.id, blueTeam?.id);
                                const sourceIndex = getPlayerSourceIndex(p, i);
                                const selectOptions = getSelectOptions(p, roleCandidates);
                                const selectedValue = findMatchingCandidate(p, roleCandidates)
                                    ? getCandidateOptionValue(findMatchingCandidate(p, roleCandidates))
                                    : ((getManualPlayerIdentity(p).name || getManualPlayerIdentity(p).id) && selectOptions[0]?.isManual
                                        ? `manual:${getManualPlayerIdentity(p).id || normalizePlayerName(getManualPlayerIdentity(p).name)}`
                                        : (roleCandidates[0] ? getCandidateOptionValue(roleCandidates[0]) : ''));

                                return (
                                    <div key={sourceIndex} className="flex items-center px-2 py-2 rounded-2xl hover:bg-slate-800/50 hover:shadow-lg hover:shadow-red-900/20 transition-all border-b border-transparent last:border-0 relative group">
                                        <div className="w-36 shrink-0 text-left flex flex-col items-start pl-2">
                                            {isEditing ? (
                                                <div className="w-full h-10 bg-slate-900/95 border border-red-500/70 rounded-xl px-2 flex items-center justify-start gap-1.5 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/30">
                                                    <input
                                                        className="w-8 bg-transparent text-center text-sm text-white font-mono outline-none"
                                                        inputMode="numeric"
                                                        placeholder="K"
                                                        value={String(getPlayerKdaTriplet(p).k)}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onChange={(e) => handlePlayerChange(redStatsKey, sourceIndex, 'kills', e.target.value)}
                                                    />
                                                    <span className="text-slate-500 text-xs font-black">/</span>
                                                    <input
                                                        className="w-8 bg-transparent text-center text-sm text-white font-mono outline-none"
                                                        inputMode="numeric"
                                                        placeholder="D"
                                                        value={String(getPlayerKdaTriplet(p).d)}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onChange={(e) => handlePlayerChange(redStatsKey, sourceIndex, 'deaths', e.target.value)}
                                                    />
                                                    <span className="text-slate-500 text-xs font-black">/</span>
                                                    <input
                                                        className="w-8 bg-transparent text-center text-sm text-white font-mono outline-none"
                                                        inputMode="numeric"
                                                        placeholder="A"
                                                        value={String(getPlayerKdaTriplet(p).a)}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onChange={(e) => handlePlayerChange(redStatsKey, sourceIndex, 'assists', e.target.value)}
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    {(p.kda || (p.kills !== undefined && p.deaths !== undefined && p.assists !== undefined)) ? (
                                                        <span className="text-xs font-mono font-bold text-slate-300 group-hover:text-red-400 transition-colors tracking-tighter">
                                                            {p.kda || `${p.kills}/${p.deaths}/${p.assists}`}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-700 font-mono">-/-/-</span>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        <div className="flex-1 pr-5 min-w-0 text-right pl-2">
                                            {isEditing ? (
                                                roleCandidates.length > 1 ? (
                                                    <select
                                                        className="w-full bg-white border border-gray-100 rounded-lg px-2 py-1 text-sm text-gray-900 text-right font-bold shadow-inner"
                                                        value={selectedValue}
                                                        onChange={(e) => {
                                                            const nextCandidate = selectOptions.find((option) => {
                                                                if (option?.isManual) {
                                                                    return e.target.value === `manual:${option.id || normalizePlayerName(option.name)}`;
                                                                }
                                                                return getCandidateOptionValue(option) === e.target.value;
                                                            });
                                                            if (!nextCandidate || nextCandidate?.isManual) return;
                                                            handlePlayerSelection(redStatsKey, sourceIndex, nextCandidate);
                                                        }}
                                                    >
                                                        {selectOptions.map((option, optionIndex) => (
                                                            <option
                                                                key={`${option.isManual ? 'manual' : 'candidate'}-${optionIndex}-${option.id || option.name}`}
                                                                value={option?.isManual ? `manual:${option.id || normalizePlayerName(option.name)}` : getCandidateOptionValue(option)}
                                                            >
                                                                {option.name || rolePlaceholder}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        className="w-full bg-white border border-gray-100 rounded-lg px-2 py-1 text-sm text-gray-900 text-right font-bold shadow-inner placeholder:text-gray-400 placeholder:italic"
                                                        value={playerName}
                                                        placeholder={rolePlaceholder}
                                                        onChange={(e) => handlePlayerChange(redStatsKey, sourceIndex, 'name', e.target.value)}
                                                    />
                                                )
                                            ) : playerName ? (
                                                <Link
                                                    href={playerHref}
                                                    className="font-black text-slate-300 text-sm truncate block hover:underline cursor-pointer tracking-tight hover:text-red-400"
                                                    title={playerName}
                                                >
                                                    {playerName}
                                                </Link>
                                            ) : (
                                                <span className="font-black text-slate-500/65 text-sm truncate block tracking-tight italic text-right">
                                                    {rolePlaceholder}
                                                </span>
                                            )}
                                        </div>

                                        <div className="w-10 h-10 bg-slate-800 rounded-xl border border-white/5 relative shrink-0 overflow-hidden">
                                            {heroName ? (
                                                <ChampionImage
                                                    name={heroName}
                                                    className="w-full h-full"
                                                    fallbackContent={
                                                        <span className="text-[6px] text-white flex items-center justify-center h-full break-words text-center leading-none bg-slate-800 p-0.5">
                                                            {heroName}
                                                        </span>
                                                    }
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-slate-900/40" />
                                            )}
                                            {isEditing && (
                                                <div
                                                    className="absolute inset-0 z-10 cursor-pointer bg-slate-900/60 backdrop-blur-[2px] hover:bg-slate-800/80 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveHeroEdit({ team: 'B', index: sourceIndex });
                                                        setHeroSearchText('');
                                                    }}
                                                >
                                                    <span className="w-6 h-6 rounded-full bg-blue-600/90 border border-white/20 text-white flex items-center justify-center shadow-md pointer-events-none"><InlineEditIcon className="w-3 h-3" /></span>
                                                </div>
                                            )}

                                            {isEditing && activeHeroEdit?.team === 'B' && activeHeroEdit?.index === sourceIndex && (
                                                <div className="absolute inset-0 ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0f141e] rounded-lg pointer-events-none z-20"></div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div >
        </div>
    );
}
















