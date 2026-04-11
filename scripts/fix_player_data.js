const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPlayerData() {
    console.log('开始修复选手数据...\n');

    try {
        // 1. 查找并删除TES队的重复选手 (naiyou vs NAIYOU)
        console.log('=== 1. 修复TES队重复选手 ===');

        // 查找TES队
        const tesTeam = await prisma.team.findFirst({
            where: { shortName: 'TES' }
        });

        if (tesTeam) {
            // 找到所有TES的打野选手
            const junglers = await prisma.player.findMany({
                where: {
                    teamId: tesTeam.id,
                    role: 'JUNGLE'
                }
            });

            console.log(`找到 ${junglers.length} 个打野选手:`);
            junglers.forEach(j => console.log(`  - ${j.name} (${j.split})`));

            // 删除小写的naiyou，保留大写的NAIYOU
            const naiyouLower = junglers.find(j => j.name === 'naiyou');
            if (naiyouLower) {
                await prisma.player.delete({
                    where: { id: naiyouLower.id }
                });
                console.log(`✓ 已删除重复选手: naiyou (${naiyouLower.id})`);
            }

            // 检查JIAQI和JIADI是否重复
            const adcs = await prisma.player.findMany({
                where: {
                    teamId: tesTeam.id,
                    role: 'ADC'
                }
            });

            console.log(`\n找到 ${adcs.length} 个ADC选手:`);
            adcs.forEach(a => console.log(`  - ${a.name} (${a.split})`));
            console.log('备注: JIAQI和JIADI可能是不同选手，保留两者\n');
        }

        // 2. 统一Split字段为 "2026 LPL第一赛段"
        console.log('=== 2. 统一Split字段 ===');

        const updatedSplit = await prisma.player.updateMany({
            where: {
                split: 'Split 1'
            },
            data: {
                split: '2026 LPL第一赛段'
            }
        });

        console.log(`✓ 已更新 ${updatedSplit.count} 个选手的Split字段\n`);

        // 3. 统一选手姓名首字母大写
        console.log('=== 3. 统一选手姓名大小写 ===');

        // 获取所有选手
        const allPlayers = await prisma.player.findMany();

        let updatedCount = 0;
        for (const player of allPlayers) {
            // 将名字转为首字母大写
            const newName = player.name.charAt(0).toUpperCase() + player.name.slice(1).toLowerCase();

            if (newName !== player.name) {
                await prisma.player.update({
                    where: { id: player.id },
                    data: { name: newName }
                });
                console.log(`  ${player.name} → ${newName}`);
                updatedCount++;
            }
        }

        console.log(`\n✓ 已更新 ${updatedCount} 个选手的姓名格式`);

        // 4. 验证结果
        console.log('\n=== 4. 验证修复结果 ===');

        if (tesTeam) {
            const tesPlayers = await prisma.player.findMany({
                where: { teamId: tesTeam.id },
                orderBy: { role: 'asc' }
            });

            console.log(`\nTES队当前选手 (${tesPlayers.length}人):`);
            const roleGroups = {
                'TOP': [],
                'JUNGLE': [],
                'MID': [],
                'ADC': [],
                'SUPPORT': []
            };

            tesPlayers.forEach(p => {
                roleGroups[p.role].push(p.name);
            });

            Object.entries(roleGroups).forEach(([role, players]) => {
                if (players.length > 0) {
                    console.log(`  ${role}: ${players.join(', ')}`);
                }
            });
        }

        // 检查Split统一性
        const splitStats = await prisma.player.groupBy({
            by: ['split'],
            _count: true
        });

        console.log('\nSplit字段分布:');
        splitStats.forEach(s => {
            console.log(`  "${s.split}": ${s._count} 人`);
        });

        console.log('\n✅ 数据修复完成!');

    } catch (error) {
        console.error('❌ 修复失败:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixPlayerData();
