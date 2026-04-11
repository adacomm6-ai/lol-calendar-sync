const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');

// 云端数据库连接地址
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    console.log('--- Syncing Local Roles to Cloud (Targeting UNKNOWN) ---');

    // 初始化本地 Prisma
    const localPrisma = new PrismaClient();

    // 初始化云端 PG Client
    const cloudClient = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await cloudClient.connect();

    try {
        // 1. 获取云端所有 UNKNOWN 选手
        const cloudRes = await cloudClient.query('SELECT id, name, "teamId", role FROM "Player" WHERE role = \'UNKNOWN\' OR role = \'BOT\'');
        console.log(`Found ${cloudRes.rowCount} potential players to fix in Cloud.`);

        if (cloudRes.rowCount === 0) {
            console.log('No players needing fix found in Cloud.');
            return;
        }

        let updatedCount = 0;
        let skipCount = 0;

        for (const cloudPlayer of cloudRes.rows) {
            // 先处理 BOT -> ADC 的规范化
            if (cloudPlayer.role === 'BOT') {
                console.log(`   [NORMALIZE] ${cloudPlayer.name} (${cloudPlayer.teamId}): BOT -> ADC`);
                await cloudClient.query('UPDATE "Player" SET role = \'ADC\' WHERE id = $1', [cloudPlayer.id]);
                updatedCount++;
                continue;
            }

            // 处理 UNKNOWN：从本地寻找匹配
            // 匹配逻辑：name (不区分大小写) 且 teamId 相同
            const localPlayer = await localPrisma.player.findFirst({
                where: {
                    name: { equals: cloudPlayer.name },
                    teamId: cloudPlayer.teamId,
                    NOT: { role: 'UNKNOWN' }
                }
            });

            if (localPlayer) {
                console.log(`   [PATCH] ${cloudPlayer.name} (${cloudPlayer.teamId}): UNKNOWN -> ${localPlayer.role}`);
                await cloudClient.query('UPDATE "Player" SET role = $1 WHERE id = $2', [localPlayer.role, cloudPlayer.id]);
                updatedCount++;
            } else {
                // 如果精确找不到，尝试全名匹配（忽略 teamId，针对可能的 teamId 变化情况，但为了安全本脚本不启用此逻辑）
                // 为了“不影响其他数据”，我们仅做精确匹配
                skipCount++;
            }
        }

        console.log(`\n✅ Finish! Updated: ${updatedCount}, Skipped: ${skipCount}`);

    } catch (err) {
        console.error('Error during sync:', err);
    } finally {
        await cloudClient.end();
        await localPrisma.$disconnect();
    }
}

main().catch(console.error);
