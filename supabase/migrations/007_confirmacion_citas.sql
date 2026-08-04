-- ============================================================
-- 007_confirmacion_citas.sql — estado 'pendiente' + confirmación
-- de citas creadas por el profesional con caducidad.
-- ============================================================

-- 1) Permitir el estado 'pendiente'
alter table public.citas drop constraint if exists citas_estado_check;
alter table public.citas
  add constraint citas_estado_check
  check (estado in ('confirmada', 'pendiente', 'cancelada', 'completada', 'no_show'));

-- 2) Las citas pendientes también deben bloquear el horario
--    (quitar el EXCLUDE actual y recrearlo con 'pendiente' incluido)
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.citas'::regclass AND contype = 'x'
  LOOP
    EXECUTE format('ALTER TABLE public.citas DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

alter table public.citas
  add constraint citas_no_doble_reserva
  exclude using gist (
    profesional_id with =,
    rango_tiempo with &&
  )
  where (estado = any (array['confirmada', 'pendiente']));

-- 3) Columnas para el flujo de confirmación del cliente
alter table public.citas add column if not exists confirmacion_pendiente boolean not null default false;
alter table public.citas add column if not exists confirmacion_expira_at timestamptz;
alter table public.citas add column if not exists confirmado_at timestamptz;

create index if not exists citas_confirmacion_idx
  on public.citas (confirmacion_pendiente, confirmacion_expira_at)
  where confirmacion_pendiente = true;

-- 4) Cron: vence confirmaciones expiradas (libera el horario)
select cron.unschedule(jobid)
from cron.job
where jobname = 'vencer-confirmaciones';

select cron.schedule(
  'vencer-confirmaciones',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://dkqfwocdittldjxujjku.supabase.co/functions/v1/vencer-confirmaciones',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);