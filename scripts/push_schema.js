const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 从 .env 读取配置
const envPath = path.join(__dirname, '..', '.env');
let dbUrl = '';
let directUrl = '';

console.log("--- Supabase Schema Sync Optimizer ---");

if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
        // Find URLs even if commented
        const dbMatch = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*["']?(.*?)["']?\s*$/i);
        const directMatch = line.match(/^\s*#?\s*DIRECT_URL\s*=\s*["']?(.*?)["']?\s*$/i);

        if (dbMatch && dbMatch[1].toLowerCase().includes('supabase')) {
            dbUrl = dbMatch[1].trim();
        }
        if (directMatch && directMatch[1].toLowerCase().includes('supabase')) {
            directUrl = directMatch[1].trim();
        }
    }
}

if (!dbUrl && !directUrl) {
    console.error('❌ Failed to find valid DATABASE_URL/DIRECT_URL in .env');
    process.exit(1);
}

// Optimization: Ensure SSL and Timeout
function optimizeUrl(url) {
    if (!url) return url;
    let optimized = url;
    if (!optimized.includes('sslmode=')) {
        optimized += optimized.includes('?') ? '&sslmode=require' : '?sslmode=require';
    }
    if (!optimized.includes('connect_timeout=')) {
        optimized += '&connect_timeout=30';
    }
    return optimized;
}

const targetUrl = optimizeUrl(directUrl || dbUrl);
const maskedUrl = targetUrl.replace(/:([^:@]+)@/, ':****@');

console.log(`🔗 Target Connection: ${maskedUrl}`);

try {
    const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
    let content = fs.readFileSync(schemaPath, 'utf8');

    // Backup and Switch
    const originalContent = content;
    content = content.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
    fs.writeFileSync(schemaPath, content);

    console.log("✅ Schema switched to PostgreSQL");

    const env = {
        ...process.env,
        DATABASE_URL: targetUrl,
        DIRECT_URL: targetUrl
    };

    console.log("🚀 Executing prisma db push...");
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
        stdio: 'inherit',
        env: env
    });

    console.log("✅ DB push complete");

    // Revert
    fs.writeFileSync(schemaPath, originalContent);
    console.log("✅ Schema reverted to SQLite");

} catch (e) {
    console.error("\n❌ DB push failed");
    console.error("Diagnostic Info:", e.message);

    // Emergency attempt: check if it's an IPv6 issue by suggesting user check network
    if (e.message.includes('P1001')) {
        console.log("\n💡 TIP: P1001 often means the database is unreachable.");
        console.log("1. Check if Supabase project is active.");
        console.log("2. If using IPv4 only network, try URI encoding your password.");
        console.log("3. Try changing host to IPv4 equivalent if available.");
    }

    // Ensure we revert even on failure
    try {
        const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
        let content = fs.readFileSync(schemaPath, 'utf8');
        if (content.includes('provider = "postgresql"')) {
            content = content.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
            fs.writeFileSync(schemaPath, content);
            console.log("✅ Schema reverted to SQLite (after failure)");
        }
    } catch (e2) { }

    process.exit(1);
}
