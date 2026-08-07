-- Mensajería bidireccional: indica el emisor de cada aviso/mensaje.
ALTER TABLE public.avisos_cita
  ADD COLUMN emisor TEXT NOT NULL DEFAULT 'cliente'
  CHECK (emisor IN ('cliente', 'profesional'));