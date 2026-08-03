-- ============================================================
-- 003_cron_resumen.sql — programar resumen matutino (07:00)
-- ============================================================

-- Habilitar pg_cron si aún no está (Supabase lo incluye en la lista autorizada)
create extension if not exists pg_cron with schema extensions;

-- Periodo de seguridad de pg_cron (requerido en Supabase)
grant usage on schema cron to postgres;

-- Eliminar el job si ya existe (idempotente) y recrearlo
select cron.unschedule(jobid)
from cron.job
where jobname = 'resumen-matutino';

-- Ejecutar resumen-matutino a las 07:00 hora del servidor (UTC). Nota: prefiero
-- hora Bogotá (UTC-5) => 12:00 UTC para las 07:00 locales.
select cron.schedule(
  'resumen-matutino',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://dkqfwocdittldjxujjku.supabase.co/functions/v1/resumen-matutino',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('secrets.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);