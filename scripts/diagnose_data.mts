import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runDataDiagnostics() {
    console.log("===========================================");
    console.log("  LOL Data System - Prisma脏数据智能诊断");
    console.log("===========================================\n");

    let healthy = true;

    try {
        // 1. 无归属或跨赛区的游离选手检测
        console.log("[1/3] 正在扫描游离或重名选手记录...");
        const allPlayers = await prisma.player.findMany({
            include: { team: true }
        });

        const nameMap = new Map<string, any[]>();
        let orphanedPlayers = 0;

        allPlayers.forEach(p => {
            if (!p.teamId) orphanedPlayers++;
            if (!nameMap.has(p.name)) nameMap.set(p.name, []);
            nameMap.get(p.name)?.push(p);
        });

        if (orphanedPlayers > 0) {
            console.warn(`  [WARN] 发现 ${orphanedPlayers} 名选手未关联任何战队。`);
            healthy = false;
        }

        let duplicateCount = 0;
        nameMap.forEach((records, name) => {
            if (records.length > 1) {
                console.warn(`  [WARN] 选手 [${name}] 在库中存在 ${records.length} 条记录，关联战队:`, records.map(r => r.team?.name || 'Unknown').join(', '));
                duplicateCount++;
                healthy = false;
            }
        });

        if (duplicateCount === 0 && orphanedPlayers === 0) {
            console.log("  [OK] 未发现明显的选手数据异常。");
        }

        // 2. 爬虫缺失检测：已打完却没录入比分的比赛
        console.log("\n[2/3] 正在扫描异常赛程数据...");
        // 逻辑：如果 Match 状态为 FINISHED，但没有关联的 Game 记录，或者 Game 记录中没有胜者
        const anomalousMatches = await prisma.match.findMany({
            where: {
                status: 'FINISHED',
            },
            include: {
                _count: {
                    select: { games: true }
                }
            }
        });

        const missingDetails = anomalousMatches.filter(m => (m as any)._count.games === 0 || !m.winnerId);

        if (missingDetails.length > 0) {
            console.warn(`  [WARN] 发现 ${missingDetails.length} 场状态为 FINISHED 但缺失小局数据或胜者信息的赛事:`, missingDetails.map(m => m.id).join(', '));
            healthy = false;
        } else {
            console.log("  [OK] 未检测到明显缺失的赛事结果。");
        }

        // 3. 战队一致性检测
        console.log("\n[3/3] 战队数据检测...");
        const allTeams = await prisma.team.findMany();
        const shortNameMap = new Map<string, any[]>();
        allTeams.forEach(t => {
            if (t.shortName) {
                if (!shortNameMap.has(t.shortName)) shortNameMap.set(t.shortName, []);
                shortNameMap.get(t.shortName)?.push(t);
            }
        });

        let teamConflicts = 0;
        shortNameMap.forEach((teams, sn) => {
            if (teams.length > 1) {
                console.warn(`  [WARN] 发现缩写 [${sn}] 被多个战队 ID 使用:`, teams.map(t => t.id).join(', '));
                teamConflicts++;
                healthy = false;
            }
        });

        if (teamConflicts === 0) {
            console.log("  [OK] 战队缩写唯一性校验通过。");
        }
        console.log(`  共扫描了 ${allPlayers.length} 名选手。`);

    } catch (err: any) {
        console.error("[FAIL] 诊断脚本自身执行异常，可能 Schema 不匹配:", err.message);
        healthy = false;
    } finally {
        await prisma.$disconnect();
        console.log("\n-------------------------------------------");
        if (healthy) {
            console.log("[✅ PASS] 数据库体检全部达标！");
        } else {
            console.log("[❌ FAIL] 发现潜在脏数据或冲突，请查阅上方警告并人工干预。");
            console.log("  NOTE: 诊断工具仅提供报告，禁止在未核实情况下执行自动覆盖操作。");
        }
    }
}

runDataDiagnostics();
