const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
    const backupDir = path.join(process.cwd(), 'backup');
    const inFile = path.join(backupDir, 'cloud_legacy_snapshot.json');
    const outFile = path.join(backupDir, 'perfect_cloud_snapshot.json');

    if (!fs.existsSync(inFile)) {
        console.error("找不到前置快照文件:", inFile);
        return;
    }

    const data = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
    console.log(`📥 载入旧版云端快照，包含老式选手记录: ${data.players.length} 条`);

    // 魔法：聚合重塑新 Player 架构与 Registry 中间层
    const newPlayersMap = new Map(); // key = lowercase name -> new Player obj
    const newRegistries = []; // flat array of new PlayerRegistry objects

    for (const oldP of data.players) {
        const lowerName = oldP.name.trim().toLowerCase();

        // 1. 尝试找到或创建一个统一真身 (Player Entity)
        let primaryPlayer = newPlayersMap.get(lowerName);
        if (!primaryPlayer) {
            primaryPlayer = {
                id: oldP.id, // 保留第一个遇到的人的原始 ID
                name: oldP.name.trim(),
                photo: oldP.photo,
                createdAt: oldP.createdAt,
                updatedAt: oldP.updatedAt
            };
            newPlayersMap.set(lowerName, primaryPlayer);
        } else {
            // 如果遇到同名的且原来这位没有照片，新的有，则继承照片
            if (!primaryPlayer.photo && oldP.photo) {
                primaryPlayer.photo = oldP.photo;
            }
        }

        // 2. 剥除所有强绑定记录，转化为 Registry 履历层挂载
        const regId = crypto.randomUUID();
        // 处理特殊默认无脑 LPL 的安全拦截
        // If team region doesn't match and split is exactly 'Split 1' or '2026 LPL第一赛段', we can try to guess later, but here we just keep them all except known bad hardcodes...

        // Find team
        const team = data.teams.find(t => t.id === oldP.teamId);
        let validSplit = oldP.split;
        // Basic correction (like we did in local db via scripts)
        if (team) {
            const tr = (team.region || '').toUpperCase();
            if (validSplit === '2026 LPL第一赛段' && tr.includes('LCK')) {
                validSplit = '2026 LCK第一赛段';
            }
        }

        newRegistries.push({
            id: regId,
            playerId: primaryPlayer.id, // 紧紧绑在这个唯一的真身身上
            teamId: oldP.teamId,
            role: oldP.role || 'UNKNOWN',
            split: validSplit || 'UNKNOWN',
            isCurrent: true,
            createdAt: oldP.createdAt,
            updatedAt: oldP.updatedAt
        });
    }

    // 更新回原始数据集包以便后续 upload
    data.players = Array.from(newPlayersMap.values());
    data.registries = newRegistries;

    fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`✅ 升维重铸成功！`);
    console.log(`去重后真正独立选手: ${data.players.length} 名`);
    console.log(`转化出的履历记录: ${data.registries.length} 条`);
    console.log(`并成功落位至 => ${outFile}`);
}

main().catch(console.error);
