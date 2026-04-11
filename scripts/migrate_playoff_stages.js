/**
 * 数据迁移脚本：将 LPL/LCK 季后赛的 stage 字段
 * 从笼统的 "季后赛" 更新为树状图拓扑对应的标准化阶段名称
 * 
 * LPL: 8队双败淘汰 = 14 场（标准结构）
 * LCK: 6队双败淘汰 = 10 场（从参考图推断的实际结构）
 */
const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
});

// LPL: 标准 8 队双败淘汰 14 场时间线拓扑映射
const LPL_STAGE_TIMELINE = [
    '季后赛 - Upper Bracket R1 M1',       // #1 JDG vs TES
    '季后赛 - Upper Bracket R1 M2',       // #2 AL vs WE
    '季后赛 - Upper Bracket R1 M3',       // #3 WBG vs IG
    '季后赛 - Upper Bracket R1 M4',       // #4 BLG vs NIP
    '季后赛 - Lower Bracket R1 M1',       // #5 败者首轮 M1
    '季后赛 - Lower Bracket R1 M2',       // #6 败者首轮 M2
    '季后赛 - Upper Bracket Semifinal 1', // #7 胜者半决赛 1
    '季后赛 - Upper Bracket Semifinal 2', // #8 胜者半决赛 2
    '季后赛 - Lower Bracket R2 M1',       // #9 败者第二轮 M1
    '季后赛 - Lower Bracket R2 M2',       // #10 败者第二轮 M2
    '季后赛 - Lower Bracket Semifinal',   // #11 败者半决赛
    '季后赛 - Upper Bracket Final',       // #12 胜者决赛
    '季后赛 - Lower Bracket Final',       // #13 败者决赛
    '季后赛 - Grand Final',               // #14 总决赛
];

// LCK: 6 队双败淘汰 10 场结构
// 按时间排序映射到标准拓扑键位（14 个位中使用 10 个，留空 4 个）
const LCK_STAGE_TIMELINE = [
    '季后赛 - Upper Bracket R1 M1',       // #1 BFX vs DNS
    '季后赛 - Upper Bracket R1 M2',       // #2 DK vs DRX
    '季后赛 - Upper Bracket Semifinal 1', // #3 GEN vs DK（1种选择）
    '季后赛 - Upper Bracket Semifinal 2', // #4 T1 vs BFX
    '季后赛 - Lower Bracket R1 M1',       // #5 DNS vs DRX（败者对决）
    '季后赛 - Lower Bracket R2 M1',       // #6 DK vs DNS（败者第二轮，UB SF 败者 vs LB R1 胜者）
    '季后赛 - Upper Bracket Final',       // #7 GEN vs BFX（胜者决赛）
    '季后赛 - Lower Bracket Semifinal',   // #8 T1 vs DK（败者半决赛）
    '季后赛 - Lower Bracket Final',       // #9 BFX vs DK（败者决赛）
    '季后赛 - Grand Final',               // #10 GEN vs TBD（总决赛）
];

async function main() {
    await client.connect();
    console.log('✅ 已连接云端数据库\n');

    // === 处理 LPL ===
    const lplRes = await client.query(`
        SELECT id, stage, "startTime",
               (SELECT name FROM "Team" WHERE id = m."teamAId") as team_a,
               (SELECT "shortName" FROM "Team" WHERE id = m."teamAId") as team_a_short,
               (SELECT name FROM "Team" WHERE id = m."teamBId") as team_b,
               (SELECT "shortName" FROM "Team" WHERE id = m."teamBId") as team_b_short
        FROM "Match" m
        WHERE tournament = '2026 LPL第一赛段' AND stage = '季后赛'
        ORDER BY "startTime" ASC
    `);

    console.log(`=== LPL 季后赛: ${lplRes.rows.length} 场 ===`);
    if (lplRes.rows.length !== 14) {
        console.log(`⚠️  警告: 预期 14 场但找到 ${lplRes.rows.length} 场！`);
    }

    for (let i = 0; i < lplRes.rows.length && i < LPL_STAGE_TIMELINE.length; i++) {
        const m = lplRes.rows[i];
        const newStage = LPL_STAGE_TIMELINE[i];
        const teamA = m.team_a_short || m.team_a || 'TBD';
        const teamB = m.team_b_short || m.team_b || 'TBD';
        const time = new Date(m.startTime).toISOString().slice(0, 16);

        await client.query(`UPDATE "Match" SET stage = $1 WHERE id = $2`, [newStage, m.id]);
        console.log(`  ✅ [${i + 1}] ${time} ${teamA} vs ${teamB} → "${newStage}"`);
    }

    // === 处理 LCK ===
    const lckRes = await client.query(`
        SELECT id, stage, status, "startTime",
               (SELECT name FROM "Team" WHERE id = m."teamAId") as team_a,
               (SELECT "shortName" FROM "Team" WHERE id = m."teamAId") as team_a_short,
               (SELECT name FROM "Team" WHERE id = m."teamBId") as team_b,
               (SELECT "shortName" FROM "Team" WHERE id = m."teamBId") as team_b_short
        FROM "Match" m
        WHERE tournament = '2026 LCK第一赛段' AND stage = '季后赛'
        ORDER BY "startTime" ASC
    `);

    console.log(`\n=== LCK 季后赛: ${lckRes.rows.length} 场 ===`);
    if (lckRes.rows.length !== 10) {
        console.log(`⚠️  警告: 预期 10 场但找到 ${lckRes.rows.length} 场！`);
    }

    for (let i = 0; i < lckRes.rows.length && i < LCK_STAGE_TIMELINE.length; i++) {
        const m = lckRes.rows[i];
        const newStage = LCK_STAGE_TIMELINE[i];
        const teamA = m.team_a_short || m.team_a || 'TBD';
        const teamB = m.team_b_short || m.team_b || 'TBD';
        const time = new Date(m.startTime).toISOString().slice(0, 16);

        await client.query(`UPDATE "Match" SET stage = $1 WHERE id = $2`, [newStage, m.id]);
        console.log(`  ✅ [${i + 1}] ${time} ${teamA} vs ${teamB} (${m.status}) → "${newStage}"`);
    }

    console.log('\n🎉 所有 stage 字段已更新完毕！');
}

main()
    .catch(e => console.error('❌ 错误:', e))
    .finally(() => client.end());
