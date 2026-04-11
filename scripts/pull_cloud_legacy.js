const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('☁️ 开始从云端提取包含旧版表结构的生产数据快照...');
  const snapshotData = {};

  try {
    snapshotData.systemSettings = await prisma.systemSettings.findMany();
    snapshotData.userProfiles = await prisma.userProfile.findMany();
    snapshotData.heroes = await prisma.hero.findMany();
    snapshotData.teams = await prisma.team.findMany();
    snapshotData.players = await prisma.player.findMany(); // This leverages the LEGACY schema
    snapshotData.matches = await prisma.match.findMany();
    snapshotData.games = await prisma.game.findMany();
    snapshotData.comments = await prisma.comment.findMany();
    snapshotData.teamComments = await prisma.teamComment.findMany();
    snapshotData.odds = await prisma.odds.findMany();

    const backupDir = path.join(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const filePath = path.join(backupDir, 'cloud_legacy_snapshot.json');
    fs.writeFileSync(filePath, JSON.stringify(snapshotData, null, 2), 'utf-8');

    console.log(`✅ 旧版生产数据快照成功提取至: ${filePath}`);
    console.log(`总计提取: 战队 ${snapshotData.teams.length} 支，旧结构选手 ${snapshotData.players.length} 条，对局 ${snapshotData.matches.length} 场。`);
  } catch(e) {
    console.error("❌ 提取失败，旧版数据库检查异常:", e);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
