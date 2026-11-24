-- Extiende auditoría de citas con acción y detalles estructurados.
alter table public.auditoria_cita add column if not exists accion varchar(60);
alter table public.auditoria_cita add column if not exists detalles jsonb;
create index if not exists auditoria_cita_accion_idx on public.auditoria_cita (accion, created_at desc);
