// 直连 Supabase PostgreSQL 启用 SystemSettings 表的 RLS
const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: 'postgresql://postgres.bbibilxlkjcrscyvzzgq:juchu123isdj@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres'
    });

    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL');

    // 启用 RLS
    await client.query('ALTER TABLE public."SystemSettings" ENABLE ROW LEVEL SECURITY;');
    console.log('✅ RLS enabled on public.SystemSettings');

    // 验证
    const res = await client.query(`
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'SystemSettings';
    `);
    console.log('Verification:', res.rows[0]);

    await client.end();
    console.log('Done!');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
