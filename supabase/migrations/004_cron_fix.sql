-- ============================================================
-- 004_cron_fix.sql — usar secret de la Vault en el job de pg_cron
-- (el patrón current_setting('secrets.*') no funciona en Supabase hosted)
-- ============================================================

-- Recrear el job leyendo el service_role_key desde la Vault en runtime.
select cron.unschedule(jobid)
from cron.job
where jobname = 'resumen-matutino';

select cron.schedule(
  'resumen-matutino',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://dkqfwocdittldjxujjku.supabase.co/functions/v1/resumen-matutino',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);