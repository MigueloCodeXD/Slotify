-- ============================================================
-- 012_perfil_cargo_descripcion.sql
-- - profesionales: + cargo, - foto_url (se elimina el feature de foto)
-- - config: + descripcion
-- - vista v_profesionales sin foto_url
-- - vista v_config con descripcion
-- - elimina bucket de fotos de perfil
-- ============================================================

alter table public.profesionales
  add column if not exists cargo varchar(100);

alter table public.config
  add column if not exists descripcion text;

-- Dropear vistas que dependían de foto_url (CREATE OR REPLACE no puede
-- cambiar el set de columnas), luego dropear la columna y recrear las vistas.
drop view if exists public.v_profesionales;
drop view if exists public.v_config;

alter table public.profesionales
  drop column if exists foto_url;

create view public.v_profesionales as
  select id, nombre, activo
  from public.profesionales
  where activo = true;

create view public.v_config as
  select nombre_negocio, zona_horaria, margen_anticipacion_horas,
         horas_limite_cancelacion, direccion, descripcion
  from public.config;

grant select on public.v_profesionales to anon, authenticated;
grant select on public.v_config to anon, authenticated;

-- Nota: el bucket de fotos 'fotos-perfil' queda huérfano (Supabase no permite
-- borrar objetos/policies vía DML directo en storage.*). Se puede eliminar
-- desde el dashboard (Storage) si se desea limpiar.