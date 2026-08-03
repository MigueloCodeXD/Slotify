-- ============================================================
-- 001_init_schema.sql — Slotify
-- Negocio único, una sola sede. Varios profesionales/servicios.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- CONFIG (singleton — un solo negocio, una sola sede)
-- ============================================================
CREATE TABLE public.config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio VARCHAR(120) NOT NULL,
  zona_horaria VARCHAR(50) NOT NULL DEFAULT 'America/Bogota',
  margen_anticipacion_horas INT NOT NULL DEFAULT 1 CHECK (margen_anticipacion_horas >= 0),
  horas_limite_cancelacion INT NOT NULL DEFAULT 2 CHECK (horas_limite_cancelacion >= 0),
  direccion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX config_singleton ON public.config ((true));

-- ============================================================
-- PROFESIONALES
-- ============================================================
CREATE TABLE public.profesionales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telefono VARCHAR(30),
  foto_url TEXT,
  rol VARCHAR(20) NOT NULL DEFAULT 'profesional' CHECK (rol IN ('admin', 'profesional')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SERVICIOS (catálogo)
-- ============================================================
CREATE TABLE public.servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(60),
  precio NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  duracion_min INT NOT NULL CHECK (duracion_min > 0),
  buffer_min INT NOT NULL DEFAULT 0 CHECK (buffer_min >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profesional_servicios (
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  servicio_id UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  PRIMARY KEY (profesional_id, servicio_id)
);

-- ============================================================
-- DISPONIBILIDAD (cada profesional define su propio horario, libre por día)
-- ============================================================
CREATE TABLE public.disponibilidad_profesional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  CHECK (hora_fin > hora_inicio)
);
CREATE INDEX disponibilidad_profesional_idx ON public.disponibilidad_profesional (profesional_id);

-- ============================================================
-- BLOQUEOS (excepciones puntuales)
-- ============================================================
CREATE TABLE public.bloqueos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  rango_tiempo TSTZRANGE NOT NULL,
  motivo VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bloqueos_profesional_idx ON public.bloqueos (profesional_id, rango_tiempo);

-- ============================================================
-- CLIENTES (sin cuenta)
-- ============================================================
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telefono VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CÓDIGOS DE ACCESO (un solo uso, "Mis Citas")
-- ============================================================
CREATE TABLE public.codigos_acceso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  codigo CHAR(6) NOT NULL,
  expira_at TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX codigos_acceso_email_idx ON public.codigos_acceso (email, expira_at);

-- ============================================================
-- CITAS (una cita = un servicio) con protección de doble-reserva
-- ============================================================
CREATE TABLE public.citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id),
  servicio_id UUID NOT NULL REFERENCES public.servicios(id),
  rango_tiempo TSTZRANGE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'confirmada'
    CHECK (estado IN ('confirmada', 'cancelada', 'completada', 'no_show')),
  token_gestion UUID NOT NULL DEFAULT gen_random_uuid(),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  EXCLUDE USING gist (
    profesional_id WITH =,
    rango_tiempo WITH &&
  ) WHERE (estado = 'confirmada')
);
CREATE INDEX citas_cliente_idx ON public.citas (cliente_id);
CREATE INDEX citas_profesional_rango_idx ON public.citas (profesional_id, rango_tiempo);
CREATE INDEX citas_token_idx ON public.citas (token_gestion);

-- ============================================================
-- AVISOS (mensajes del profesional visibles en "Mis Citas")
-- ============================================================
CREATE TABLE public.avisos_cita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id UUID NOT NULL REFERENCES public.citas(id) ON DELETE CASCADE,
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id),
  mensaje TEXT NOT NULL,
  es_publico_cliente BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CONTROL DE CUOTA DE IA
-- ============================================================
CREATE TABLE public.ia_uso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('cliente', 'profesional')),
  contador INT NOT NULL DEFAULT 0,
  UNIQUE (fecha, tipo)
);

-- ============================================================
-- VISTAS PÚBLICAS (solo columnas no sensibles)
-- ============================================================
CREATE OR REPLACE VIEW public.v_profesionales AS
  SELECT id, nombre, foto_url, activo
  FROM public.profesionales
  WHERE activo = true;

CREATE OR REPLACE VIEW public.v_servicios AS
  SELECT
    s.id, s.nombre, s.descripcion, s.categoria, s.precio,
    s.duracion_min, s.buffer_min, s.activo,
    COALESCE(array_agg(DISTINCT ps.profesional_id) FILTER (WHERE ps.profesional_id IS NOT NULL), '{}') AS profesionales_ids
  FROM public.servicios s
  LEFT JOIN public.profesional_servicios ps ON ps.servicio_id = s.id
  WHERE s.activo = true
  GROUP BY s.id;

CREATE OR REPLACE VIEW public.v_config AS
  SELECT nombre_negocio, zona_horaria, margen_anticipacion_horas,
         horas_limite_cancelacion, direccion
  FROM public.config;

-- ============================================================
-- RLS: catálogo/config público de solo lectura; resto denegado por defecto
-- ============================================================
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profesionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profesional_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidad_profesional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codigos_acceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_cita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_uso ENABLE ROW LEVEL SECURITY;

-- Lecturas públicas vía vistas (security definer sobre columnas seguras)
GRANT SELECT ON public.v_profesionales TO anon, authenticated;
GRANT SELECT ON public.v_servicios TO anon, authenticated;
GRANT SELECT ON public.v_config TO anon, authenticated;

-- Un profesional autenticado puede leer su propia fila
CREATE POLICY "profesional lee su propia fila"
  ON public.profesionales FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Config inicial del negocio
INSERT INTO public.config (nombre_negocio, zona_horaria, margen_anticipacion_horas, horas_limite_cancelacion)
VALUES ('Slotify', 'America/Bogota', 1, 2);
