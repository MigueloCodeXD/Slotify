import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { consultarDisponibilidad, getConfig } from "../_shared/disponibilidad.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

const schema = z.object({
  token_gestion: z.string().uuid(),
  nuevo_start: z.string().datetime(),
});

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: number; end: number } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => Date.parse(norm(s));
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

export async function reprogramarCitaRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400);

  const { data: cita, error } = await admin
    .from("citas")
    .select("*, cliente:clientes(*), servicio:servicios(*), profesional:profesionales(*)")
    .eq("token_gestion", parsed.data.token_gestion)
    .single();
  if (error || !cita) return json({ error: "No se encontró la cita." }, 404);
  if (cita.estado !== "confirmada") return json({ error: "Esta cita ya no es reprogramable." }, 400);

  const cfg = await getConfig();
  const rangoActual = parseRango(cita.rango_tiempo as string);
  if (rangoActual.start - Date.now() < cfg.horas_limite_cancelacion * 3_600_000) {
    return json({ error: `Ya no puedes reprogramar (límite ${cfg.horas_limite_cancelacion}h).` }, 400);
  }

  const nuevoStart = Date.parse(parsed.data.nuevo_start);
  if (Number.isNaN(nuevoStart)) return json({ error: "Fecha inválida" }, 400);
  if (nuevoStart < Date.now() + cfg.margen_anticipacion_horas * 3_600_000) {
    return json({ error: "La nueva fecha no cumple el margen de anticipación." }, 400);
  }

  const disp = await consultarDisponibilidad({
    servicioId: cita.servicio_id,
    profesionalId: cita.profesional_id,
    start: nuevoStart,
    end: nuevoStart + cita.servicio.duracion_min * 60_000,
  });
  const match = disp.slots.find((s) => Date.parse(s.start) === nuevoStart);
  if (!match) return json({ error: "El nuevo horario ya no está disponible." }, 409);

  const endMs = nuevoStart + cita.servicio.duracion_min * 60_000 + cita.servicio.buffer_min * 60_000;
  const nuevoRango = `["${new Date(nuevoStart).toISOString()}","${new Date(endMs).toISOString()}")`;

  const { error: eUp } = await admin
    .from("citas")
    .update({ rango_tiempo: nuevoRango })
    .eq("id", cita.id);
  if (eUp) return json({ error: "No se pudo reprogramar la cita." }, 500);

  const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;
  await enviarCorreo("cita_modificada_cliente", {
    to: cita.cliente.email,
    nombre: cita.cliente.nombre,
    servicio: cita.servicio.nombre,
    profesional: cita.profesional.nombre,
    fecha: new Date(nuevoStart).toISOString(),
    link_gestion: link,
  }).catch(() => {});
  await enviarCorreo("cita_modificada_profesional", {
    to: cita.profesional.email,
    cliente: cita.cliente.nombre,
    servicio: cita.servicio.nombre,
    fecha: new Date(nuevoStart).toISOString(),
  }).catch(() => {});

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await reprogramarCitaRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});