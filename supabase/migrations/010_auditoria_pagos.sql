-- ============================================================
-- 010_auditoria_pagos.sql
-- 1) updated_at con trigger en tablas clave (auditoría).
-- 2) Tabla de auditoría de transiciones de estado de citas.
-- 3) Pagos: anticipo + estado_pago en citas, tabla pagos.
-- 4) Cron de purga ampliado (citas canceladas y avisos antiguos).
-- ============================================================

-- 1) updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.citas add column if not exists updated_at timestamptz;
alter table public.profesionales add column if not exists updated_at timestamptz;
alter table public.servicios add column if not exists updated_at timestamptz;
alter table public.clientes add column if not exists updated_at timestamptz;
alter table public.config add column if not exists updated_at timestamptz;
alter table public.bloqueos add column if not exists updated_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['citas','profesionales','servicios','clientes','config','bloqueos']
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- 2) Auditoría de estado de citas
create table if not exists public.auditoria_cita (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references public.citas(id) on delete cascade,
  estado_anterior varchar(20),
  estado_nuevo varchar(20) not null,
  hecho_por varchar(120),
  created_at timestamptz not null default now()
);
create index if not exists auditoria_cita_idx on public.auditoria_cita (cita_id, created_at);
alter table public.auditoria_cita enable row level security;

-- 3) Pagos
alter table public.citas
  add column if not exists anticipo numeric(10,2) not null default 0;
alter table public.citas
  add column if not exists estado_pago varchar(20) not null default 'pendiente'
  check (estado_pago in ('pendiente', 'parcial', 'pagado'));

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references public.citas(id) on delete cascade,
  monto numeric(10,2) not null check (monto >= 0),
  metodo varchar(40) not null default 'efectivo',
  usuario varchar(120),
  created_at timestamptz not null default now()
);
create index if not exists pagos_cita_idx on public.pagos (cita_id);
alter table public.pagos enable row level security;

-- 4) Purga ampliada (se ejecuta junto a la limpieza de códigos)
select cron.unschedule(jobid)
from cron.job
where jobname = 'limpiar-codigos-intentos';

select cron.schedule(
  'limpiar-codigos-intentos',
  '30 4 * * *',
  $$
  delete from public.codigos_acceso
  where expira_at < now() - interval '1 day';
  delete from public.intentos_codigo
  where created_at < now() - interval '1 day';
  delete from public.citas
  where estado = 'cancelada' and created_at < now() - interval '90 days';
  delete from public.avisos_cita
  where created_at < now() - interval '90 days';
  $$
);