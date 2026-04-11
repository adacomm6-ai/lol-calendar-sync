/**
 * 临时脚本：查询 Rookie 2月3日那场比赛存的英雄名字
 */
const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
});

async function main() {
    await client.connect();

    const res = await client.query(`
        SELECT g.id, m."startTime", m.tournament, g."teamAStats", g."teamBStats",
               ta."shortName" as team_a, tb."shortName" as team_b
        FROM "Game" g
        JOIN "Match" m ON g."matchId" = m.id
        LEFT JOIN "Team" ta ON m."teamAId" = ta.id
        LEFT JOIN "Team" tb ON m."teamBId" = tb.id
        WHERE m."startTime" >= '2026-02-02' AND m."startTime" < '2026-02-05'
    `);

    console.log(`==== Found ${res.rows.length} games ====`);
    res.rows.forEach(r => {
        let found = false;
        try {
            const teamAStats = r.teamAStats ? JSON.parse(r.teamAStats) : [];
            const teamBStats = r.teamBStats ? JSON.parse(r.teamBStats) : [];

            [...teamAStats, ...teamBStats].forEach(p => {
                if (p.playerName && p.playerName.toLowerCase().includes('rookie')) {
                    const time = new Date(r.startTime).toISOString().slice(0, 10);
                    console.log(`[${time}] ${r.team_a} vs ${r.team_b} -> ROOKIE Hero: "${p.hero}"`);
                    found = true;
                }
            });
        } catch (e) { }
    });

}

main()
    .catch(e => console.error(e))
    .finally(() => client.end());
