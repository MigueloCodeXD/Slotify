-- ============================================================
-- 014_foto_url_backcompat.sql
-- Vuelve a crear la columna foto_url (nullable) mientras las Edge
-- Functions desplegadas en producción sigan seleccionando esa columna.
-- Es compatible con el código nuevo (no la selecciona).
-- Una vez re-desplegadas las funciones nuevas, esta columna puede
-- eliminarse de nuevo si se desea.
-- ============================================================

alter table public.profesionales
  add column if not exists foto_url text;