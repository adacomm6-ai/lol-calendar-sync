'use client';

import React from 'react';
import { format } from 'date-fns';
import { toBeijingDate } from '@/lib/date-utils';
import TeamLogo from '@/components/TeamLogo';
import { getTeamShortDisplayName } from '@/lib/team-display';

type Match = any; // Assuming it comes from MatchWithTeams

export interface PlayoffBracketConfig {
    cardWidth: number;
    colGap: number;
    rowGap: number;
    // nodePositions: dict mapping node key to {x, y} coordinates.
    // If not provided, we calculate a default layout using the gaps.
    nodePositions?: Record<string, { x: number, y: number }>;
}

const DEFAULT_CONFIG: PlayoffBracketConfig = {
    cardWidth: 140,
    colGap: 36,
    rowGap: 20,
    nodePositions: {
        UB_R1_1: { x: 0, y: 0 },
        UB_R1_2: { x: 0, y: 104 },
        UB_R1_3: { x: 0, y: 208 },
        UB_R1_4: { x: 0, y: 312 },
        UB_R2_1: { x: 172, y: 57 },
        UB_R2_2: { x: 173, y: 241 },
        LB_R1_1: { x: 0, y: 451 },
        LB_R1_2: { x: 0, y: 564 },
        LB_R2_1: { x: 170, y: 403 },
        LB_R2_2: { x: 171, y: 517 },
        LB_R3: { x: 341, y: 459 },
        UB_F: { x: 501, y: 160 },
        LB_F: { x: 500, y: 460 },
        GF: { x: 676, y: 304 },
    },
};

interface PlayoffBracketViewProps {
    matches: Match[];
    config?: Partial<PlayoffBracketConfig>;
    /** Callback for when a node is dragged. Receives the node key and its new absolute (x, y) position. */
    onNodeDrag?: (key: string, x: number, y: number) => void;
    /** Callback for when a node is clicked. Useful for interactive bracket editors. */
    onNodeClick?: (node: Match, topologyKey: string) => void;
}

// Fixed topology for 8-team Double Elimination (14 matches total)
export const TOPOLOGY_KEYS = {
    UB_R1_1: 'Upper Bracket R1 M1',
    UB_R1_2: 'Upper Bracket R1 M2',
    UB_R1_3: 'Upper Bracket R1 M3',
    UB_R1_4: 'Upper Bracket R1 M4',

    UB_R2_1: 'Upper Bracket Semifinal 1',
    UB_R2_2: 'Upper Bracket Semifinal 2',

    LB_R1_1: 'Lower Bracket R1 M1',
    LB_R1_2: 'Lower Bracket R1 M2',

    LB_R2_1: 'Lower Bracket R2 M1',
    LB_R2_2: 'Lower Bracket R2 M2',

    LB_R3: 'Lower Bracket Semifinal',
    UB_F: 'Upper Bracket Final',
    LB_F: 'Lower Bracket Final',
    GF: 'Grand Final',
};

// Helper to compute default positions based on config gaps and card sizes
export function computeDefaultPositions(config: PlayoffBracketConfig) {
    const { cardWidth: w, colGap: cx, rowGap: cy } = config;
    const cardH = 80; // approximate height of a MatchNode card

    // NOTE: 鍩哄噯鍋忕Щ閲忥紝闃叉绗竴鍒楃揣璐村鍣ㄥ乏杈规琚鍒?
    const baseX = 20;
    const baseY = 10;
    const getX = (col: number) => baseX + col * (w + cx);

    // Upper Bracket (top half) - Cols 0 to 5
    // UB R1 (4 matches) in Col 0
    const ubR1_1 = { x: getX(0), y: baseY };
    const ubR1_2 = { x: getX(0), y: baseY + cardH + cy };
    const ubR1_3 = { x: getX(0), y: baseY + (cardH + cy) * 2 };
    const ubR1_4 = { x: getX(0), y: baseY + (cardH + cy) * 3 };

    // UB R2 (2 matches) in Col 1 - Centered between their input matches
    const ubR2_1 = { x: getX(1), y: (ubR1_1.y + ubR1_2.y) / 2 };
    const ubR2_2 = { x: getX(1), y: (ubR1_3.y + ubR1_4.y) / 2 };

    // UB Final (1 match) in Col 3 (skipping col 2 for pacing)
    const ubF = { x: getX(3), y: (ubR2_1.y + ubR2_2.y) / 2 };

    // Grand Final in Col 5
    const gf = { x: getX(5), y: ubF.y + 60 };

    // Lower Bracket (bottom half) - placed vertically below UB
    // Let's start Lower Bracket right below UB R1_4, using a larger gap
    const lbStartY = ubR1_4.y + cardH + cy * 3;

    // LB R1 (2 matches) in Col 1
    const lbR1_1 = { x: getX(1), y: lbStartY };
    const lbR1_2 = { x: getX(1), y: lbStartY + cardH + cy };

    // LB R2 (2 matches) in Col 2
    const lbR2_1 = { x: getX(2), y: lbR1_1.y };
    const lbR2_2 = { x: getX(2), y: lbR1_2.y };

    // LB R3 (1 match) in Col 3
    const lbR3 = { x: getX(3), y: (lbR2_1.y + lbR2_2.y) / 2 };

    // LB Final (1 match) in Col 4
    const lbF = { x: getX(4), y: lbR3.y };

    return {
        UB_R1_1: ubR1_1, UB_R1_2: ubR1_2, UB_R1_3: ubR1_3, UB_R1_4: ubR1_4,
        UB_R2_1: ubR2_1, UB_R2_2: ubR2_2,
        LB_R1_1: lbR1_1, LB_R1_2: lbR1_2,
        LB_R2_1: lbR2_1, LB_R2_2: lbR2_2,
        LB_R3: lbR3,
        UB_F: ubF,
        LB_F: lbF,
        GF: gf
    } as Record<string, { x: number, y: number }>;
}

