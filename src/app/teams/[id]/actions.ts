'use server';


// Force IDE refresh
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateTeamNote(teamId: string, content: string) {
    if (!content && content !== '') return;

    // Check for existing note (latest comment)
    const existing = await prisma.teamComment.findFirst({
        where: { teamId },
        orderBy: { createdAt: 'desc' }
    });

    if (existing) {
        // Since we don't have updatedAt, we just update content.
        // If you want to track updates, we should add updatedAt to schema later.
        await prisma.teamComment.update({
            where: { id: existing.id },
            data: { content }
        });
    } else {
        await prisma.teamComment.create({
            data: {
                teamId,
                content,
                author: 'Admin' // Default author
            }
        });
    }

    revalidatePath(`/teams/${teamId}`);
    revalidatePath('/'); // Update Home Page Schedule
}

export async function addPlayer(teamId: string, name: string, role: string, split: string) {
    if (!name || !teamId) return { success: false, error: "Missing required fields" };

    try {
        await prisma.player.create({
            data: {
                name,
                role,
                split,
                teamId
            }
        });
        revalidatePath(`/teams/${teamId}`);
        return { success: true };
    } catch (e) {
        console.error("Failed to add player:", e);
        return { success: false, error: "Database error" };
    }
}

export async function updatePlayer(playerId: string, data: { name?: string, role?: string, split?: string }) {
    if (!playerId) return { success: false, error: "Missing ID" };

    try {
        await prisma.player.update({
            where: { id: playerId },
            data
        });
        // We need teamId to revalidate. Fetch it or accept it as arg? 
        // Simpler to just fetch player to get teamId is cheap, or update returns it.
        // Actually, we can return success and let client handle refresh, but server actions usually revalidate.
        // Let's optimistic UI handle it mostly, but revalidate is good.
        // We'll revalidate the current page from the client side call usually, but here we don't know the URL.
        // We can find the player first.
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        if (player) revalidatePath(`/teams/${player.teamId}`);

        return { success: true };
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
        return { success: true };
    } catch (e) {
        console.error("Failed to delete player:", e);
        return { success: false, error: "Database error" };
    }
}
