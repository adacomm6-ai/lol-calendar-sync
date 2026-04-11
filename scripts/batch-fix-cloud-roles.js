const { Client } = require('pg');

// 云端数据库连接地址
const CLOUD_DB_URL = 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function main() {
    console.log('--- Deep Fixing Roster Roles via Game History ---');
    const client = new Client({ connectionString: CLOUD_DB_URL, ssl: false });
    await client.connect();

    // 1. 获取所有当前 Role 为 'UNKNOWN' 的选手
    const unknownPlayers = await client.query('SELECT id, name, "teamId" FROM "Player" WHERE role = \'UNKNOWN\'');
    console.log(`Found ${unknownPlayers.rowCount} players with UNKNOWN role.`);

    if (unknownPlayers.rowCount === 0) {
        console.log('No unknown players found. Task complete.');
        await client.end();
        return;
    }

    // 2. 尝试从近期历史记录中寻找选手的真实 Role
    // 我们将更新那些能在同步来的 game 数据中找到对应 role 的选手
    // 注意：这里的 logic 是从 ScoreboardPlayers (如果同步到了 Game 相关的业务逻辑)
    // 但我们的 Player 模型本身就有 role。

    // 如果是因为同步没抓到，我们手动为 LOUD 和 RED Canids 修正（根据用户截图显示的选手名）
    // LOUD 名单：Xyno (TOP), YoungJae (JUNGLE), Envy (MID), Bull (ADC), RedBert (SUPPORT)
    // RED Canids 名单：fNb (TOP), Curse (JUNGLE), Kaze (MID), Rebelo (ADC), frosty (SUPPORT)

    const manualFixes = [
        // LOUD
        { name: 'Xyno', role: 'TOP', team: 'LOUD' },
        { name: 'YoungJae', role: 'JUNGLE', team: 'LOUD' },
        { name: 'Envy', role: 'MID', team: 'LOUD' },
        { name: 'Bull', role: 'ADC', team: 'LOUD' },
        { name: 'RedBert', role: 'SUPPORT', team: 'LOUD' },

        // RED Canids
        { name: 'fNb', role: 'TOP', team: 'RED Canids' },
        { name: 'Curse', role: 'JUNGLE', team: 'RED Canids' },
        { name: 'Kaze', role: 'MID', team: 'RED Canids' },
        { name: 'Rebelo', role: 'ADC', team: 'RED Canids' },
        { name: 'frosty', role: 'SUPPORT', team: 'RED Canids' },

        // SHG (截图显示已正确，但确保一下)
        { name: 'Evi', role: 'TOP', team: 'SHG' },
        { name: 'Van1', role: 'JUNGLE', team: 'SHG' },
        { name: 'Aria', role: 'MID', team: 'SHG' },
        { name: 'Marble', role: 'ADC', team: 'SHG' },
        { name: 'Vsta', role: 'SUPPORT', team: 'SHG' }
    ];

    console.log(`\nExecuting Manual Role Patch for ${manualFixes.length} key positions...`);

    let patched = 0;
    for (const fix of manualFixes) {
        const res = await client.query(
            'UPDATE "Player" SET "role" = $1 WHERE "name" = $2 AND ("teamId" = $3 OR "teamId" ILIKE $4)',
            [fix.role, fix.name, fix.team, `%${fix.team}%`]
        );
        if (res.rowCount > 0) {
            console.log(`   [SUCCESS] Patched ${fix.name} to ${fix.role}`);
            patched += res.rowCount;
        }
    }

    console.log(`\n✅ Patched ${patched} specific players.`);

    // 3. 结果核查
    console.log('\nVerifying LOUD roster again:');
    const verifyLoud = await client.query('SELECT name, role FROM "Player" WHERE "teamId" = \'LOUD\'');
    console.table(verifyLoud.rows);

    await client.end();
}

main().catch(console.error);
