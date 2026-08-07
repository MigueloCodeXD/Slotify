-- ============================================================
-- 015_drop_foto_url.sql
-- Elimina la columna foto_url ya restaurada en 014 como backcompat.
-- Las Edge Functions desplegadas ya no la consultan (usar cargo).
-- ============================================================

alter table public.profesionales
  drop column if exists foto_url;