export default function PlayoffBracketView({ matches, config: userConfig, onNodeDrag, onNodeClick }: PlayoffBracketViewProps) {
    const config = { ...DEFAULT_CONFIG, ...userConfig };

    // Map existing matches to their topological slot
    const nodeMap = new Map<string, Match>();

    matches.forEach(m => {
        // Simple string matching based on the generated stages
        const s = m.stage || '';
        Object.entries(TOPOLOGY_KEYS).forEach(([key, stageName]) => {
            if (s.includes(stageName)) {
                nodeMap.set(key, m);
            }
        });
    });

    const isDoubleElim14 = Object.keys(TOPOLOGY_KEYS).every(k => nodeMap.has(k))
        || (nodesHaveSufficientData(nodeMap));

    // If it doesn't look like a complete 14-match double elim tree we generated, return null to fallback to list
    if (Object.keys(TOPOLOGY_KEYS).length !== 14) {
        return <div className="p-10 text-center text-slate-500">当前赛程数据还不足以渲染标准 14 场双败淘汰赛树状图。</div>;
    }

    const getNode = (key: string) => nodeMap.get(key) || { isPlaceholder: true, key };

    const positions = config.nodePositions || computeDefaultPositions(config);

    // Calculate bounding box to support scrolling/container sizing
    let maxX = 0;
    let maxY = 0;
    Object.values(positions).forEach(pos => {
        if (pos.x > maxX) maxX = pos.x;
        if (pos.y > maxY) maxY = pos.y;
    });

    const containerWidth = maxX + config.cardWidth + 100;
    const containerHeight = maxY + 150;

    return (
        <div className="bg-[#f0f2f5] overflow-auto rounded-xl border border-gray-200 shadow-inner relative select-none w-full" style={{ height: '800px' }}>
            <div className="relative p-8" style={{ width: containerWidth, height: containerHeight }}>
                <BracketLinesCanvas positions={positions} cardWidth={config.cardWidth} />

                {/* Render All Nodes from config positions */}
                {Object.keys(TOPOLOGY_KEYS).map((key) => {
                    const pos = positions[key];
                    if (!pos) return null;
                    return (
                        <DraggableNode key={key} nodeKey={key} pos={pos} onDrag={onNodeDrag} disabled={!onNodeDrag}>
                            <MatchNode node={getNode(key)} isGF={key === 'GF'} config={config} onClick={onNodeClick ? () => onNodeClick(getNode(key), key) : undefined} />
                        </DraggableNode>
                    );
                })}
            </div>
        </div>
    );
}

