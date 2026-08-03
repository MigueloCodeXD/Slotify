import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

const schema = z.object({ cita_id: z.string().uuid() });

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => new Date(norm(s)).toISOString();
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

export async function cancelarProfRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401);

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
    .eq("id", parsed.data.cita_id)
    .single();
  if (error || !cita) return json({ error: "No se encontró la cita." }, 404);
  if (cita.profesional_id !== prof.id) return json({ error: "No puedes gestionar esa cita." }, 403);
  if (cita.estado !== "confirmada") return json({ error: "Esta cita ya no es cancelable." }, 400);

  const { error: eUp } = await admin
    .from("citas")
    .update({ estado: "cancelada" })
    .eq("id", cita.id);
  if (eUp) return json({ error: "No se pudo cancelar la cita." }, 500);

  const rango = parseRango(cita.rango_tiempo as string);
  await enviarCorreo("cita_cancelada_cliente", {
    to: cita.cliente.email,
    nombre: cita.cliente.nombre,
    servicio: cita.servicio.nombre,
    profesional: cita.profesional.nombre,
    fecha: rango.start,
  }).catch(() => {});

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await cancelarProfRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});