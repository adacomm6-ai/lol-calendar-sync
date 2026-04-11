const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function populatePlayerIds() {
    console.log('=== 自动填充选手ID (Auto-populate Player IDs) ===\n');

    try {
        // 获取所有有stats但可能缺少playerId的游戏
        const games = await prisma.game.findMany({
            where: {
                OR: [
                    { teamAStats: { not: null } },
                    { teamBStats: { not: null } }
                ]
            },
            include: {
                match: {
                    include: {
                        teamA: { include: { players: true } },
                        teamB: { include: { players: true } }
                    }
                }
            }
        });

        console.log(`找到 ${games.length} 场有数据的比赛\n`);

        let totalUpdated = 0;
        let totalPlayersMatched = 0;
        let totalPlayersFailed = 0;

        for (const game of games) {
            let needUpdate = false;
            let updatedTeamAStats = null;
            let updatedTeamBStats = null;

            // 处理TeamA Stats
            if (game.teamAStats) {
                try {
                    const stats = JSON.parse(game.teamAStats);
                    let modified = false;

                    for (const player of stats) {
                        const playerName = player.playerName || player.name;

                        // 如果已经有playerId，跳过
                        if (player.playerId) continue;
                        if (!playerName) continue;

                        // 尝试查找选手 (不区分大小写)
                        const foundPlayer = await prisma.player.findFirst({
                            where: {
                                name: {
                                    equals: playerName,
                                    mode: 'insensitive'
                                }
                            }
                        });

                        if (foundPlayer) {
                            player.playerId = foundPlayer.id;
                            modified = true;
                            totalPlayersMatched++;
                            console.log(`  ✓ 匹配: ${playerName} → ${foundPlayer.name} (${foundPlayer.id.substring(0, 8)}...)`);
                        } else {
                            totalPlayersFailed++;
                            console.log(`  ✗ 未找到: ${playerName}`);
                        }
                    }

                    if (modified) {
                        updatedTeamAStats = JSON.stringify(stats);
                        needUpdate = true;
                    }
                } catch (e) {
                    console.error(`  处理teamAStats失败: ${e.message}`);
                }
            }

            // 处理TeamB Stats
            if (game.teamBStats) {
                try {
                    const stats = JSON.parse(game.teamBStats);
                    let modified = false;

                    for (const player of stats) {
                        const playerName = player.playerName || player.name;

                        if (player.playerId) continue;
                        if (!playerName) continue;

                        const foundPlayer = await prisma.player.findFirst({
                            where: {
                                name: {
                                    equals: playerName,
                                    mode: 'insensitive'
                                }
                            }
                        });

                        if (foundPlayer) {
                            player.playerId = foundPlayer.id;
                            modified = true;
                            totalPlayersMatched++;
                            console.log(`  ✓ 匹配: ${playerName} → ${foundPlayer.name} (${foundPlayer.id.substring(0, 8)}...)`);
                        } else {
                            totalPlayersFailed++;
                            console.log(`  ✗ 未找到: ${playerName}`);
                        }
                    }

                    if (modified) {
                        updatedTeamBStats = JSON.stringify(stats);
                        needUpdate = true;
                    }
                } catch (e) {
                    console.error(`  处理teamBStats失败: ${e.message}`);
                }
            }

            // 更新game
            if (needUpdate) {
                const updateData = {};
                if (updatedTeamAStats) updateData.teamAStats = updatedTeamAStats;
                if (updatedTeamBStats) updateData.teamBStats = updatedTeamBStats;

                await prisma.game.update({
                    where: { id: game.id },
                    data: updateData
                });

                totalUpdated++;
                console.log(`  📝 已更新 Game ${game.id.substring(0, 8)}...\n`);
            }
        }

        console.log('\n=== 汇总 ===');
        console.log(`更新的游戏数: ${totalUpdated}`);
        console.log(`成功匹配的选手: ${totalPlayersMatched}`);
        console.log(`未找到的选手: ${totalPlayersFailed}`);
        console.log('\n✅ 完成！');

    } catch (error) {
        console.error('❌ 失败:', error);
    } finally {
        await prisma.$disconnect();
    }
}

populatePlayerIds();
