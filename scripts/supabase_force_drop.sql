-- 终极清除云端Player与关联表的SQL脚本
-- 请将以下内容复制并粘贴到 Supabase 的 SQL Editor 中运行

-- 1. 强力切断当前数据库中除了您自己以外的活跃连接（Vercel产生的死锁）
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = current_database() AND pid <> pg_backend_pid();

-- 2. 强力摧毁旧的 Player 表（CASCADE 会自动切断它与 Team 等表的外键关联，而不删除 Team）
DROP TABLE IF EXISTS "Player" CASCADE;