// Draggable Wrapper for Nodes
// NOTE: Uses absolute-position override approach: on mousedown we snapshot the original
// position, and on each mousemove we set the new position = original + totalDelta.
// This avoids the exponential drift bug from incremental delta accumulation.
function DraggableNode({ nodeKey, pos, onDrag, disabled, children }: {
    nodeKey: string;
    pos: { x: number; y: number };
    onDrag?: (key: string, x: number, y: number) => void;
    disabled: boolean;
    children: React.ReactNode;
}) {
    const handleMouseDown = (e: React.MouseEvent) => {
        if (disabled) return;
        e.preventDefault(); // Prevent text selection while dragging

        // Snapshot the position at the moment the user starts dragging
        const origX = pos.x;
        const origY = pos.y;
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;

        const handleMouseMove = (mvEvent: MouseEvent) => {
            const newX = Math.max(0, origX + (mvEvent.clientX - startMouseX));
            const newY = Math.max(0, origY + (mvEvent.clientY - startMouseY));
            if (onDrag) {
                onDrag(nodeKey, newX, newY);
            }
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className={`absolute ${disabled ? '' : 'cursor-grab active:cursor-grabbing hover:z-30 hover:ring-2 hover:ring-blue-400 rounded-lg'}`}
            style={{ left: pos.x, top: pos.y }}
            onMouseDown={handleMouseDown}
        >
            {children}
        </div>
    );
}

function nodesHaveSufficientData(map: Map<string, any>) {
    // Basic heuristic: check if at least half of the nodes exist
    return map.size > 2;
}

function BracketLinesCanvas({ positions, cardWidth }: { positions: Record<string, { x: number, y: number }>, cardWidth: number }) {
    // Generate lines dynamically from point A to point B based on topology logic mapped out below
    // A point is connected from the "right side middle" of node A to the "left side middle" of node B.

    // We assume card height is roughly 80 for centering
    const CH = 80;

    // SVG Path Generator - creates a nice orthogonal step line
    const createPath = (startId: string, endId: string, color: string = '#d1d5db') => {
        const p1 = positions[startId];
        const p2 = positions[endId];
        if (!p1 || !p2) return null;

        const startX = p1.x + cardWidth;
        const startY = p1.y + (CH / 2) + 12; // Adjusted vertically to hit the card center mostly
        const endX = p2.x;
        const endY = p2.y + (CH / 2) + 12;

        const midX = startX + (endX - startX) / 2;

        // Path: Move to start -> line to midX,startY -> line to midX,endY -> line to endX,endY
        const d = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;

        return <path key={`${startId}-${endId}`} d={d} fill="none" stroke={color} strokeWidth="2" />;
    };

    // Special drop down line for UB_F loser dropping to LB_F
    const createLongDropPath = () => {
        const ubf = positions['UB_F'];
        const lbf = positions['LB_F'];
        if (!ubf || !lbf) return null;

        // Originates from bottom of UB_F card, drops down and enters left of LB_F (actually, typical draw enters same left port as LB R3 winner)
        const startX = ubf.x + cardWidth - 20; // drop from bottom middle-ish
        const startY = ubf.y + CH + 20;

        // Target: left side of LB Final
        const endX = lbf.x;
        const endY = lbf.y + (CH / 2) + 12;

        // We route it to the left to avoid crossing the UB_F card
        const routeX = endX - 20;

        const d = `M ${startX} ${startY} L ${startX} ${endY} L ${endX} ${endY}`;
        return <path key="ub-drop" d={d} fill="none" stroke="#d1d5db" strokeWidth="2" strokeDasharray="4 4" />;
    };

    return (
        <svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ zIndex: 0 }}>
            {/* UB R1 to UB R2 */}
            {createPath('UB_R1_1', 'UB_R2_1')}
            {createPath('UB_R1_2', 'UB_R2_1')}
            {createPath('UB_R1_3', 'UB_R2_2')}
            {createPath('UB_R1_4', 'UB_R2_2')}

            {/* UB R2 to UB Final */}
            {createPath('UB_R2_1', 'UB_F')}
            {createPath('UB_R2_2', 'UB_F')}

            {/* LB R1 to LB R2 */}
            {createPath('LB_R1_1', 'LB_R2_1')}
            {createPath('LB_R1_2', 'LB_R2_2')}

            {/* LB R2 to LB R3 */}
            {createPath('LB_R2_1', 'LB_R3')}
            {createPath('LB_R2_2', 'LB_R3')}

            {/* LB R3 to LB Final */}
            {createPath('LB_R3', 'LB_F')}

            {/* Finals to Grand Final */}
            {createPath('UB_F', 'GF', '#9ca3af') /* Make finals line slightly darker */}
            {createPath('LB_F', 'GF', '#9ca3af')}

            {/* The Dropdown Line from UB Final to LB Final */}
            {createLongDropPath()}

        </svg>
    );
}

// --- Single Match Node Component ---

