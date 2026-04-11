const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
    const m = await p.match.findFirst({
        where: { teamA: { name: 'BNK FEARX' } }
    });
    console.log(m.startTime, m.startTime?.toISOString());
}
main().finally(() => p.$disconnect());
