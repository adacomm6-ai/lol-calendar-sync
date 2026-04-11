const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const filePath = path.join(process.cwd(), 'backup', 'perfect_cloud_snapshot.json');
    if (!fs.existsSync(filePath)) {
        console.error('❌ 未找到提纯后的数据文件 perfect_cloud_snapshot.json！');
        process.exit(1);
    }

    const snapshotData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log('🏗️ 正在全量恢复所有云端数据...');

    try {
        // 内存中秒级去重 PlayerRegistry
        const uniqueRegistries = new Map();
        for (const reg of (snapshotData.registries || [])) {
            uniqueRegistries.set(`${reg.playerId}_${reg.teamId}_${reg.split}`, reg);
        }
        snapshotData.registries = Array.from(uniqueRegistries.values());

        const insertData = async (modelDelegate, dataArray) => {
            if (!dataArray || dataArray.length === 0) return;
            // SQLite safe batch creation via transaction
            await prisma.$transaction(
                dataArray.map(item => modelDelegate.create({ data: item }))
            );
        };

        await insertData(prisma.systemSettings, snapshotData.systemSettings);
        await insertData(prisma.userProfile, snapshotData.userProfiles);
        await insertData(prisma.hero, snapshotData.heroes);

        await insertData(prisma.team, snapshotData.teams);
        await insertData(prisma.player, snapshotData.players);
        await insertData(prisma.playerRegistry, snapshotData.registries);

        await insertData(prisma.match, snapshotData.matches);
        await insertData(prisma.game, snapshotData.games);
        await insertData(prisma.comment, snapshotData.comments);
        await insertData(prisma.teamComment, snapshotData.teamComments);
        await insertData(prisma.odds, snapshotData.odds);

        console.log('🎉 所有云端数据已成功恢复！');
    } catch (err) {
        console.error('❌ 全量恢复过程中发生严重错误：', err);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