function MatchNode({ node, isGF = false, config, onClick }: { node: any, isGF?: boolean, config: PlayoffBracketConfig, onClick?: () => void }) {
    if (node.isPlaceholder) {
        return (
            <div
                className={`flex flex-col relative group z-20 opacity-40 ${isGF ? 'ring-2 ring-yellow-400/20 rounded-md' : ''} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                style={{ width: config.cardWidth + 'px' }}
                onClick={onClick}
            >
                {/* Date / Time Placeholder */}
                <div className="h-[20px] flex items-end pl-1 pb-1">
                    <div className="h-2.5 w-16 bg-gray-200 rounded"></div>
                </div>

                <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
                    <div className="flex flex-col divide-y divide-gray-100 p-1.5 gap-1.5">
                        <div className="h-5 bg-gray-100 rounded w-full"></div>
                        <div className="h-5 bg-gray-100 rounded w-full"></div>
                    </div>
                </div>

                {/* Status Pill Placeholder */}
                <div className="h-[20px] flex justify-end items-start pt-1 mr-[-8px]">
                    <div className="h-3 w-12 bg-gray-200 rounded-full"></div>
                </div>
            </div>
        );
    }

    const { teamA, teamB, winnerId, startTime, status } = node;
    const isFinished = ['FINISHED', 'COMPLETED'].includes(String(status || '').toUpperCase());

    const team1Data = teamA || node.teamA; // Accept direct obj or matched obj
    const team2Data = teamB || node.teamB;

    // For games logic, we need to extract from match relations or just string matching if it was parsed
    const getScore = (tid?: string) => {
        if (!tid || !node.games) return 0;
        return node.games.filter((g: any) => g.winnerId === tid).length;
    };

    const scoreA = getScore(team1Data?.id);
    const scoreB = getScore(team2Data?.id);

    const isTeamAWinner = isFinished && winnerId && team1Data && winnerId === team1Data.id;
    const isTeamBWinner = isFinished && winnerId && team2Data && winnerId === team2Data.id;

    const dt = startTime ? toBeijingDate(startTime) : null;

    return (
        <div
            className={`relative z-20 flex flex-col group ${isGF ? 'ring-2 ring-yellow-400/50 rounded-lg' : ''} ${onClick ? 'cursor-pointer' : 'pointer-events-none'}`}
            style={{ width: config.cardWidth + 'px' }}
            onClick={(e) => {
                if (onClick) {
                    e.preventDefault(); // Prevent <a> navigation if we are in interactive mode
                    onClick();
                }
            }}
        >

            <a href={onClick ? undefined : (node.id ? `/match/${node.id}` : '#')} target={node.id && !onClick ? "_blank" : "_self"} className={onClick ? "pointer-events-none" : "pointer-events-auto"}>
                {/* Date / Time */}
                <div className="h-[20px] flex items-end text-[10px] text-gray-800 font-bold mb-0.5 pl-1">
                    {dt ? format(dt, 'MM月dd日 HH:mm') : '待定'}
                </div>

                {/* Match Card */}
                <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm hover:border-[#1a1a1a] hover:shadow-md transition-all">
                    <div className="flex flex-col divide-y divide-gray-100">
                        <TeamRow team={team1Data} score={scoreA} isWinner={isTeamAWinner} isFinished={isFinished} status={status} />
                        <TeamRow team={team2Data} score={scoreB} isWinner={isTeamBWinner} isFinished={isFinished} status={status} />
                    </div>
                </div>

                {/* Status Pill */}
                <div className="h-[20px] flex justify-end items-start pt-1 mr-[-8px]">
                    <span className="text-[9px] font-bold text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5 shadow-sm">
                        {status === 'LIVE' ? <span className="text-red-500 animate-pulse">进行中</span> : (isFinished ? '已结束' : '待定')}
                    </span>
                </div>
            </a>
        </div>
    );
}

function TeamRow({ team, score, isWinner, isFinished, status }: { team: any, score: number, isWinner: boolean, isFinished: boolean, status: string }) {
    const isLoser = isFinished && !isWinner;
    const bgScore = (isFinished || status === 'LIVE')
        ? (isWinner ? 'bg-[#3b82f6] text-white' : 'bg-[#e0e3e6] text-gray-600')
        : 'bg-[#e5e7eb] text-gray-400';

    return (
        <div className={`flex items-center justify-between px-1.5 py-1.5 min-h-[30px] ${isLoser ? 'bg-gray-50/50' : 'bg-white'}`}>
            <div className="flex items-center gap-1.5 overflow-hidden flex-1 pl-0.5">
                {team && team.id ? (
                    <>
                        <TeamLogo src={team.logo} name={team.name} size={16} className={`w-4 h-4 ${isLoser ? 'grayscale opacity-70' : ''}`} region={team.region} />
                        <span className={`text-[11px] font-bold truncate ${isLoser ? 'text-gray-500' : 'text-gray-800'}`}>
                            {getTeamShortDisplayName(team)}
                        </span>
                    </>
                ) : (
                    <>
                        <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full text-[#9ca3af] absolute inset-0" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                            </svg>
                            <span className="text-white text-[9px] font-black relative z-10 mt-[1px]">?</span>
                        </div>
                        <span className="text-[11px] font-bold text-gray-400">待定</span>
                    </>
                )}
            </div>

            <div className={`w-[20px] h-[20px] rounded-sm flex items-center justify-center shrink-0 ${bgScore}`}>
                <span className="text-[11px] font-black font-mono">
                    {score}
                </span>
            </div>
        </div>
    );
}

