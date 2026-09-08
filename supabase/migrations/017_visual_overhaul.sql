-- ============================================================
-- 017_visual_overhaul.sql
-- Agrega: logo del negocio, color personalizable, fotos de
-- profesionales, imágenes de servicios, tabla de cargos,
-- enlace servicio→cargo, pausa en disponibilidad, buckets.
-- ============================================================

-- ── CONFIG ──────────────────────────────────────────────────
ALTER TABLE public.config
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS color_principal VARCHAR(7) DEFAULT '#7C3AED';

-- ── PROFESIONALES ───────────────────────────────────────────
-- foto_url fue eliminado en 012; se reintroduce para fotos de perfil.
ALTER TABLE public.profesionales
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- ── SERVICIOS ───────────────────────────────────────────────
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS imagen_url TEXT,
  ADD COLUMN IF NOT EXISTS cargo_requerido VARCHAR(100);

-- ── DISPONIBILIDAD — pausa por día ──────────────────────────
ALTER TABLE public.disponibilidad_profesional
  ADD COLUMN IF NOT EXISTS pausa_inicio TIME,
  ADD COLUMN IF NOT EXISTS pausa_fin TIME;

-- ── CARGOS (catálogo predefinido) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO public.cargos (nombre) VALUES
  ('Barbero'), ('Peluquero'), ('Estilista'), ('Manicurista'),
  ('Maquillador'), ('Técnico de Uñas'), ('Masajista')
ON CONFLICT (nombre) DO NOTHING;

-- ── STORAGE BUCKETS ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('logos-negocio', 'logos-negocio', true, 2097152,
   '{"image/png","image/jpeg","image/webp","image/svg+xml"}'),
  ('fotos-profesionales', 'fotos-profesionales', true, 3145728,
   '{"image/png","image/jpeg","image/webp"}'),
  ('imagenes-servicios', 'imagenes-servicios', true, 2097152,
   '{"image/png","image/jpeg","image/webp"}')
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage: lectura pública, escritura autenticada
DO $$
BEGIN
  -- logos-negocio
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logos lectura publica' AND tablename = 'objects') THEN
    CREATE POLICY "logos lectura publica" ON storage.objects
      FOR SELECT USING (bucket_id = 'logos-negocio');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logos escritura autenticada' AND tablename = 'objects') THEN
    CREATE POLICY "logos escritura autenticada" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'logos-negocio' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logos update autenticado' AND tablename = 'objects') THEN
    CREATE POLICY "logos update autenticado" ON storage.objects
      FOR UPDATE USING (bucket_id = 'logos-negocio' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logos delete autenticado' AND tablename = 'objects') THEN
    CREATE POLICY "logos delete autenticado" ON storage.objects
      FOR DELETE USING (bucket_id = 'logos-negocio' AND auth.role() = 'authenticated');
  END IF;

  -- fotos-profesionales
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fotos lectura publica' AND tablename = 'objects') THEN
    CREATE POLICY "fotos lectura publica" ON storage.objects
      FOR SELECT USING (bucket_id = 'fotos-profesionales');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fotos escritura autenticada' AND tablename = 'objects') THEN
    CREATE POLICY "fotos escritura autenticada" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'fotos-profesionales' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fotos update autenticado' AND tablename = 'objects') THEN
    CREATE POLICY "fotos update autenticado" ON storage.objects
      FOR UPDATE USING (bucket_id = 'fotos-profesionales' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fotos delete autenticado' AND tablename = 'objects') THEN
    CREATE POLICY "fotos delete autenticado" ON storage.objects
      FOR DELETE USING (bucket_id = 'fotos-profesionales' AND auth.role() = 'authenticated');
  END IF;

  -- imagenes-servicios
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'servicios img lectura' AND tablename = 'objects') THEN
    CREATE POLICY "servicios img lectura" ON storage.objects
      FOR SELECT USING (bucket_id = 'imagenes-servicios');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'servicios img escritura' AND tablename = 'objects') THEN
    CREATE POLICY "servicios img escritura" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'imagenes-servicios' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'servicios img update' AND tablename = 'objects') THEN
    CREATE POLICY "servicios img update" ON storage.objects
      FOR UPDATE USING (bucket_id = 'imagenes-servicios' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'servicios img delete' AND tablename = 'objects') THEN
    CREATE POLICY "servicios img delete" ON storage.objects
      FOR DELETE USING (bucket_id = 'imagenes-servicios' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- ── RLS para cargos (lectura pública, solo admin modifica) ──
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cargos lectura' AND tablename = 'cargos') THEN
    CREATE POLICY "cargos lectura" ON public.cargos
      FOR SELECT USING (true);
  END IF;
END $$;

-- ── VISTAS ACTUALIZADAS ────────────────────────────────────
-- v_profesionales: agregar foto_url y cargo
DROP VIEW IF EXISTS public.v_profesionales;

CREATE VIEW public.v_profesionales AS
  SELECT id, nombre, foto_url, cargo, activo
  FROM public.profesionales
  WHERE activo = true;

-- v_config: agregar logo_url y color_principal
DROP VIEW IF EXISTS public.v_config;

CREATE VIEW public.v_config AS
  SELECT nombre_negocio, zona_horaria, margen_anticipacion_horas,
         horas_limite_cancelacion, direccion, descripcion,
         logo_url, color_principal
  FROM public.config;

-- v_servicios: agregar imagen_url y cargo_requerido
DROP VIEW IF EXISTS public.v_servicios;

CREATE VIEW public.v_servicios AS
  SELECT
    s.id, s.nombre, s.descripcion, s.categoria, s.precio,
    s.duracion_min, s.buffer_min, s.activo,
    s.imagen_url, s.cargo_requerido,
    COALESCE(array_agg(DISTINCT ps.profesional_id) FILTER (WHERE ps.profesional_id IS NOT NULL), '{}') AS profesionales_ids
  FROM public.servicios s
  LEFT JOIN public.profesional_servicios ps ON ps.servicio_id = s.id
  WHERE s.activo = true
  GROUP BY s.id;

-- Reotorgar permisos de lectura a las vistas actualizadas
GRANT SELECT ON public.v_profesionales TO anon, authenticated;
GRANT SELECT ON public.v_config TO anon, authenticated;
GRANT SELECT ON public.v_servicios TO anon, authenticated;