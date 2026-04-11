const { Client } = require('pg');

// 云端数据库连接地址
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    console.log('==========================================');
    console.log('  云端数据专项修复 (Remote Cloud Fix via PG)');
    console.log('==========================================\n');

    const client = new Client({
        connectionString: CLOUD_DB_URL,
        ssl: false
    });

    try {
        console.log('[1/4] 正在连接云端数据库...');
        await client.connect();
        console.log('✅ 连接成功\n');

        // 1. 清理 NIP 冗余选手
        const nipId = '0d900a1a-c0fc-4965-83c6-cc9844700ca1';
        const redundantNames = ['KESHI', 'JUNHAO', 'HERU', 'RYAN3', 'FEATHER'];

        console.log(`[2/4] 清理 NIP 冗余选手 (战队 ID: ${nipId})...`);
        const delRes = await client.query(
            'DELETE FROM "Player" WHERE "teamId" = $1 AND "name" = ANY($2)',
            [nipId, redundantNames]
        );
        console.log(`✅ 已从云端移除 ${delRes.rowCount} 名冗余选手 (NIP)。`);

        // 2. 批量角色标准化
        console.log('\n[3/4] 正在执行全库 Role 标准化 (TitleCase/lowercase -> UPPERCASE)...');

        const roleMapping = {
            'Top': 'TOP', 'top': 'TOP',
            'Jungle': 'JUNGLE', 'jungle': 'JUNGLE',
            'Mid': 'MID', 'mid': 'MID',
            'Bot': 'ADC', 'ADC': 'ADC', 'adc': 'ADC', 'Adc': 'ADC',
            'Support': 'SUPPORT', 'support': 'SUPPORT',
            'Coach': 'COACH', 'coach': 'COACH',
            'Unknown': 'UNKNOWN', 'unknown': 'UNKNOWN'
        };

        let totalUpdated = 0;
        for (const [oldVal, newVal] of Object.entries(roleMapping)) {
            const upRes = await client.query(
                'UPDATE "Player" SET "role" = $1 WHERE "role" = $2',
                [newVal, oldVal]
            );
            if (upRes.rowCount > 0) {
                console.log(`   - 已将 '${oldVal}' 修正为 '${newVal}': ${upRes.rowCount} 条记录`);
                totalUpdated += upRes.rowCount;
            }
        }
        console.log(`✅ 云端角色标准化完成，共修正 ${totalUpdated} 条记录。`);

        // 3. 结果核查
        console.log('\n[4/4] 最终数据核对...');
        const nipCountRes = await client.query('SELECT COUNT(*) FROM "Player" WHERE "teamId" = $1', [nipId]);
        const loudCountRes = await client.query('SELECT COUNT(*) FROM "Player" WHERE "teamId" = \'LOUD\'');

        console.log(`📊 LOUD 选手总数: ${loudCountRes.rows[0].count}`);
        console.log(`📊 NIP 最终选手总数: ${nipCountRes.rows[0].count} (预期: 5)`);

        console.log('\n✨ 云端修复任务全部完成！');

    } catch (e) {
        console.error('\n❌ 修复过程中出现错误:', e.message);
        throw e;
    } finally {
        await client.end();
    }
}

main().catch(() => process.exit(1));
