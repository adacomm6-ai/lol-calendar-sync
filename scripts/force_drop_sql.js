const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log("正在尝试通过原生 SQL 强制解除外键限制...");
    try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "PlayerRegistry" CASCADE;`);
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Player" CASCADE;`);
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Match" CASCADE;`);
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Game" CASCADE;`);
        console.log("✅ 核心表手动 Drop 成功！");
    } catch (e) {
        console.error("❌ SQL Drop 失败:", e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
