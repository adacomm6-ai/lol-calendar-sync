const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const mode = process.argv[2]; // 'sqlite' or 'postgresql'

if (!['sqlite', 'postgresql'].includes(mode)) {
    console.error("Usage: node switch_db_provider.js <sqlite|postgresql>");
    process.exit(1);
}

try {
    let content = fs.readFileSync(schemaPath, 'utf8');

    // NOTE: 仅切换 provider，保留 env("DATABASE_URL")，数据库连接串由云端环境变量提供
    if (mode === 'postgresql') {
        content = content.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
        console.log("✅ Switched schema.prisma to POSTGRESQL (env var)");
    } else {
        content = content.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
        console.log("✅ Switched schema.prisma to SQLITE (Local)");
    }

    fs.writeFileSync(schemaPath, content);

} catch (e) {
    console.error("Error switching DB provider:", e);
    process.exit(1);
}
