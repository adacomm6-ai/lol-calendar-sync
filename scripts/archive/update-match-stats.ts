
import { prisma } from '@/lib/db';

async function updateMatch() {
    const matchId = '96cc997c-c451-4fab-a0ed-18161253d383'; // IG vs TES (Dec 26)

    // Clear previous comments to avoid duplicates
    await prisma.comment.deleteMany({
        where: { matchId: matchId, author: { contains: 'AI' } }
    });

    // Add Refined Analysis Comment
    await prisma.comment.create({
        data: {
            matchId: matchId,
            author: 'AI Analyst (Demacia 1)',
            content: `**🏆 赛后数据板 (Post-Match Stats)**\n\n**TES 1 - 0 IG**\n⏱️ 总时长: **35:29**  |  💀 人头比: **31 - 28**\n\n🛡️ **双方阵容对比 (Lineups)**:\n\nTES (Blue)          | IG (Red)\n--------------------|--------------------\n🔝 Zuan (奎桑提)    | Soboro (剑魔)\n🌲 Naiyou (佛耶戈)  | Wei (猴子)\n🔮 Nia (发条)       | Renard (安妮)\n🏹 JackeyLove (烬)  | Photic (韦鲁斯)\n🛡️ Fengyue (雷欧娜)| Jmei (芮尔)`
        }
    });

    console.log('Match Updated successfully with Lineups & Duration.');
}

updateMatch();
