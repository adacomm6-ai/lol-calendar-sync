const { Client } = require('pg');
require('dotenv').config();

async function forceDrop() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL,
        statement_timeout: 0,
        query_timeout: 0
    });

    try {
        await client.connect();
        console.log("🔥 成功以无超时模式直连 Supabase... 预备执行终极删除");

        // pg_terminate_backend will fail on Supabase Free Tier due to permission issues against superusers

        // Drop all affected tables using CASCADE
        await client.query(`DROP TABLE IF EXISTS "PlayerRegistry" CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS "Player" CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS "Team" CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS "Match" CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS "Game" CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS "Comment" CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS "TeamComment" CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS "Odds" CASCADE;`);

        console.log("✅ 阻碍云端更新的全部表约束已被强力摧毁!");
    } catch (err) {
        console.error("❌ 终极爆破执行失败:", err);
    } finally {
        await client.end();
    }
}

forceDrop();
