const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. 清理 NIP 冗余选手
    const nipId = '0d900a1a-c0fc-4965-83c6-cc9844700ca1';
    const redundantNames = ['KESHI', 'JUNHAO', 'HERU', 'RYAN3', 'FEATHER'];

    console.log(`--- Cleaning up NIP redundants (Team ID: ${nipId}) ---`);
    const deleted = await prisma.player.deleteMany({
        where: {
            teamId: nipId,
            name: { in: redundantNames }
        }
    });
    console.log(`Deleted ${deleted.count} redundant players from NIP.`);

    // 2. 修复数据库中的 'Unknown' 角色 (大小写修复已经在前端做了，但数据库最好也统一)
    // 注意：有些可能是 'Unknown'，有些是 'UNKNOWN'
    console.log('\n--- Fixing "Unknown" roles in DB ---');
    const playersWithUnknown = await prisma.player.findMany({
        where: {
            OR: [
                { role: { equals: 'Unknown' } },
                { role: { equals: 'unknown' } }
            ]
        }
    });

    console.log(`Found ${playersWithUnknown.length} players with "Unknown" role.`);

    // 我们不能直接修复，因为不知道真实位置。
    // 但是对于 LOUD 这种全队 Unknown 的，通常是因为同步时没抓到。
    // 在这里我们先把它们统称为 'UNKNOWN' (全大写)，方便前端 ROLE_LABELS 匹配（虽然前端已经加了 .toUpperCase()）

    const updated = await prisma.player.updateMany({
        where: {
            OR: [
                { role: { equals: 'Unknown' } },
                { role: { equals: 'unknown' } }
            ]
        },
        data: {
            role: 'UNKNOWN'
        }
    });
    console.log(`Updated ${updated.count} players to standard 'UNKNOWN' role.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
