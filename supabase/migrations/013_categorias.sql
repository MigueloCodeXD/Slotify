-- ============================================================
-- 013_categorias.sql — catálogo de categorías para servicios
-- - nueva tabla categorias (nombre único)
-- - backfill desde servicios.categoria
-- - FK servicios.categoria -> categorias.nombre (CASCADE al renombrar,
--   RESTRICT al borrar si está en uso)
-- ============================================================

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(60) not null unique,
  created_at timestamptz not null default now()
);

-- Backfill: incorporar las categorías de texto ya existentes
insert into public.categorias (nombre)
select distinct trim(categoria)
from public.servicios
where categoria is not null and trim(categoria) <> ''
on conflict (nombre) do nothing;

-- Vincular servicios a la categoría por nombre
alter table public.servicios
  add constraint servicios_categoria_fk
  foreign key (categoria) references public.categorias(nombre)
  on update cascade on delete restrict;

alter table public.categorias enable row level security;