-- ============================================================
-- 009_precio_intentos.sql
-- 1) Snapshop de precio/duración en cada cita (histórico correcto).
-- 2) Tabla de intentos de código de acceso (anti-spam por IP/email).
-- 3) Cron de limpieza de códigos vencidos e intentos antiguos.
-- ============================================================

-- 1) Snapshot de precio y duración al momento de agendar
alter table public.citas
  add column if not exists precio_servicio numeric(10,2);
alter table public.citas
  add column if not exists duracion_min_servicio int;

-- Backfill desde el catálogo actual
update public.citas c
set precio_servicio = s.precio,
    duracion_min_servicio = s.duracion_min
from public.servicios s
where s.id = c.servicio_id
  and c.precio_servicio is null;

alter table public.citas alter column precio_servicio set not null;
alter table public.citas alter column duracion_min_servicio set not null;

-- 2) Intentos (solicitar/verificar códigos) por IP y email
create table if not exists public.intentos_codigo (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip text not null default '',
  tipo text not null check (tipo in ('solicitar', 'verificar')),
  created_at timestamptz not null default now()
);
create index if not exists intentos_cod_ip_idx
  on public.intentos_codigo (ip, created_at);
create index if not exists intentos_cod_email_idx
  on public.intentos_codigo (email, created_at);
alter table public.intentos_codigo enable row level security;

-- 3) Limpieza diaria: códigos vencidos + intentos antiguos
select cron.schedule(
  'limpiar-codigos-intentos',
  '30 4 * * *',
  $$
  delete from public.codigos_acceso
  where expira_at < now() - interval '1 day';
  delete from public.intentos_cod
  where created_at < now() - interval '1 day';
  $$
);