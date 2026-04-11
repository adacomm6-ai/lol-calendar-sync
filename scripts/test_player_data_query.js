const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testPlayerDataQuery() {
    console.log('=== 测试选手数据查询 ===\n');

    try {
        // 测试旧值查询（应该找不到）
        console.log('1. 测试旧Split值查询 (Split 1):\n');
        const oldSplitPlayers = await prisma.player.findMany({
            where: { split: 'Split 1' },
            take: 5
        });
        console.log(`  找到 ${oldSplitPlayers.length} 个选手 (应该是0)`);

        // 测试新值查询（应该找到很多）
        console.log('\n2. 测试新Split值查询 (2026 LPL第一赛段):\n');
        const newSplitPlayers = await prisma.player.findMany({
            where: { split: '2026 LPL第一赛段' },
            take: 5,
            include: { team: true }
        });
        console.log(`  找到 ${newSplitPlayers.length} 个选手 (前5个):`);
        newSplitPlayers.forEach(p => {
            console.log(`    - ${p.name} (${p.team.shortName}) - ${p.role}`);
        });

        // 统计所有Split值
        console.log('\n3. 当前数据库中的Split分布:\n');
        const splitStats = await prisma.player.groupBy({
            by: ['split'],
            _count: true
        });
        splitStats.forEach(s => {
            console.log(`  "${s.split}": ${s._count} 人`);
        });

        console.log('\n✅ 查询测试完成');

    } catch (error) {
        console.error('❌ 测试失败:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testPlayerDataQuery();
