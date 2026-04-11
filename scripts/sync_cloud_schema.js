const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("==========================================");
console.log("       云端数据库表结构同步向导           ");
console.log("==========================================\n");
console.log("只需一步即可修复云端 SystemSettings 缺失问题！\n");
console.log("请前往 Supabase -> Project Settings -> Database -> Connection String的设置处");
console.log("取消勾选「Use connection pooling」，复制下方端口为 5432 的完整 URI 字符串\n");

rl.question("👉 粘贴完整 DIRECT_URL (如 postgresql://postgres...:5432/postgres): ", (directUrl) => {
    directUrl = directUrl.trim();
    if (!directUrl.startsWith('postgres')) {
        console.error("❌ 格式不正确！请确保复制的是以 postgres:// 或 postgresql:// 开头的字符串。");
        rl.close();
        return;
    }

    // 如果用户粘贴的带中括号密码提示，要求替换
    if (directUrl.includes('[YOUR-PASSWORD]')) {
        console.error("❌ 密码未替换！请将链接中的 [YOUR-PASSWORD] 替换为您真正的数据库密码后再粘贴。");
        rl.close();
        return;
    }

    console.log("\n正在准备同步环境...");

    try {
        const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
        let content = fs.readFileSync(schemaPath, 'utf8');
        content = content.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
        fs.writeFileSync(schemaPath, content);

        console.log("✅ Schema 已临时切换为 PostgreSQL");

        const env = {
            ...process.env,
            DATABASE_URL: directUrl, // Use direct URL for both to ensure push works
            DIRECT_URL: directUrl
        };

        console.log("\n🚀 开始向云端推送表结构 (prisma db push)...");
        console.log("正在连接并同步，请耐心等待...\n");

        execSync('npx prisma db push --skip-generate --accept-data-loss', {
            stdio: 'inherit',
            env: env
        });

        console.log("\n🎉 云端同步完成！您的问题已解决！请刷新云端后台重试。");

    } catch (e) {
        console.error("\n❌ 同步失败。请检查您的密码或 URL 是否正确。");
        console.error(e.message);
    } finally {
        try {
            const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
            let content = fs.readFileSync(schemaPath, 'utf8');
            content = content.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
            fs.writeFileSync(schemaPath, content);
            console.log("\n✅ 已安全恢复为本地 SQLite 模式");
        } catch (e2) {
            console.error("恢复本地模式失败", e2);
        }
        rl.close();
    }
});
