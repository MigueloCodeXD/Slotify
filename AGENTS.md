<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Slotify project notes
- No integrar pasarelas de pago; pagos son manuales.
- Edge Functions: usar `json(..., status, req)` para CORS/request-id.
- `AUTH_SECRET` obligatorio en runtime; no agregar fallbacks.
- CORS allowlist via `APP_ALLOWED_ORIGINS`/`APP_BASE_URL`.
- Antes de terminar cambios: `npm run lint && npm run typecheck && npm run build`.
