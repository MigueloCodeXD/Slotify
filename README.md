# Slotify — Gestor de citas para un negocio

Gestor de citas de negocio único: catálogo público, agendado con IA y botones,
acceso sin cuenta para clientes (código por correo) y panel privado por
profesional con copiloto de IA.

## Stack
- **Frontend:** `src` — Next.js 16 + TypeScript + Tailwind (morado, moderno)
- **Backend:** `supabase/functions` — Edge Functions (Deno), toda escritura pasa por aquí
- **Base de datos:** PostgreSQL en Supabase (RLS + `EXCLUDE USING gist` anti doble-reserva)
- **IA:** Gemini `gemini-flash-latest`, function calling (la IA nunca escribe directo)
- **Correos:** Brevo API

## Estructura
```
src                     → portal cliente (/ , /agendar, /mis-citas, /mi-cita) + panel (/login, /panel)
supabase/functions      → Edge Functions (crear/cancelar/reprogramar cita, códigos, agenda, copiloto, etc.)
supabase/migrations     → esquema SQL
supabase/scripts        → setup-admin.ts
```

## Setup rápido

### 1. Variables de entorno
```bash
cp .env.local.example .env.local    # (si existe) o crea tus .env.local
# Ver .env.example y supabase/.env.example
```

### 2. Aplicar el esquema (una vez)
```bash
supabase login                     # pega tu Access Token (cuenta)
supabase link --project-ref TU-REF
supabase db push                    # aplica las migraciones
```

### 3. Secretos de las Edge Functions
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... \
  GEMINI_API_KEY=... \
  BREVO_API_KEY=... \
  BREVO_FROM_EMAIL=... \
  AUTH_SECRET=... \
  APP_BASE_URL=... \
  APP_TIMEZONE=America/Bogota
```

### 4. Desplegar las Edge Functions
```bash
supabase functions deploy --project-ref TU-REF crear-cita
supabase functions deploy consultar-disponibilidad
# ... repetir por cada función en supabase/functions
```

### 5. Crear el admin inicial
```bash
cd supabase
ADMIN_EMAIL=admin@negocio.com ADMIN_PASSWORD=mipass123 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run --allow-env --allow-net scripts/setup-admin.ts
```

### 6. Frontend (local)
```bash
npm install && npm run dev
```

## Variables requeridas
Ver `supabase/.env.example` y `.env.example`.

## Cron: resumen matutino
El proyecto ya incluye las migraciones para programar `resumen-matutino` a las
07:00 (hora Bogotá) vía `pg_cron` + `pg_net` (migraciones 003–005). El
`service_role_key` se guarda en la Vault y se lee en runtime:

```sql
-- (una vez, manual o migración)
select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

select cron.schedule('resumen-matutino', '0 12 * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/resumen-matutino',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
$$);
```
Nota: `0 12 * * *` en UTC = 07:00 en `America/Bogota`. El patrón
`current_setting('secrets.service_role_key')` **no funciona** en Supabase
hosted; hay que usar la Vault.

## Notas de seguridad
- `sb_secret_*` y `GEMINI_API_KEY` viven solo en Edge Functions/secretos, nunca en el cliente.
- La IA solo decide qué función llamar; la escritura valida igual que los botones.
- RLS: catálogo público de solo lectura (vistas `v_servicios`, `v_profesionales`, `v_config`); el resto denegado para `anon`.
- El remitente de Brevo es una cuenta Gmail: entregabilidad limitada y Brevo reescribe el `from`. Cuando quieras, verifica un dominio y sube `BREVO_FROM_EMAIL`.
- El gestor de disponibilidad requiere que las funciones y el frontend usen el mismo formato de rango; `parseRango` normaliza offsets `+HH` → `+HH:00` (Postgres devuelve `+00`, que JS no parsea directo).
- Embeds con doble FK (p.ej. `invitaciones.profesional_id`/`creado_por`) requieren la hint `profesionales!invitaciones_profesional_id_fkey(*)` en PostgREST.