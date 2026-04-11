'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useState } from 'react';
import Image from 'next/image';

import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area, CartesianGrid, ReferenceLine, LabelList
} from 'recharts';
import { useRouter } from 'next/navigation';

interface DamageData {
    name: string;
    team: string;
    damage: number;
    hero: string;
    role: string;
    hero_avatar?: string;
}

import { updateGameScreenshot, deleteGameScreenshot } from '@/app/entry/upload/actions';

interface AnalysisChartsProps {
    data: {
        damage_data: DamageData[];
        gold_diff: number[];
        [key: string]: any;
    };
    // Deprecated: teamA, teamB (keep for ABI if needed, but prefer explicit names)
    teamA?: any;
    teamB?: any;
    // New explicit props
    blueTeamName?: string;
    redTeamName?: string;
    viewMode?: 'all' | 'chart' | 'scoreboard';

    // For Scoreboard Editing
    games?: any[];
    matchId?: string;
    forceActiveGameNumber?: number;
    screenshot?: string | null;
    screenshot2?: string | null;
    isAdmin?: boolean;
}

export default function AnalysisCharts(props: AnalysisChartsProps) {
    const router = useRouter();
    const { data, teamA, teamB, blueTeamName: propBlueName, redTeamName: propRedName, viewMode = 'all', isAdmin = false } = props;
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    if (!data || !data.damage_data) return null;

    const damageDataRaw = data.damage_data;
    const goldDiff = data.gold_diff || [];
    const goldData = goldDiff.map((val: number, idx: number) => ({ time: idx * 5, diff: val }));

    if (damageDataRaw.length === 0) return null;

    // Lineup Processing
    const firstTeam = damageDataRaw[0]?.team || 'Blue';
    const teamBlueRaw = damageDataRaw.filter(p => p.team === 'Blue' || p.team === firstTeam);
    const teamRedRaw = damageDataRaw.filter(p => p.team === 'Red' || (p.team !== 'Blue' && p.team !== firstTeam));

    // Determine Display Names
    // Priority: Explicit Prop > Derived from TeamA/B (Assumption: A=Blue)
    const blueTeamName = propBlueName || teamA?.name || 'Blue Team';
    const redTeamName = propRedName || teamB?.name || 'Red Team';

    // Ensure we have 5 roles aligned
    const roles = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
    const chartData = roles.map((role, idx) => {
        const bluePlayer = teamBlueRaw[idx];
        const redPlayer = teamRedRaw[idx];

        // Helper to convert remote DDragon URL to local
        const toLocal = (url: string, heroName?: string) => {
            if (!url && !heroName) return '/images/champions/unknown.png';

            let filename = '';
            if (url && (url.includes('http') || url.includes('ddragon'))) {
                const parts = url.split('/');
                filename = parts[parts.length - 1];
            } else if (heroName) {
                filename = heroName;
            } else {
                const parts = url.split('/');
                filename = parts[parts.length - 1];
            }

            // Remove extension
            let name = filename.replace(/\.png|\.webp|\.jpg/gi, '');
            // FIX: Remove ALL non-alphanumeric chars (spaces, dots, apostrophes)
            name = name.replace(/[^a-zA-Z0-9]/g, '');

            // Champion Aliases (Sync with GameSummaryPanel)
            const aliases: { [key: string]: string } = {
                // LCK
                'dnsoopers': 'dnfreecs',
                'kwangdongfreecs': 'dnfreecs',
                'kdf': 'dnfreecs',
                'dnfreecs.kr': 'dnfreecs',

                'dpluskia': 'dpluskia',
                'dpluskia.kr': 'dpluskia',
                'dk': 'dpluskia',
                'damwon': 'dpluskia',
                'damwonkia': 'dpluskia',

                'drx': 'krx',
                'drx.kr': 'krx',
                'krx': 'krx',
                'krx.kr': 'krx',

                't1': 't1',
                't1.kr': 't1',

                'gen.g': 'gen.g',
                'gen.g.kr': 'gen.g',
                'geng': 'gen.g',
                'geng.kr': 'gen.g',

                'ktrolster': 'ktrolster',
                'ktrolster.kr': 'ktrolster',
                'kt': 'ktrolster',

                'freditbrion': 'oksavingsbankbrion',
                'brion': 'oksavingsbankbrion',
                'bro': 'oksavingsbankbrion',
                'oksavingsbankbrion.kr': 'oksavingsbankbrion',

                'redforce': 'nongshimredforce',
                'ns': 'nongshimredforce',
                'nongshimredforce.kr': 'nongshimredforce',

                'fearx': 'bnkfearx',
                'fox': 'bnkfearx',
                'liivsandbox': 'bnkfearx',
                'sandbox': 'bnkfearx',
                'bnkfearx.kr': 'bnkfearx',

                'hle': 'hanwhalifeesports',
                'hanwhalifeesports': 'hanwhalifeesports',
                'hanwhalifeesports.kr': 'hanwhalifeesports',

                // LPL
                'nip': 'ninjasinpyjamas',
                'ninjasinpyjamas': 'ninjasinpyjamas',
                'ninjasinpyjamas.cn': 'ninjasinpyjamas',

                'omg': 'ohmygod',
                'ohmygod': 'ohmygod',
                'ohmygod.cn': 'ohmygod',

                'tt': 'thundertalkgaming',
                'ttgaming': 'thundertalkgaming',
                'thundertalkgaming': 'thundertalkgaming',
                'thundertalkgaming.cn': 'thundertalkgaming',

                'we': 'teamwe',
                'teamwe': 'teamwe',
                'teamwe.cn': 'teamwe',

                'ig': 'invictusgaming',
                'invictusgaming': 'invictusgaming',
                'invictusgaming.cn': 'invictusgaming',

                'rng': 'royalnevergiveup',
                'royalnevergiveup': 'royalnevergiveup',
                'royalnevergiveup.cn': 'royalnevergiveup',

                'fpx': 'funplusphoenix',
                'funplusphoenix': 'funplusphoenix',
                'funplusphoenix.cn': 'funplusphoenix',

                'tes': 'topesports',
                'top': 'topesports',
                'topesports': 'topesports',
                'topesports.cn': 'topesports',

                'jdg': 'jdgaming',
                'jdgaming': 'jdgaming',
                'jdgaming.cn': 'jdgaming',

                'blg': 'bilibiligaming',
                'bilibiligaming': 'bilibiligaming',
                'bilibiligaming.cn': 'bilibiligaming',

                'edg': 'edwardgaming',
                'edwardgaming': 'edwardgaming',
                'edwardgaming.cn': 'edwardgaming',

                'lng': 'lngesports',
                'lngesports': 'lngesports',
                'lngesports.cn': 'lngesports',

                'wbg': 'weibogaming',
                'weibogaming': 'weibogaming',
                'weibogaming.cn': 'weibogaming',

                'up': 'ultraprime',
                'ultraprime': 'ultraprime',
                'ultraprime.cn': 'ultraprime',

                'al': 'anyoneslegend',
                'anyoneslegend': 'anyoneslegend',
                'anyoneslegend.cn': 'anyoneslegend',

                'ra': 'rareatom',
                'rareatom': 'rareatom',
                'rareatom.cn': 'rareatom',

                'lgd': 'lgdgaming',
                'lgdgaming': 'lgdgaming',
                'lgdgaming.cn': 'lgdgaming',

                // Champions
                'Wukong': 'MonkeyKing',
                'Renata': 'Renata',
                'RenataGlasc': 'Renata',
                'Nunu': 'Nunu',
                'Nunu&Willump': 'Nunu',
                'JarvanIV': 'JarvanIV',
                'MissFortune': 'MissFortune',
                'TahmKench': 'TahmKench',
                'KaiSa': 'Kaisa',
                'Kaisa': 'Kaisa',
                'KogMaw': 'KogMaw',
                'LeeSin': 'LeeSin',
                'MasterYi': 'MasterYi',
                'XinZhao': 'XinZhao',
                'DrMundo': 'DrMundo',
                'TwistedFate': 'TwistedFate',
                'AurelionSol': 'AurelionSol',
                'BelVeth': 'Belveth',
                'ChoGath': 'Chogath',
                'KhaZix': 'Khazix',
                'Leblanc': 'Leblanc',
                'RekSai': 'RekSai',
                'Scoregg695': 'Mel',
                'Scoregg705': 'Yunara',
                'Scoregg711': 'Zaahen',
            };

            if (aliases[name]) name = aliases[name];

            return `/images/champions/${name}.png`;
        };

        return {
            role,
            blueName: bluePlayer?.name || '未知',
            blueDmg: bluePlayer ? -Math.abs(bluePlayer.damage) : 0, // Negative for Left
            blueDmgDisplay: bluePlayer?.damage || 0,
            blueHero: bluePlayer?.hero || '',
            blueAvatar: toLocal(bluePlayer?.hero_avatar || '', bluePlayer?.hero),

            redName: redPlayer?.name || '未知',
            redDmg: redPlayer ? Math.abs(redPlayer.damage) : 0, // Positive for Right
            redDmgDisplay: redPlayer?.damage || 0,
            redHero: redPlayer?.hero || '',
            redAvatar: toLocal(redPlayer?.hero_avatar || '', redPlayer?.hero),
        };
    });

    const maxDmg = Math.max(...chartData.map(d => Math.max(d.blueDmgDisplay, d.redDmgDisplay)));

    // Custom Tooltip for Butterfly
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-xl text-xs z-50 min-w-[200px]">
                    <p className="font-bold text-slate-300 mb-2 text-center uppercase tracking-wider">{data.role}</p>
                    <div className="flex gap-4 justify-between">
                        {/* Blue Side */}
                        <div className="text-right flex flex-col items-end">
                            <p className="font-bold text-blue-400 mb-1">{blueTeamName}</p>
                            <p className="text-white font-medium">{data.blueName}</p>
                            <div className="flex items-center gap-2 my-1">
                                <span className="text-slate-500">{data.blueHero}</span>
                                {data.blueAvatar && (
                                    <div className="relative w-8 h-8 rounded-full border border-slate-600 overflow-hidden">
                                        <Image src={data.blueAvatar} alt={data.blueHero} fill className="object-cover" unoptimized />
                                    </div>
                                )}
                            </div>
                            <p className="text-lg font-black text-white">
                                {(data.blueDmgDisplay / 1000).toFixed(1)}k
                            </p>
                        </div>

                        {/* Red Side */}
                        <div className="text-left flex flex-col items-start">
                            <p className="font-bold text-red-400 mb-1">{redTeamName}</p>
                            <p className="text-white font-medium">{data.redName}</p>
                            <div className="flex items-center gap-2 my-1">
                                {data.redAvatar && (
                                    <div className="relative w-8 h-8 rounded-full border border-slate-600 overflow-hidden">
                                        <Image src={data.redAvatar} alt={data.redHero} fill className="object-cover" unoptimized />
                                    </div>
                                )}
                                <span className="text-slate-500">{data.redHero}</span>
                            </div>
                            <p className="text-lg font-black text-white">
                                {(data.redDmgDisplay / 1000).toFixed(1)}k
                            </p>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className={`space-y-6 mt-6 animate-in slide-in-from-bottom-6 duration-700 ${viewMode !== 'all' ? 'mt-0' : ''}`}>

            {/* Layout: Vertical Stack */}
            <div className="flex flex-col gap-6">

                {/* 1. Butterfly Damage Chart (Optimized UI) */}
                {(viewMode === 'all' || viewMode === 'chart') && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-base font-bold text-slate-300 mb-6 px-4">
                            <span>双方伤害分布对比</span>
                        </h3>
                        <div className="h-96 w-full max-w-5xl mx-auto">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart layout="vertical" data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }} stackOffset="sign">
                                    <XAxis type="number" hide domain={[-maxDmg, maxDmg]} />
                                    <YAxis
                                        type="category"
                                        dataKey="role"
                                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                                        width={60}
                                        interval={0}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <ReferenceLine x={0} stroke="#334155" strokeDasharray="3 3" />

                                    {/* Blue Bar */}
                                    <Bar dataKey="blueDmg" fill="#3b82f6" stackId="stack" barSize={28} radius={[4, 0, 0, 4]}>
                                        {/* Damage Value Only - Inside (End) */}
                                        <LabelList
                                            dataKey="blueDmgDisplay"
                                            position="right"
                                            content={(props: any) => {
                                                const { x, y, width, height, value } = props;
                                                return (
                                                    <text x={x + width - 6} y={y + height / 2 + 1} fill="rgba(255,255,255,0.7)" textAnchor="end" dominantBaseline="middle" fontSize={9}>
                                                        {value > 0 ? (value / 1000).toFixed(1) + 'k' : ''}
                                                    </text>
                                                );
                                            }}
                                        />
                                    </Bar>

                                    {/* Red Bar */}
                                    <Bar dataKey="redDmg" fill="#ef4444" stackId="stack" barSize={28} radius={[0, 4, 4, 0]}>
                                        <LabelList
                                            dataKey="redDmgDisplay"
                                            content={(props: any) => {
                                                const { x, y, width, height, value } = props;
                                                return (
                                                    <text x={x + 6} y={y + height / 2 + 1} fill="rgba(255,255,255,0.7)" textAnchor="start" dominantBaseline="middle" fontSize={9}>
                                                        {value > 0 ? (value / 1000).toFixed(1) + 'k' : ''}
                                                    </text>
                                                );
                                            }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* 2. Scoreboard Images (Dual Column) */}
                {(viewMode === 'all' || viewMode === 'scoreboard') && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-base font-bold text-slate-300 mb-6 px-4 flex justify-between items-center">
                            <span>计分板截图</span>
                        </h3>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Left: Main Scoreboard */}
                            <ScoreboardImage
                                title="赛后数据"
                                imageUrl={props.screenshot || data.original_image_url}
                                onUpload={async (file: File) => {
                                    const activeGameNum = (props.forceActiveGameNumber || 1);
                                    const activeGame = props.games?.find((g: any) => g.gameNumber === activeGameNum);
                                    if (activeGame) {
                                        const formData = new FormData();
                                        formData.append('image', file);
                                        const res = await updateGameScreenshot(activeGame.id, formData, 'main');
                                        if (res.success) window.location.reload();
                                        else alert('上传失败：' + res.error);
                                    }
                                }}
                                onDelete={async () => {
                                    const activeGameNum = (props.forceActiveGameNumber || 1);
                                    const activeGame = props.games?.find((g: any) => g.gameNumber === activeGameNum);
                                    if (activeGame) {
                                        const res = await deleteGameScreenshot(activeGame.id, 'main');
                                        if (res.success) {
                                            router.refresh();
                                        }
                                    }
                                }}
                                onOpenLightbox={() => setLightboxImage(props.screenshot || data.original_image_url || null)}
                                isAdmin={isAdmin}
                            />

                            {/* Right: Supplementary */}
                            <ScoreboardImage
                                title="补充面板"
                                imageUrl={props.screenshot2}
                                onUpload={async (file: File) => {
                                    const activeGameNum = (props.forceActiveGameNumber || 1);
                                    const activeGame = props.games?.find((g: any) => g.gameNumber === activeGameNum);
                                    if (activeGame) {
                                        const formData = new FormData();
                                        formData.append('image', file);
                                        const res = await updateGameScreenshot(activeGame.id, formData, 'supplementary');
                                        if (res.success) window.location.reload();
                                        else alert('上传失败：' + res.error);
                                    }
                                }}
                                onDelete={async () => {
                                    const activeGameNum = (props.forceActiveGameNumber || 1);
                                    const activeGame = props.games?.find((g: any) => g.gameNumber === activeGameNum);
                                    if (activeGame) {
                                        const res = await deleteGameScreenshot(activeGame.id, 'supplementary');
                                        if (res.success) {
                                            router.refresh();
                                        }
                                    }
                                }}
                                onOpenLightbox={() => setLightboxImage(props.screenshot2 || null)}
                                isAdmin={isAdmin}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {lightboxImage && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setLightboxImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                        onClick={() => setLightboxImage(null)}
                    >
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="relative w-full h-full max-w-full max-h-full">
                        <Image
                            src={lightboxImage?.startsWith('/') ? lightboxImage : `/api/image-proxy?url=${encodeURIComponent(lightboxImage || '')}`}
                            alt="完整计分板"
                            fill
                            className="object-contain rounded shadow-2xl scale-100 animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()}
                            unoptimized
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-component for Image Slot
function ScoreboardImage({ title, imageUrl, onUpload, onDelete, onOpenLightbox, isAdmin }: any) {
    return (
        <div className="relative group">
            <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">{title}</h4>
            <div className="relative group/image">
                {/* Actions Overlay */}
                {/* Actions Overlay */}
                {isAdmin && (
                    <div className="absolute top-2 right-2 z-20 flex gap-2 opacity-0 group-hover/image:opacity-100 transition-opacity">
                        <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white p-2 rounded shadow-lg transition-colors" title="上传新图片">
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) onUpload(file);
                                }}
                            />
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        </label>

                        {imageUrl && (
                            <button
                                className="bg-red-600 hover:bg-red-500 text-white p-2 rounded shadow-lg transition-colors"
                                title="删除图片"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!(await confirmAction('确定要删除这张图片吗？'))) return;
                                    onDelete();
                                }}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        )}
                    </div>
                )}

                <div
                    className="h-64 w-full px-2 relative cursor-zoom-in overflow-hidden rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors bg-slate-950/30 flex items-center justify-center"
                    onClick={() => imageUrl && onOpenLightbox()}
                >
                    {imageUrl ? (
                        <Image
                            src={imageUrl.startsWith('/') ? imageUrl : `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`}
                            alt={title}
                            fill
                            className="object-contain transition-transform duration-500 group-hover:scale-105"
                            unoptimized
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-600 gap-2">
                            <span className="text-4xl opacity-20">🖼️</span>
                            <span className="text-xs">暂无图片</span>
                            {isAdmin && <span className="text-[10px] opacity-50">悬停后可上传</span>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}



