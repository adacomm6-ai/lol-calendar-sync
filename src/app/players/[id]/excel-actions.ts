'use server';

import { prisma } from '@/lib/db';
import { ExcelMatchRecord, writePlayerMatchesToExcel, readPlayerMatchesFromExcel } from '@/lib/excel';
import { format } from 'date-fns';
import { revalidatePath } from 'next/cache';

export async function exportPlayerMatchesAction(playerId: string) {
    const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: { team: true }
    });
    if (!player) throw new Error('Player not found');

    // Fetch Matches (Reuse similar logic to page.tsx or just fetch all related)
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { match: { teamAId: player.teamId } },
                { match: { teamBId: player.teamId } }
            ]
        },
        include: { match: { include: { teamA: true, teamB: true } } },
        orderBy: { match: { startTime: 'desc' } }
    });

    const records: any[] = [];
    const nickname = player.name.toLowerCase().replace(/\s/g, '');

    games.forEach(g => {
        if (!g.analysisData) return;
        try {
            const data = JSON.parse(g.analysisData);
            let allPlayers = [];
            if (data.damage_data) allPlayers = data.damage_data;
            else allPlayers = [...(data.teamA?.players || []), ...(data.teamB?.players || [])];

            const pStats = allPlayers.find((p: any) =>
                (p.name || p.player || p.player_name || '').toLowerCase().replace(/\s/g, '') === nickname
            );

            if (pStats) {
                const opponent = player.teamId === g.match.teamAId ? (g.match.teamB || { name: 'TBD', shortName: 'TBD' }) : (g.match.teamA || { name: 'TBD', shortName: 'TBD' });
                const isWin = (g.winnerId === player.teamId) || (g.winnerId === pStats.team); // Approx check

                records.push({
                    Date: g.match.startTime ? format(g.match.startTime, 'yyyy-MM-dd') : 'TBD',
                    Result: isWin ? 'WIN' : 'LOSS',
                    Opponent: opponent.shortName || opponent.name || 'TBD',
                    Game: g.gameNumber,
                    Hero: pStats.hero || '',
                    KDA: `${pStats.kills || 0}/${pStats.deaths || 0}/${pStats.assists || 0}`,
                    Damage: pStats.damage || 0,
                    MatchID: g.matchId,
                    GameID: g.id
                });
            }
        } catch (e) { }
    });

    try {
        const fileName = writePlayerMatchesToExcel(playerId, player.name, records);
        return { success: true, fileName };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function syncPlayerMatchesFromExcelAction(playerId: string, fileName: string) {
    try {
        console.log(`[Sync] Attempting to read: ${fileName}`);
        const records = readPlayerMatchesFromExcel(fileName);
        console.log(`[Sync] Read success. ${records.length} records.`);
        let updateCount = 0;

        for (const r of records) {
            if (!r.GameID) continue;

            const game = await prisma.game.findUnique({ where: { id: r.GameID } });
            if (!game) continue;

            // Simplified update logic: parse KDA from Excel "K/D/A"
            const kdaParts = String(r.KDA).split('/').map(x => parseInt(x.trim()));
            const [k, d, a] = kdaParts.length === 3 ? kdaParts : [0, 0, 0];
            const dmg = Number(r.Damage) || 0;
            const hero = r.Hero;

            // Update JSON
            const updateJson = (jsonStr: string | null) => {
                if (!jsonStr) return jsonStr;
                try {
                    const arr = JSON.parse(jsonStr);
                    if (!Array.isArray(arr)) return jsonStr;

                    let modified = false;
                    const newArr = arr.map((p: any) => {
                        // Match roughly by hero or assumptions? 
                        // Actually we don't know EXACTLY which player object without name matching again.
                        // But we have GameID. We need to find the player entry in that game.
                        // We assume the Excel row belongs to 'playerId'.
                        // We need to fetch player name again.
                        // ... For efficiency, let's just find the entry that looks like the player.
                        // Wait, fetching player inside loop is bad. Fetch once outside.
                        return p;
                    });

                    // Actually, we need to match by hero if possible, or name.
                    // Let's defer strict matching.
                    return jsonStr;
                } catch (e) { return jsonStr; }
            };

            // ... To do this properly, we need the Player Name.
        }

        // Re-implementing with proper Player fetch
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        if (!player) throw new Error('Player not found');
        const pNameNorm = player.name.toLowerCase().replace(/\s/g, '');

        for (const r of records) {
            if (!r.GameID) continue;
            const game = await prisma.game.findUnique({ where: { id: r.GameID } });
            if (!game) continue;

            const kdaParts = String(r.KDA).split('/').map(x => parseInt(x.trim()));
            const [k, d, a] = kdaParts.length === 3 ? kdaParts : [0, 0, 0];
            const dmg = Number(r.Damage) || 0;
            const hero = String(r.Hero).trim();

            const updateStatsArray = (jsonStr: string | null) => {
                if (!jsonStr) return jsonStr;
                try {
                    const arr = JSON.parse(jsonStr);
                    let mod = false;
                    const newArr = arr.map((p: any) => {
                        const n = (p.name || p.player || p.player_name || '').toLowerCase().replace(/\s/g, '');
                        if (n === pNameNorm) {
                            mod = true;
                            return { ...p, kills: k, deaths: d, assists: a, damage: dmg, hero: hero };
                        }
                        return p;
                    });
                    return mod ? JSON.stringify(newArr) : jsonStr;
                } catch (e) { return jsonStr; }
            };

            const tA = updateStatsArray(game.teamAStats);
            const tB = updateStatsArray(game.teamBStats);

            if (tA !== game.teamAStats || tB !== game.teamBStats) {
                await prisma.game.update({
                    where: { id: game.id },
                    data: { teamAStats: tA, teamBStats: tB }
                });
                updateCount++;
            }
        }

        revalidatePath(`/players/${playerId}`);
        return { success: true, count: updateCount };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
