-- ============================================================
-- 005_pg_net.sql — habilitar pg_net para que pg_cron pueda llamar Edge Functions
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- Usar net como alias si no existe (pg_net expone net.http_post)
grant usage on schema net to postgres, anon, authenticated;