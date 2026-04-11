'use server';

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { extractOddsFromImage } from "@/lib/gemini";
import { upsertPlayersFromStats } from "@/lib/player-utils";

export async function updateGameStats(gameId: string, teamAStats: any[], teamBStats: any[], winnerId: string) {
    if (!gameId) return { success: false, error: "Missing Game ID" };

    try {
        const game = await prisma.game.findUnique({ where: { id: gameId }, include: { match: { include: { teamA: true, teamB: true } } } });
        if (!game) return { success: false, error: "Game not found" };

        const teamA = game.match.teamA;
        const teamB = game.match.teamB;

        // Preserve existing metadata (bans, duration, ten_min_kills, etc.)
        let existingJson: any = {};
        try {
            existingJson = JSON.parse(game.analysisData as string || '{}');
        } catch (e) { }

        const analysisData = {
            ...existingJson, // Default to existing
            teamA: { ...existingJson.teamA, name: teamA?.name || 'TBD', players: teamAStats }, // Update players/name, keep bans if inside teamA
            teamB: { ...existingJson.teamB, name: teamB?.name || 'TBD', players: teamBStats },
            damage_data: [...teamAStats, ...teamBStats],
            duration: existingJson.duration || 0
        };

        await prisma.game.update({
            where: { id: gameId },
            data: {
                winnerId,
                teamAStats: JSON.stringify(teamAStats),
                teamBStats: JSON.stringify(teamBStats),
                analysisData: JSON.stringify(analysisData)
            }
        });

        // 自动更新或创建关联的选手库
        if (teamA?.id) {
            await upsertPlayersFromStats(teamA.id, game.match.tournament, teamAStats);
        }
        if (teamB?.id) {
            await upsertPlayersFromStats(teamB.id, game.match.tournament, teamBStats);
        }

        revalidatePath(`/match/${game.matchId}`);
        return { success: true };
    } catch (e) {
        console.error("Update Stats Error:", e);
        return { success: false, error: String(e) };
    }
}


export async function uploadOddsScreenshot(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        if (!file) return { success: false, error: "No file uploaded" };

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const data = await extractOddsFromImage(buffer);

        if (data.error) return { success: false, error: data.error };

        return { success: true, data };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
