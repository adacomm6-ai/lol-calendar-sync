const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    const rawMatches = await p.$queryRaw`SELECT id, startTime FROM Match LIMIT 5`;
    console.log(rawMatches);
}
main().catch(console.error).finally(() => p.$disconnect());
