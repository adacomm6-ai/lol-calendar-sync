const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fastPopulatePlayerIds() {
    console.log('=== 🚀 极速版数据关联 (Fast populate) ===\n');
    const startTime = Date.now();

    try {
        // 1. 预加载所有选手到内存 (Pre-load all players)
        console.log('1. 正在加载所有选手数据...');
        const allPlayers = await prisma.player.findMany({
            select: { id: true, name: true }
        });

        // 创建查找映射 (Name -> ID)
        const playerMap = new Map();
        allPlayers.forEach(p => {
            if (p.name) {
                playerMap.set(p.name.toLowerCase().trim(), p.id);
            }
        });
        console.log(`   ✅ 已缓存 ${allPlayers.length} 名选手 (内存查找表 ready)\n`);

        // 2. 获取所有需要处理的比赛
        console.log('2. 正在加载比赛数据...');
        const games = await prisma.game.findMany({
            where: {
                OR: [
                    { teamAStats: { not: null } },
                    { teamBStats: { not: null } }
                ]
            },
            select: {
                id: true,
                teamAStats: true,
                teamBStats: true
            }
        });
        console.log(`   ✅ 找到 ${games.length} 场比赛\n`);

        // 3. 处理数据 (CPU密集型，无库操作)
        console.log('3. 正在分析匹配 (In-memory processing)...');
        const updates = [];
        let matchCount = 0;

        for (const game of games) {
            let needUpdate = false;
            let updatedTeamAStats = null;
            let updatedTeamBStats = null;

            // Helper function to process stats array
            const processStats = (jsonStr) => {
                if (!jsonStr) return null;
                try {
                    const stats = JSON.parse(jsonStr);
                    let modified = false;

                    for (const player of stats) {
                        const playerName = player.playerName || player.name;
                        // 只有当没有ID且有名字时才查找
                        if (!player.playerId && playerName) {
                            const cleanName = playerName.toLowerCase().trim();
                            const foundId = playerMap.get(cleanName);

                            if (foundId) {
                                player.playerId = foundId;
                                modified = true;
                                matchCount++;
                            }
                        }
                    }
                    return modified ? JSON.stringify(stats) : null;
                } catch (e) {
                    return null;
                }
            };

            const newStatsA = processStats(game.teamAStats);
            if (newStatsA) {
                updatedTeamAStats = newStatsA;
                needUpdate = true;
            }

            const newStatsB = processStats(game.teamBStats);
            if (newStatsB) {
                updatedTeamBStats = newStatsB;
                needUpdate = true;
            }

            if (needUpdate) {
                updates.push({
                    id: game.id,
                    data: {
                        ...(updatedTeamAStats && { teamAStats: updatedTeamAStats }),
                        ...(updatedTeamBStats && { teamBStats: updatedTeamBStats })
                    }
                });
            }
        }
        console.log(`   ✅ 分析完成，发现 ${updates.length} 场比赛需要更新 (共匹配 ${matchCount} 名选手)\n`);

        // 4. 执行更新 (并发处理)
        if (updates.length > 0) {
            console.log('4. 正在写入数据库 (Parallel updates)...');

            // 分批处理以防止连接池耗尽 (Batch processing)
            const BATCH_SIZE = 50;
            let processed = 0;

            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                const batch = updates.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(update =>
                    prisma.game.update({
                        where: { id: update.id },
                        data: update.data
                    })
                ));

                processed += batch.length;
                process.stdout.write(`   进度: ${Math.round(processed / updates.length * 100)}% (${processed}/${updates.length})\r`);
            }
            console.log('\n'); // New line after progress
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`=== 🎉 完成! 耗时: ${duration}秒 ===`);

    } catch (error) {
        console.error('❌ 失败:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fastPopulatePlayerIds();
