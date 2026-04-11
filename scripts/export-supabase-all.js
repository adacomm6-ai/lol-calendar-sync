require('dotenv').config();
/**
 * 导出 Supabase (PostgreSQL) 的所有表数据到本�?JSON 文件
 * 
 * 只执�?SELECT 操作，确保数据安全�?
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// �?scripts/pull-from-cloud.js 获取的数据库连接字符�?
const CLOUD_DB_URL = (process.env.CLOUD_DATABASE_URL || process.env.CLOUD_DIRECT_URL || process.env.DIRECT_URL || '').replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');

async function exportAllData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(__dirname, '..', 'backups', `supabase_export_${timestamp}`);

    console.log('==========================================');
    console.log('  Supabase 全量数据导出工具');
    console.log('==========================================');
    console.log();

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const pgClient = new Client({
        connectionString: CLOUD_DB_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        console.log('[1/3] 连接云端数据�?..');
        await pgClient.connect();
        console.log('�?连接成功\n');

        // 2. 获取 public 模式下的所有表�?
        console.log('[2/3] 正在获取表列�?..');
        const tablesResult = await pgClient.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE';
        `);

        const tables = tablesResult.rows.map(r => r.table_name);
        console.log(`📂 发现 ${tables.length} 张表: ${tables.join(', ')}\n`);

        // 3. 逐表导出
        console.log('[3/3] 开始逐表导出数据...\n');
        for (const table of tables) {
            process.stdout.write(`📦 导出 ${table.padEnd(20)}... `);

            try {
                const result = await pgClient.query(`SELECT * FROM "${table}"`);
                const data = result.rows;
                const filePath = path.join(backupDir, `${table}.json`);

                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`�?${data.length} 条记�?-> ${table}.json`);
            } catch (err) {
                console.log(`�?失败: ${err.message}`);
            }
        }

        console.log('\n==========================================');
        console.log(`🎉 导出完成！`);
        console.log(`📁 存储位置: ${backupDir}`);
        console.log('==========================================');

    } catch (e) {
        console.error('\n💥 致命错误:', e.message);
    } finally {
        await pgClient.end();
    }
}

exportAllData();



