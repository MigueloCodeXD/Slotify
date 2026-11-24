-- CRM ligero para clientes: etiquetas, consentimiento y notas internas.
alter table public.clientes add column if not exists etiquetas text[] not null default '{}';
alter table public.clientes add column if not exists consentimiento_marketing boolean not null default false;
alter table public.clientes add column if not exists consentimiento_at timestamptz;
alter table public.clientes add column if not exists notas_internas text;
create index if not exists clientes_etiquetas_gin on public.clientes using gin (etiquetas);
