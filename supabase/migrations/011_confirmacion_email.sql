-- 011_confirmacion_email.sql
-- Re-confirmación del email de los profesionales al cambiar su correo.
-- El email es la llave de acceso del profesional: si cambia, debe reconfirmarse.

alter table profesionales
  add column if not exists email_confirmado boolean not null default true;