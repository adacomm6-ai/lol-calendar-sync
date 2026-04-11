'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function updateTeamInfo(id: string, data: { shortName?: string, region?: string }) {
    await prisma.team.update({
        where: { id },
        data
    });

    revalidatePath('/teams');
    revalidatePath('/admin/settings');
    revalidatePath('/admin/schedule');
    return { success: true };
}

export async function deleteTeam(id: string) {
    try {
        const matchCount = await prisma.match.count({
            where: {
                OR: [{ teamAId: id }, { teamBId: id }]
            }
        });

        if (matchCount > 0) {
            return { success: false, error: `拒绝删除：该战队名下仍有关联的 ${matchCount} 场比赛记录。请先移除比赛。` };
        }

        // Clean up linked entities
        await prisma.player.deleteMany({ where: { teamId: id } });
        await prisma.teamComment.deleteMany({ where: { teamId: id } });

        // Remove team
        await prisma.team.delete({ where: { id } });

        revalidatePath('/teams');
        revalidatePath('/admin/settings');
        revalidatePath('/admin/schedule');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function addTeam(data: { id: string; name: string; shortName: string; region: string; logo: string }) {
    try {
        const existing = await prisma.team.findUnique({ where: { id: data.id } });
        if (existing) {
            return { success: false, error: '战队 ID 已存在，请换一个 ID' };
        }

        const newTeam = await prisma.team.create({
            data: {
                id: data.id,
                name: data.name,
                shortName: data.shortName || null,
                region: data.region,
                logo: data.logo || null,
            }
        });

        revalidatePath('/teams');
        revalidatePath('/admin/settings');
        revalidatePath('/admin/schedule');
        return { success: true, team: newTeam };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
