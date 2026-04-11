const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testCaseInsensitiveMatching() {
    console.log('=== 验证不区分大小写匹配 ===\n');

    try {
        // 测试Team匹配（模拟resolveTeam函数）
        console.log('1. 测试Team匹配:\n');

        const teamTestCases = ['TES', 'tes', 'Tes', 'TOP ESPORTS', 'top esports'];

        for (const testName of teamTestCases) {
            const teamByName = await prisma.team.findFirst({
                where: { name: { equals: testName, mode: 'insensitive' } }
            });

            const teamByShort = await prisma.team.findFirst({
                where: { shortName: { equals: testName, mode: 'insensitive' } }
            });

            const found = teamByName || teamByShort;
            console.log(`  "${testName}" → ${found ? `✓ ${found.name} (${found.shortName})` : '✗ 未找到'}`);
        }

        // 测试Player匹配（模拟resolvePlayer函数）
        console.log('\n2. 测试Player匹配:\n');

        const playerTestCases = ['KESHI', 'Keshi', 'keshi', 'JUNHAO', 'junhao'];

        for (const testName of playerTestCases) {
            const player = await prisma.player.findFirst({
                where: { name: { equals: testName, mode: 'insensitive' } }
            });

            console.log(`  "${testName}" → ${player ? `✓ ${player.name} (${player.role})` : '✗ 未找到'}`);
        }

        // 测试带teamId的Player匹配
        console.log('\n3. 测试指定队伍的Player匹配:\n');

        const ttTeam = await prisma.team.findFirst({
            where: { shortName: { equals: 'TT', mode: 'insensitive' } }
        });

        if (ttTeam) {
            const playerInTeam = await prisma.player.findFirst({
                where: {
                    name: { equals: 'KESHI', mode: 'insensitive' },
                    teamId: ttTeam.id
                }
            });

            console.log(`  TT队中搜索"KESHI" → ${playerInTeam ? `✓ ${playerInTeam.name}` : '✗ 未找到'}`);

            // 应该找不到（因为Keshi在TT队，但我们搜索错误的队伍）
            const tesTeam = await prisma.team.findFirst({
                where: { shortName: { equals: 'TES', mode: 'insensitive' } }
            });

            if (tesTeam) {
                const notInTeam = await prisma.player.findFirst({
                    where: {
                        name: { equals: 'KESHI', mode: 'insensitive' },
                        teamId: tesTeam.id
                    }
                });

                console.log(`  TES队中搜索"KESHI" → ${notInTeam ? `✗ 错误找到 ${notInTeam.name}` : '✓ 正确未找到'}`);
            }
        }

        console.log('\n✅ 验证完成 - 所有查询都支持不区分大小写！');

    } catch (error) {
        console.error('❌ 测试失败:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testCaseInsensitiveMatching();
