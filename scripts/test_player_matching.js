const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testPlayerNameMatching() {
    console.log('=== 测试选手姓名匹配逻辑 ===\n');

    try {
        // 1. 测试大小写匹配
        console.log('1. 测试不同大小写的匹配:\n');

        const testCases = [
            'KESHI',  // 全大写
            'Keshi',  // 首字母大写
            'keshi',  // 全小写
        ];

        for (const testName of testCases) {
            // 精确匹配（区分大小写）
            const exactMatch = await prisma.player.findFirst({
                where: { name: testName }
            });

            // 不区分大小写匹配 (mode: 'insensitive')
            const caseInsensitiveMatch = await prisma.player.findFirst({
                where: {
                    name: {
                        equals: testName,
                        mode: 'insensitive'
                    }
                }
            });

            console.log(`搜索: "${testName}"`);
            console.log(`  精确匹配: ${exactMatch ? `✓ 找到 ${exactMatch.name}` : '✗ 未找到'}`);
            console.log(`  不区分大小写: ${caseInsensitiveMatch ? `✓ 找到 ${caseInsensitiveMatch.name}` : '✗ 未找到'}`);
            console.log('');
        }

        // 2. 查看实际的选手姓名格式
        console.log('2. 查看TT队实际选手姓名:\n');

        const ttTeam = await prisma.team.findFirst({
            where: { shortName: 'TT' },
            include: { players: true }
        });

        if (ttTeam) {
            console.log(`${ttTeam.shortName} 队选手:`);
            ttTeam.players.forEach(p => {
                console.log(`  - ${p.name} (${p.role})`);
            });
        }

        // 3. 测试Game中的analysisData
        console.log('\n3. 检查Game数据中存储的选手名字格式:\n');

        const recentGame = await prisma.game.findFirst({
            where: {
                analysisData: { not: null }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (recentGame && recentGame.analysisData) {
            const analysis = JSON.parse(recentGame.analysisData);
            if (analysis.damage_data && analysis.damage_data.length > 0) {
                console.log('最近一场比赛的选手名字 (来自AI识别):');
                analysis.damage_data.slice(0, 5).forEach(p => {
                    console.log(`  - ${p.playerName || p.name} (${p.team})`);
                });
            }
        }

        console.log('\n✅ 测试完成');

    } catch (error) {
        console.error('❌ 测试失败:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testPlayerNameMatching();
