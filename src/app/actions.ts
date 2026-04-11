'use server';

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createTeam(formData: FormData) {
    const name = formData.get('name') as string;
    const shortName = formData.get('shortName') as string;
    const region = formData.get('region') as string;

    if (!name || !region) return { error: "战队名称和赛区必填 (Name and Region are required)" };

    try {
        await prisma.team.create({
            data: {
                name,
                shortName,
                region, // "LPL" or "LCK"
            },
        });
        revalidatePath('/teams');
        revalidatePath('/admin/schedule');
        return { success: true, message: `战队 ${name} 创建成功` };
    } catch (e) {
        console.error(e);
        return { error: "创建战队失败，名称可能已存在。" };
    }
}

export async function createMatch(formData: FormData) {
    const teamAId = formData.get('teamAId') as string;
    const teamBId = formData.get('teamBId') as string;
    const startTimeStr = formData.get('startTime') as string;
    const format = formData.get('format') as string || "BO3";
    const tournament = formData.get('tournament') as string || "LPL";
    const stage = formData.get('stage') as string || "Regular Season";

    if (!teamAId || !teamBId || !startTimeStr) return { error: "缺少必要字段 (Missing fields)" };

    try {
        await prisma.match.create({
            data: {
                teamAId,
                teamBId,
                startTime: new Date(startTimeStr),
                status: 'SCHEDULED', // Default
                format,
                tournament,
                stage,
            },
        });
        revalidatePath('/schedule');
        revalidatePath('/'); // Dashboard
        revalidatePath('/admin/schedule');
        return { success: true, message: "比赛赛程创建成功" };
    } catch (e) {
        console.error(e);
        return { error: "创建比赛失败" };
    }
}

export async function updateMatchResult(formData: FormData) {
    const matchId = formData.get('matchId') as string;
    const winnerId = formData.get('winnerId') as string;

    if (!matchId || !winnerId) return { error: "缺少必要字段" };

    try {
        await prisma.match.update({
            where: { id: matchId },
            data: {
                winnerId,
                status: 'FINISHED',
            },
        });
        revalidatePath('/schedule');
        revalidatePath('/analysis');
        // Also revalidate the specific match page if possible, but we don't know the ID here easily without querying? 
        // Actually we do have matchId.
        revalidatePath(`/match/${matchId}`);
        revalidatePath('/admin/schedule');
        return { success: true, message: "比赛赛果已更新" };
    } catch (e) {
        console.error(e);
        return { error: "更新赛果失败" };
    }
}

export async function addOdds(formData: FormData) {
    const matchId = formData.get('matchId') as string;
    const teamAOdds = parseFloat(formData.get('teamAOdds') as string);
    const teamBOdds = parseFloat(formData.get('teamBOdds') as string);
    const provider = formData.get('provider') as string || "Manual";
    const type = formData.get('type') as string || "WINNER";
    // Parse threshold
    const thresholdRaw = formData.get('threshold') as string;
    const threshold = thresholdRaw ? parseFloat(thresholdRaw) : null;

    if (!matchId || isNaN(teamAOdds) || isNaN(teamBOdds)) return { error: "数据无效 (Invalid data)" };

    try {
        await prisma.odds.create({
            data: {
                matchId,
                provider,
                type,
                threshold: (threshold !== null && !isNaN(threshold)) ? threshold : null,
                teamAOdds,
                teamBOdds,
            },
        });
        revalidatePath('/analysis');
        revalidatePath(`/match/${matchId}`);
        return { success: true, message: "赔率数据添加成功" };
    } catch (e) {
        console.error(e);
        return { error: "添加赔率失败" };
    }
}

export async function addComment(formData: FormData) {
    const matchId = formData.get('matchId') as string;
    const content = formData.get('content') as string;
    const author = formData.get('author') as string || "Analyst";
    const type = formData.get('type') as string || "POST_MATCH"; // Default to POST_MATCH

    if (!matchId || !content) return { error: "评论不能为空" };

    try {
        await prisma.comment.create({
            data: {
                matchId,
                content,
                author,
                type,
            },
        });
        revalidatePath(`/match/${matchId}`);
        return { success: true, message: "评论已发布" };
    } catch (e) {
        return { error: "发布评论失败" };
    }
}

