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

alter table public.profesionales
  drop column if exists foto_url;

alter table public.config
  add column if not exists descripcion text;

create or replace view public.v_profesionales as
  select id, nombre, activo
  from public.profesionales
  where activo = true;

create or replace view public.v_config as
  select nombre_negocio, zona_horaria, margen_anticipacion_horas,
         horas_limite_cancelacion, direccion, descripcion
  from public.config;

-- Eliminar bucket de fotos de perfil y sus policies/objetos
delete from storage.objects where bucket_id = 'fotos-perfil';
delete from storage.policies where bucket_id = 'fotos-perfil';
delete from storage.buckets where id = 'fotos-perfil';