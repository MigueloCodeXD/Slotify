import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { esServiceRole } from "../_shared/auth.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: number; end: number } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => Date.parse(norm(s));
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

// Ventana: recordar citas que empiezan dentro de las próximas 24h
// (más 1h de tolerancia si el cron se retrasa). recordado_at evita duplicados.
const HORA_MS = 3_600_000;

export async function recordatoriosRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!esServiceRole(req)) return json({ error: "No autorizado." }, 401);

  const ahora = Date.now();
  const desde = new Date(ahora).toISOString();
  const hasta = new Date(ahora + 25 * HORA_MS).toISOString();
  const ventana = `["${desde}","${hasta}")`;

  const { data: citas } = await admin
    .from("citas")
    .select(
      "id, rango_tiempo, recordado_at, token_gestion, cliente:clientes(nombre,email), profesional:profesionales(id,nombre,email), servicio:servicios(nombre)"
    )
    .eq("estado", "confirmada")
    .is("recordado_at", null)
    .filter("rango_tiempo", "ov", ventana);

  let recordados = 0;
  for (const c of citas ?? []) {
    const rango = parseRango(c.rango_tiempo as string);
    if (rango.start < ahora) continue;

    const cliente = (c.cliente as unknown as { nombre: string; email: string } | null) ?? null;
    const profesional = (c.profesional as unknown as { id: string; nombre: string; email: string } | null) ?? null;
    const servicio = (c.servicio as unknown as { nombre: string } | null)?.nombre ?? "Servicio";

    if (!cliente || !profesional) continue;

    const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${(c as unknown as { token_gestion: string }).token_gestion}`;

    await enviarCorreo("recordatorio_cita_cliente", {
      to: cliente.email,
      nombre: cliente.nombre,
      servicio,
      profesional: profesional.nombre,
      fecha: new Date(rango.start).toISOString(),
      link_gestion: link,
    }).catch(() => {});

    await enviarCorreo("recordatorio_cita_profesional", {
      to: profesional.email,
      nombre: profesional.nombre,
      cliente: cliente.nombre,
      servicio,
      fecha: new Date(rango.start).toISOString(),
    }).catch(() => {});

    // Marcar como recordada (guarda WHERE recordado_at IS NULL por si hay concurrencia)
    const { error } = await admin
      .from("citas")
      .update({ recordado_at: new Date().toISOString() })
      .eq("id", c.id)
      .is("recordado_at", null);
    if (!error) recordados++;
  }

  return json({ ok: true, citas_revisadas: (citas ?? []).length, recordatorios_enviados: recordados });
}

serve(async (req) => {
  try {
    const res = await recordatoriosRequest(req);
    return res;
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});
