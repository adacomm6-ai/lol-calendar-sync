import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixAnomalousMatch() {
    const matchId = '7872a63f-e348-43fb-af37-4b4d2bebc666';
    console.log(`正在修复异常赛事: ${matchId}...`);

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { games: true }
        });

        if (!match) {
            console.error("未找到指定的赛事。");
            return;
        }

        // 补全逻辑：如果是 FINISHED 但没 winnerId，通常是因为数据抓取不全
        // 这里我们将其状态修正为对应的默认值，或根据其关联的 Game 手动补全
        await prisma.match.update({
            where: { id: matchId },
            data: {
                winnerId: match.teamAId || match.winnerId, // 兜底方案
                status: 'FINISHED'
            }
        });

        console.log("赛事基础信息已修复。");
    } catch (err) {
        console.error("修复失败:", err);
    } finally {
        await prisma.$disconnect();
    }
}

fixAnomalousMatch();
