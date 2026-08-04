-- ============================================================
-- 006_recordatorios.sql — columna recordado_at + cron de recordatorios
-- ============================================================

-- Columna para evitar recordatorios duplicados por cita
alter table public.citas
  add column if not exists recordado_at timestamptz;

-- Índice para la consulta del cron (estado + rango + sin recordar)
create index if not exists citas_recordatorio_idx
  on public.citas (rango_tiempo)
  where estado = 'confirmada' and recordado_at is null;

-- Habilitar pg_cron (idempotente)
create extension if not exists pg_cron with schema extensions;
grant usage on schema cron to postgres;

-- Eliminar el job si ya existe y recrearlo
select cron.unschedule(jobid)
from cron.job
where jobname = 'recordatorios-citas';

-- Ejecutar cada hora. El service_role_key se lee desde la Vault (patrón que
-- sí funciona en Supabase hosted).
select cron.schedule(
  'recordatorios-citas',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://dkqfwocdittldjxujjku.supabase.co/functions/v1/recordatorios-citas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);