-- ============================================================
-- 018_gestionar_cargos.sql
-- Convierte "cargos" en catálogo con integridad referencial:
-- - backfill de cargos en uso desde profesionales/servicios
-- - FK con ON UPDATE CASCADE / ON DELETE RESTRICT
-- ============================================================

-- Normalizar vacíos a null ('' no puede referenciar cargos)
UPDATE public.profesionales SET cargo = NULL WHERE cargo = '';
UPDATE public.servicios SET cargo_requerido = NULL WHERE cargo_requerido = '';

-- Backfill: incorporar los textos de cargo ya existentes
INSERT INTO public.cargos (nombre)
SELECT DISTINCT trim(cargo) FROM public.profesionales
WHERE cargo IS NOT NULL AND trim(cargo) <> ''
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.cargos (nombre)
SELECT DISTINCT trim(cargo_requerido) FROM public.servicios
WHERE cargo_requerido IS NOT NULL AND trim(cargo_requerido) <> ''
ON CONFLICT (nombre) DO NOTHING;

-- Integridad referencial: renombrar cargo propaga el cambio;
-- eliminar un cargo en uso falla.
ALTER TABLE public.profesionales
  ADD CONSTRAINT profesionales_cargo_fk
  FOREIGN KEY (cargo) REFERENCES public.cargos(nombre)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.servicios
  ADD CONSTRAINT servicios_cargo_requerido_fk
  FOREIGN KEY (cargo_requerido) REFERENCES public.cargos(nombre)
  ON UPDATE CASCADE ON DELETE RESTRICT;