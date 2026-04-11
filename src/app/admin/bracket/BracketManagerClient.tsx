'use client';

import { useState, useEffect, useCallback } from 'react';
import BracketViewer from '@/components/admin/BracketViewer';
import { searchMatches } from '@/app/admin/schedule/actions';

type Team = { id: string, name: string, shortName: string | null, region: string };

export default function BracketManagerClient({ teams, tournaments }: { teams: Team[], tournaments: string[] }) {
    const [selectedTournament, setSelectedTournament] = useState(tournaments[0] || '');
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchMatches = useCallback(async () => {
        if (!selectedTournament) return;
        setLoading(true);
        // Reuse searchMatches but specific to tournament
        // We might need a better action that returns ALL matches for a tournament regardless of date
        // Let's modify searchMatches or filter locally? 
        // searchMatches filters by Date by default if not provided.
        // We should add a "Tournament ONLY" filter to searchMatches or a new action.
        // For now, let's try to pass a wide date range or assume `searchMatches` supports tournament logic.
        // Actually `searchMatches` in `admin/schedule/actions.ts` filters by Date by default. 
        // Let's rely on a tailored search here.

        try {
            // We need a specific action for this, or modify searchMatches to ignore date.
            // Let's define a direct fetch here via a Server Action we'll create later?
            // Pass 'ALL' to bypass date filter and get full tournament history
            const res = await searchMatches('ALL', selectedTournament);
            if (res.success && res.matches) {
                // Client-side filter to be safe because `searchMatches` might return others if logic is loose
                const relevant = res.matches.filter((m: any) => m.tournament === selectedTournament);
                setMatches(relevant);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [selectedTournament]);

    useEffect(() => {
        fetchMatches();
    }, [selectedTournament, fetchMatches]);

    return (
        <div className="space-y-6">
            <div className="flex gap-4 items-center bg-slate-800 p-4 rounded-lg">
                <label className="font-bold text-slate-300">Select Tournament:</label>
                <select
                    className="bg-slate-700 border border-slate-600 rounded p-2 text-white min-w-[200px]"
                    value={selectedTournament}
                    onChange={(e) => setSelectedTournament(e.target.value)}
                >
                    {tournaments.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                    onClick={fetchMatches}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold"
                >
                    Refresh
                </button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-500 animate-pulse">Loading Bracket...</div>
            ) : matches.length > 0 ? (
                <BracketViewer
                    matches={matches}
                    teams={teams}
                    onRefresh={fetchMatches}
                />
            ) : (
                <div className="text-center py-20 text-slate-500">No matches found for this tournament.</div>
            )}
        </div>
    );
}
