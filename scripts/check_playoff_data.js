/**
 * 临时脚本：用原生 pg 查询云端数据库中所有含有季后赛相关关键词的赛程记录
 */
const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
});

async function main() {
    await client.connect();

    const res = await client.query(`
        SELECT m.id, m.tournament, m.stage, m.status, m."startTime", m.format,
               ta.name as team_a_name, ta."shortName" as team_a_short,
               tb.name as team_b_name, tb."shortName" as team_b_short
        FROM "Match" m
        LEFT JOIN "Team" ta ON m."teamAId" = ta.id
        LEFT JOIN "Team" tb ON m."teamBId" = tb.id
        WHERE m.tournament ILIKE '%Playoff%'
           OR m.tournament ILIKE '%季后赛%'
           OR m.stage ILIKE '%Playoff%'
           OR m.stage ILIKE '%季后赛%'
           OR m.stage ILIKE '%Bracket%'
           OR m.stage ILIKE '%Grand Final%'
           OR m.stage ILIKE '%Semifinal%'
           OR m.stage ILIKE '%Lower%'
           OR m.stage ILIKE '%Upper%'
        ORDER BY m."startTime" ASC
    `);

    console.log(`\n==== 找到 ${res.rows.length} 场含季后赛关键词的赛程 ====\n`);

    res.rows.forEach((m, i) => {
        const teamA = m.team_a_short || m.team_a_name || 'TBD';
        const teamB = m.team_b_short || m.team_b_name || 'TBD';
        const time = m.startTime ? new Date(m.startTime).toISOString().slice(0, 16) : 'N/A';
        console.log(`[${String(i + 1).padStart(2)}] ${time}  ${teamA.padEnd(5)} vs ${teamB.padEnd(5)}  | tournament="${m.tournament}" | stage="${m.stage}" | status=${m.status} | id=${m.id.slice(0, 8)}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(() => client.end());
