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
console.log("检测到目前的数据库连接因为区域不匹配认证失败。");
console.log("请前往 Supabase -> Project Settings -> Database -> Connection String");
console.log("选择 URI，取消勾选「Use connection pooling」，复制下方端口为 5432 的完整字符串。\n");
console.log("注意：请不要忘记把里面的 [YOUR-PASSWORD] 替换为您真正的密码后再粘贴。\n");

rl.question("👉 粘贴完整 DIRECT_URL (如 postgresql://postgres...:5432/postgres): ", (directUrl) => {
    directUrl = directUrl.trim();
    if (!directUrl.startsWith('postgres')) {
        console.error("❌ 格式不正确！请确保复制的是以 postgres:// 或 postgresql:// 开头的字符串。");
        rl.close();
        return;
    }

    if (directUrl.includes('[YOUR-PASSWORD]')) {
        console.error("❌ 密码未替换！请将链接中的 [YOUR-PASSWORD] 替换为您真正的数据库密码后再粘贴。");
        rl.close();
        return;
    }

    // Save to .env
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Convert to pooler URL for DATABASE_URL by replacing 5432 with 6543
    const dbUrl = directUrl.replace(':5432/', ':6543/') + '?pgbouncer=true&connection_limit=1';

    // Remove old superseding lines if they exist at top
    envContent = envContent.replace(/^# 云端 PostgreSQL（.*[\s\S]*?(?=# 本地开发用 SQLite)/m, '');

    // Prepend new lines
    const prepend = `# 云端 PostgreSQL（部署时自动从这里读取）\nDATABASE_URL="${dbUrl}"\nDIRECT_URL="${directUrl}"\n\n`;
    fs.writeFileSync(envPath, prepend + envContent);

    console.log("✅ 成功保存真实连接配置至 .env\n");
    console.log("正在尝试推送同步...");

    try {
        const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
        let content = fs.readFileSync(schemaPath, 'utf8');
        content = content.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
        fs.writeFileSync(schemaPath, content);

        const env = {
            ...process.env,
            DATABASE_URL: directUrl,
            DIRECT_URL: directUrl
        };

        execSync('npx prisma db push --skip-generate --accept-data-loss', {
            stdio: 'inherit',
            env: env
        });

        console.log("\n🎉 云端同步完成！配置已保存，以后 force_deploy.bat 会自动进行此同步。");

    } catch (e) {
        console.error("\n❌ 同步失败。请检查您的密码或 URL 是否正确。");
    } finally {
        try {
            const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
            let content = fs.readFileSync(schemaPath, 'utf8');
            content = content.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
            fs.writeFileSync(schemaPath, content);
        } catch (e2) { }
        rl.close();
    }
});
