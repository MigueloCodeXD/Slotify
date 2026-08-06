import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { json } from "../_shared/db.ts";
import { consultarDisponibilidad } from "../_shared/disponibilidad.ts";
import { getTZ, dayStartUtc, diaLocalIso } from "../_shared/time.ts";

const schema = z.object({
  servicio_id: z.string().uuid(),
  profesional_id: z.string().uuid().optional().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.number().int().min(1).max(7).optional().default(1),
});

const DAY_MS = 24 * 3600 * 1000;

export async function disponibilidadRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos", detalle: parsed.error.flatten() }, 400);
  const d = parsed.data;

  const tz = await getTZ();
  const startMs = dayStartUtc(Date.parse(`${d.fecha}T12:00:00Z`), tz);
  const endMs = startMs + d.dias * DAY_MS;

  const { slots, ocupados } = await consultarDisponibilidad({
    servicioId: d.servicio_id,
    profesionalId: d.profesional_id,
    start: startMs,
    end: endMs,
  });

  const porDia: Record<string, { profesional_id: string; start: string; end: string }[]> = {};
  for (const s of slots) {
    const key = diaLocalIso(Date.parse(s.start), tz);
    (porDia[key] ??= []).push(s);
  }

  return json({ por_dia: porDia, slots, ocupados });
}

serve(async (req) => {
  try {
    const res = await disponibilidadRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});