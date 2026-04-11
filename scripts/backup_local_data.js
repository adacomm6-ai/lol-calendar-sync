const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    console.log('📦 开始提取本地全量所有表的数据快照...');
    const snapshotData = {};

    snapshotData.systemSettings = await prisma.systemSettings.findMany();
    snapshotData.userProfiles = await prisma.userProfile.findMany();
    snapshotData.heroes = await prisma.hero.findMany();
    snapshotData.teams = await prisma.team.findMany();
    snapshotData.players = await prisma.player.findMany();
    snapshotData.registries = await prisma.playerRegistry.findMany();
    snapshotData.matches = await prisma.match.findMany();
    snapshotData.games = await prisma.game.findMany();
    snapshotData.comments = await prisma.comment.findMany();
    snapshotData.teamComments = await prisma.teamComment.findMany();
    snapshotData.odds = await prisma.odds.findMany();

    const backupDir = path.join(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const filePath = path.join(backupDir, 'perfect_data_snapshot.json');
    fs.writeFileSync(filePath, JSON.stringify(snapshotData, null, 2), 'utf-8');

    console.log(`✅ 数据快照成功导出至: ${filePath}`);
    console.log(`数据结构包含: ${Object.keys(snapshotData).join(', ')}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
