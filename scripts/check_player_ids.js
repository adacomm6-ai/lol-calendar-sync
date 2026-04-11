const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPlayerIds() {
    console.log('=== 检查Game数据中的playerId ===\n');

    try {
        // 找一个有teamAStats的game
        const game = await prisma.game.findFirst({
            where: {
                teamAStats: { not: null }
            },
            include: {
                match: {
                    include: {
                        teamA: { include: { players: true } },
                        teamB: { include: { players: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!game) {
            console.log('没有找到包含teamAStats的game');
            return;
        }

        console.log(`Game ID: ${game.id}`);
        console.log(`Match: ${game.match.teamA?.name} vs ${game.match.teamB?.name}\n`);

        // 解析teamAStats
        const teamAStats = JSON.parse(game.teamAStats);
        console.log('teamAStats (前3个选手):');
        teamAStats.slice(0, 3).forEach((p, i) => {
            console.log(`  ${i + 1}. playerName: "${p.playerName || p.name}"`);
            console.log(`     playerId: ${p.playerId || '(无)'}`);
            console.log(`     hero: ${p.championName || p.hero}`);
            console.log('');
        });

        // 检查实际的teamA players
        console.log(`\n实际的 ${game.match.teamA?.name} 队选手:`);
        game.match.teamA?.players.forEach(p => {
            console.log(`  - ${p.name} (ID: ${p.id})`);
        });

        console.log('\n✅ 检查完成');

    } catch (error) {
        console.error('❌ 检查失败:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPlayerIds();
