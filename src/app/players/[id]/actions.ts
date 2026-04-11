'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function savePlayerMatches(playerId: string, history: any[]) {
    if (!playerId) throw new Error('Player ID required');

    // Find player first to ensure existence & name
    const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: { team: true }
    });
    if (!player) throw new Error('Player found');

    let updateCount = 0;

    for (const item of history) {
        // We only update if we have a matchId/gameId
        if (!item.gameId) continue;

        const game = await prisma.game.findUnique({ where: { id: item.gameId } });
        if (!game) continue;

        // Helper to match player robustly
        const isMatch = (pNameRaw: string) => {
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const pName = normalize(pNameRaw);
            const targetName = normalize(player.name);
            const tTag = normalize(player.team?.shortName || '');

            // 1. Strict Exact
            if (pName === targetName) return true;

            // 2. Team Prefix
            if (tTag && pName === (tTag + targetName)) return true;

            // 3. Fallback (Strict Includes)
            if (targetName.length >= 4 && pName.includes(targetName)) return true; // Data contains Player (e.g. IGJwei contains Jwei)

            // DO NOT ALLOW TARGET CONTAINING PNAME (e.g. "Jwei" contains "Wei")
            return false;
        };

        const updateStatsArray = (jsonStr: string | null) => {
            if (!jsonStr) return jsonStr;
            try {
                const arr = JSON.parse(jsonStr);
                if (!Array.isArray(arr)) return jsonStr;

                let modified = false;
                const newArr = arr.map((p: any) => {
                    const pNameRaw = p.name || p.player_name || '';
                    if (isMatch(pNameRaw)) {
                        // ... found ...
                        const kdaParts = item.kda ? item.kda.split('/').map((n: string) => parseInt(n)) : [0, 0, 0];
                        const [k, d, a] = kdaParts.length === 3 ? kdaParts : [p.kills, p.deaths, p.assists];

                        modified = true;
                        return {
                            ...p,
                            hero: item.hero || p.hero,
                            kills: k,
                            deaths: d,
                            assists: a,
                            damage: item.damage || p.damage
                        };
                    }
                    return p;
                });
                return modified ? JSON.stringify(newArr) : jsonStr;
            } catch (e) { return jsonStr; }
        };

        const newTeamA = updateStatsArray(game.teamAStats);
        const newTeamB = updateStatsArray(game.teamBStats);

        // SYNC FIX: Also update 'analysisData'
        let newAnalysisData = game.analysisData;
        if (game.analysisData) {
            try {
                let data = JSON.parse(game.analysisData);
                let modified = false;

                const updatePlayerObj = (p: any) => {
                    const pNameRaw = p.name || p.player || p.player_name || '';
                    if (isMatch(pNameRaw)) {
                        const kdaParts = item.kda ? item.kda.split('/').map((n: string) => parseInt(n)) : [0, 0, 0];
                        const [k, d, a] = kdaParts.length === 3 ? kdaParts : [p.kills, p.deaths, p.assists];
                        p.kills = k;
                        p.deaths = d;
                        p.assists = a;
                        p.damage = item.damage || p.damage;
                        p.hero = item.hero || p.hero;
                        modified = true;
                    }
                };

                if (data.damage_data && Array.isArray(data.damage_data)) {
                    data.damage_data.forEach(updatePlayerObj);
                } else {
                    if (data.teamA?.players) data.teamA.players.forEach(updatePlayerObj);
                    if (data.teamB?.players) data.teamB.players.forEach(updatePlayerObj);
                }

                if (modified) newAnalysisData = JSON.stringify(data);
            } catch (e) { console.error("Failed to sync analysisData", e); }
        }

        // Check Data Integrity
        if (newTeamA !== game.teamAStats || newTeamB !== game.teamBStats || newAnalysisData !== game.analysisData) {
            await prisma.game.update({
                where: { id: game.id },
                data: {
                    teamAStats: newTeamA,
                    teamBStats: newTeamB,
                    analysisData: newAnalysisData // Persist the sync
                }
            });
            updateCount++;
        }
    }

    revalidatePath(`/players/${playerId}`);
    return { success: true, count: updateCount };
}
