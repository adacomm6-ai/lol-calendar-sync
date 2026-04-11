'use server';

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateTeamNote(teamId: string, content: string) {
    if (!content && content !== '') return;

    const existing = await prisma.teamComment.findFirst({
        where: { teamId },
        orderBy: { createdAt: 'desc' }
    });

    if (existing) {
        await prisma.teamComment.update({
            where: { id: existing.id },
            data: { content }
        });
    } else {
        await prisma.teamComment.create({
            data: {
                teamId,
                content,
                author: 'Admin'
            }
        });
    }

    revalidatePath(`/teams/${teamId}`);
    revalidatePath('/');
}

export async function addPlayer(teamId: string, name: string, role: string, split: string) {
    if (!name || !teamId) return { success: false, error: "Missing required fields" };

    try {
        const created = await prisma.player.create({
            data: {
                name,
                role,
                split,
                teamId
            },
            include: {
                team: {
                    select: {
                        id: true,
                        name: true,
                        region: true,
                        logo: true,
                    },
                },
            },
        });
        revalidatePath(`/teams/${teamId}`);
        revalidatePath('/admin/settings');
        return { success: true, player: created };
    } catch (e) {
        console.error("Failed to add player:", e);
        return { success: false, error: "Database error" };
    }
}

export async function updatePlayer(playerId: string, data: { name?: string, role?: string, split?: string, teamId?: string }) {
    if (!playerId) return { success: false, error: "Missing ID" };

    try {
        const previous = await prisma.player.findUnique({ where: { id: playerId } });
        if (!previous) return { success: false, error: "Player not found" };

        const updated = await prisma.player.update({
            where: { id: playerId },
            data,
            include: {
                team: {
                    select: {
                        id: true,
                        name: true,
                        region: true,
                        logo: true,
                    },
                },
            },
        });

        revalidatePath(`/teams/${updated.teamId}`);
        if (previous.teamId !== updated.teamId) {
            revalidatePath(`/teams/${previous.teamId}`);
        }
        revalidatePath('/admin/settings');

        return { success: true, player: updated };
    } catch (e) {
        console.error("Failed to update player:", e);
        return { success: false, error: "Database error" };
    }
}

export async function deletePlayer(playerId: string) {
    if (!playerId) return { success: false, error: "Missing ID" };

    try {
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        if (!player) return { success: false, error: "Player not found" };

        await prisma.player.delete({ where: { id: playerId } });
        revalidatePath(`/teams/${player.teamId}`);
        revalidatePath('/admin/settings');
        return { success: true };
    } catch (e) {
        console.error("Failed to delete player:", e);
        return { success: false, error: "Database error" };
    }
}
