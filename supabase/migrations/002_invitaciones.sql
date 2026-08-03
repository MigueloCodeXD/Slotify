-- ============================================================
-- 002_invitaciones.sql — invitaciones de profesionales
-- ============================================================

CREATE TABLE public.invitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expira_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  usado BOOLEAN NOT NULL DEFAULT false,
  creado_por UUID NOT NULL REFERENCES public.profesionales(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invitaciones_token_idx ON public.invitaciones (token);

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;
