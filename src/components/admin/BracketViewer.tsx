'use client';

import { useState, useMemo } from 'react';
import MatchEditModal from './MatchEditModal';
import { MatchFormData } from '@/app/admin/schedule/actions';

type Team = { id: string, name: string, shortName: string | null, region: string };
type Match = MatchFormData & {
    id: string;
    teamA: Team | null;
    teamB: Team | null;
    winnerId?: string | null;
};

interface BracketViewerProps {
    matches: Match[];
    teams: Team[];
    onRefresh: () => void;
}

export default function BracketViewer({ matches, teams, onRefresh }: BracketViewerProps) {
    const [editingMatch, setEditingMatch] = useState<MatchFormData | null>(null);

    // 1. Group by Rounds (Simple Heuristic: Date or Parents?)
    // A better approach for general brackets:
    // - Traverse backwards from Finals?
    // - Or just simple topological sort layers?
    // - For now, let's group by "Stage + Date" or just Manual Columns if we can't infer.
    // - Actually, let's try a "Layer" approach based on dependencies.
    // Layer 0: Matches with NO parents in this set.
    // Layer 1: Matches whose parents are in Layer 0.
    // ...
    // Wait, typical bracket is: Layer 0 = Finals. Layer 1 = Semis.
    // Let's go explicitly by dependencies.

    // Calculate Depth of each match
    // Map<MatchId, Depth>. 
    // If no children in this set, Depth = 0 (Finals).
    // If has children, Depth = Max(ChildDepth) + 1. 
    // This assumes Single Elimination tree structure.

    const { layers, maxDepth } = useMemo(() => {
        const matchMap = new Map(matches.map(m => [m.id, m]));
        const childrenMap = new Map<string, string[]>(); // ParentId -> ChildIds

        // Build child map
        matches.forEach(m => {
            /* [ROLLBACK] Bracket Logic Disabled */
            // if (m.teamAParentMatchId) {
            //     const arr = childrenMap.get(m.teamAParentMatchId) || [];
            //     if (m.id) arr.push(m.id);
            //     childrenMap.set(m.teamAParentMatchId, arr);
            // }
            // if (m.teamBParentMatchId) {
            //     const arr = childrenMap.get(m.teamBParentMatchId) || [];
            //     if (m.id) arr.push(m.id);
            //     childrenMap.set(m.teamBParentMatchId, arr);
            // }
        });

        // Calculate "Column Index"
        // Roots (no children) should be on the RIGHT (Finals).
        // Leaves (no parents) should be on the LEFT.
        // Let's assign "Generation" from Roots.
        // Roots (Finals) = Gen 0.
        // Their parents = Gen 1.

        const generation = new Map<string, number>();
        const queue: { id: string, gen: number }[] = [];

        // Find matches that are NOT parents to anyone (Potential Finals)
        // OR matches that are parents but their children are NOT in this set (maybe cross-stage).
        // Let's look for "Matches that appear as parents"
        const parents = new Set<string>();
        matches.forEach(m => {
            /* [ROLLBACK]
            if (m.teamAParentMatchId) parents.add(m.teamAParentMatchId);
            if (m.teamBParentMatchId) parents.add(m.teamBParentMatchId);
            */
        });

        // "Roots of the Tree" (visual right side) are those that are NOT parents OR are unrelated.
        // Actually, in a bracket, the Final is the one that no one feeds into (in this tournament context).
        // So matches whose ID is NOT in `parents`.
        const roots = matches.filter(m => !parents.has(m.id));

        roots.forEach(r => {
            generation.set(r.id, 0);
            queue.push({ id: r.id, gen: 0 });
        });

        // BFS backwards to assign generation to parents
        // We need Reverse Graph: Child -> Parents
        const parentMap = new Map<string, string[]>(); // ChildId -> ParentIds
        matches.forEach(m => {
            /* [ROLLBACK] Bracket Logic Disabled */
            // if (m.teamAParentMatchId) {
            //     const arr = parentMap.get(m.id) || [];
            //     arr.push(m.teamAParentMatchId);
            //     parentMap.set(m.id, arr);
            // }
            // if (m.teamBParentMatchId) {
            //     const arr = parentMap.get(m.id) || [];
            //     arr.push(m.teamBParentMatchId);
            //     parentMap.set(m.id, arr);
            // }
        });

        // Traverse
        while (queue.length > 0) {
            const { id, gen } = queue.shift()!;
            const parentsOfThis = parentMap.get(id) || [];

            parentsOfThis.forEach(pid => {
                if (!generation.has(pid)) {
                    generation.set(pid, gen + 1);
                    queue.push({ id: pid, gen: gen + 1 });
                }
            });
        }

        // Group by Generation
        const maxGen = Math.max(0, ...Array.from(generation.values()));
        const layersArr: Match[][] = Array.from({ length: maxGen + 1 }, () => []);

        matches.forEach(m => {
            const gen = generation.get(m.id);
            // If disconnected, default to maxGen (Leftmost)
            const idx = gen !== undefined ? gen : maxGen;
            layersArr[idx].push(m);
        });

        // Sort matches in each layer by date to keep them ordered vertically
        layersArr.forEach(l => l.sort((a, b) => new Date(a.startTime || '').getTime() - new Date(b.startTime || '').getTime()));

        return { layers: layersArr.reverse(), maxDepth: maxGen }; // Reverse so Left = Highest Gen, Right = Gen 0
    }, [matches]);


    return (
        <div className="relative w-full h-full min-h-[600px] overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex flex-row gap-8 min-w-max h-full">
                {layers.map((layer, layerIdx) => (
                    <div key={layerIdx} className="flex flex-col justify-center gap-8 min-w-[200px]">
                        <div className="text-center font-bold text-slate-500 uppercase tracking-widest text-xs mb-4">
                            Round {layerIdx + 1}
                        </div>
                        {layer.map(match => (
                            <div
                                key={match.id}
                                className="relative bg-slate-800 border border-slate-700 p-3 rounded shadow hover:bg-slate-700 cursor-pointer w-full"
                                onClick={() => setEditingMatch(match)}
                            >
                                <div className="text-[10px] text-slate-500 mb-1">{match.startTime ? match.startTime.slice(5, 16).replace('T', ' ') : 'TBD'}</div>
                                <div className={`flex justify-between items-center text-sm font-bold ${match.winnerId === match.teamAId ? 'text-green-400' : 'text-slate-300'}`}>
                                    <span>{match.teamA?.shortName || match.teamA?.name || 'TBD'}</span>
                                    {match.winnerId === match.teamAId && <span>✓</span>}
                                </div>
                                <div className={`flex justify-between items-center text-sm font-bold mt-1 ${match.winnerId === match.teamBId ? 'text-green-400' : 'text-slate-300'}`}>
                                    <span>{match.teamB?.shortName || match.teamB?.name || 'TBD'}</span>
                                    {match.winnerId === match.teamBId && <span>✓</span>}
                                </div>
                                {/* Status Pill */}
                                <div className="absolute top-2 right-2">
                                    <div className={`w-2 h-2 rounded-full ${match.status === 'LIVE' ? 'bg-red-500 animate-pulse' :
                                        (['FINISHED','COMPLETED'].includes(String(match.status || '').toUpperCase())) ? 'bg-slate-600' : 'bg-blue-500'
                                        }`} />
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Modal */}
            <MatchEditModal
                isOpen={!!editingMatch}
                onClose={() => setEditingMatch(null)}
                match={editingMatch!}
                teams={teams}
                existingTournaments={[]} // TODO: Pass these in
                otherMatches={matches}
                onSaveSuccess={onRefresh}
            />
        </div>
    );
}
