-- ============================================================
-- 008_perfil.sql — columna cédula + bucket público de fotos de perfil
-- ============================================================

-- Cédula del profesional
alter table public.profesionales
  add column if not exists cedula varchar(30);

-- Bucket público para fotos de perfil
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-perfil', 'fotos-perfil', true, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- SELECT público para leer fotos
create policy "fotos-perfil publico lectura"
  on storage.objects for select
  using (bucket_id = 'fotos-perfil');

-- INSERT: cualquier usuario autenticado sube a su propia carpeta
create policy "fotos-perfil subida autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

-- UPDATE/REEMPLAZO: el dueño de la carpeta
create policy "fotos-perfil actualizar dueno"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text);