# Slotify — Gestor de citas para un negocio

## Entrega SENA — Proyecto Productivo con Enfoque Empresarial

- **Aprendiz:** Miguel Alfredo Bermudez Longas
- **Ficha:** 2977435
- **Modalidad:** Proyecto productivo con enfoque empresarial

Gestor de citas de negocio único: catálogo público, agendado con IA y botones,
acceso sin cuenta para clientes (código por correo) y panel privado por
profesional con copiloto de IA. Los pagos son manuales (no hay pasarela integrada).

## Stack

- **Frontend:** `src` — Next.js 16 + TypeScript + Tailwind
- **Backend:** `supabase/functions` — Edge Functions (Deno), toda escritura pasa por aquí
- **Base de datos:** PostgreSQL en Supabase (RLS + `EXCLUDE USING gist` anti doble-reserva)
- **IA:** Gemini `gemini-flash-latest`, function calling (la IA nunca escribe directo)
- **Correos:** Brevo API

## Estructura

```
src                  → portal cliente (/ , /agendar, /mis-citas, /mi-cita) + panel (/login, /panel)
supabase/functions   → Edge Functions (citas, códigos, agenda, copiloto, pagos, etc.)
supabase/migrations  → esquema SQL (001–020)
supabase/scripts     → setup-admin.ts
```

## Setup rápido

### 1. Variables de entorno

```bash
cp .env.example .env.local
cp supabase/.env.example supabase/.env.local
# Completa ambos archivos con tus valores reales.
```

El frontend usa las variables `NEXT_PUBLIC_*` y `APP_BASE_URL`; las Edge Functions
leen sus propios secrets. Nunca subas `.env.local` ni claves al repositorio.

### 2. Aplicar el esquema (una vez)

```bash
supabase login
supabase link --project-ref TU-REF
supabase db push                    # aplica las migraciones 001–020
```

Este paso va **antes** de desplegar las functions: `019_clientes_crm.sql` y
`020_auditoria_cita_extendida.sql` agregan columnas que el backend ya utiliza.

### 3. Secretos de las Edge Functions

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... \
  GEMINI_API_KEY=... \
  BREVO_API_KEY=... \
  BREVO_FROM_EMAIL=... \
  AUTH_SECRET=... \
  APP_BASE_URL=... \
  APP_ALLOWED_ORIGINS=https://tu-dominio.com \
  APP_TIMEZONE=America/Bogota
```

`AUTH_SECRET` es obligatorio en runtime (no tiene fallback).

### 4. Desplegar las Edge Functions

El workflow `.github/workflows/deploy-functions.yml` despliega todas las functions
cuando haces push a `main`. Para desplegar una individual:

```bash
supabase functions deploy crear-cita --project-ref TU-REF
```

### 5. Crear el admin inicial

```bash
cd supabase
ADMIN_EMAIL=admin@negocio.com ADMIN_PASSWORD=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run --allow-env --allow-net scripts/setup-admin.ts
```

### 6. Frontend (local)

```bash
npm install && npm run dev
```

## Variables requeridas

Ver `.env.example` y `supabase/.env.example`. El frontend lee además
`NEXT_PUBLIC_APP_TIMEZONE` (por defecto `America/Bogota`).

## Verificación

```bash
npm run lint && npm run typecheck && npm run build
```

El workflow `.github/workflows/ci.yml` ejecuta los mismos pasos en cada push/PR.

## Cron: resumen matutino

El proyecto incluye migraciones para programar `resumen-matutino` a las 07:00
(hora Bogotá) vía `pg_cron` + `pg_net` (migraciones 003–005). El
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
`current_setting('secrets.service_role_key')` **no funciona** en Supabase hosted;
hay que usar la Vault.

## Notas de seguridad y operación

- `sb_secret_*`, `GEMINI_API_KEY`, `BREVO_API_KEY` y `AUTH_SECRET` viven solo en Edge Functions/secretos, nunca en el cliente.
- La IA solo decide qué función llamar; la escritura valida igual que los botones.
- RLS: catálogo público de solo lectura (vistas `v_servicios`, `v_profesionales`, `v_config`); el resto denegado para `anon`.
- El remitente de Brevo es una cuenta Gmail: entregabilidad limitada; verifica un dominio y ajusta `BREVO_FROM_EMAIL`.
- `parseRango` normaliza offsets `+HH` → `+HH:00` (Postgres devuelve `+00`, que JS no parsea directo).
- Embeds con doble FK requieren la hint `profesionales!invitaciones_profesional_id_fkey(*)` en PostgREST.
- `json()` agrega CORS y `x-request-id` cuando recibe `req`.
- Auditoría de citas: `010` crea la tabla y `020_auditoria_cita_extendida.sql` agrega `accion`/`detalles`.
- CRM clientes: `019_clientes_crm.sql` agrega etiquetas, consentimiento marketing y notas internas.
- Deploy functions: `deploy-functions.yml` usa `--no-verify-jwt` solo para funciones públicas/cron/token propio.
