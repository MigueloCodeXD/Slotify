import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";

const schema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profesional_id: z.string().uuid().optional().nullable(),
});

const OFF = 5 * 3600 * 1000;

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => new Date(norm(s)).toISOString();
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

export async function agendaDiaRequest(req: Request): Promise<Response> {
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
  const d = parsed.data;

  const objetivo = await resolverProfesionalObjetivo(prof, d.profesional_id);
  if ("error" in objetivo) return objetivo.error;
  const target = objetivo.data;

  const desdeMs = Date.parse(`${d.desde}T05:00:00Z`);
  const hastaMs = Date.parse(`${d.hasta}T05:00:00Z`) + 24 * 3600 * 1000;
  const ventana = `["${new Date(desdeMs).toISOString()}","${new Date(hastaMs).toISOString()}")`;

  const { data: citas, error } = await admin
    .from("citas")
    .select("id, profesional_id, rango_tiempo, estado, notas, precio_servicio, duracion_min_servicio, servicio:servicios(id,nombre,duracion_min), cliente:clientes(id,nombre,email,telefono)")
    .eq("profesional_id", target.id)
    .filter("rango_tiempo", "ov", ventana);

  if (error) return json({ error: "No se pudo consultar la agenda." }, 500);

  const { data: bloqueos } = await admin
    .from("bloqueos")
    .select("id, rango_tiempo, motivo")
    .eq("profesional_id", target.id)
    .filter("rango_tiempo", "ov", ventana);

  const citasOut = (citas ?? []).map((c) => ({
    ...c,
    ...parseRango(c.rango_tiempo as string),
    rango_tiempo: undefined,
  }));
  const bloqueosOut = (bloqueos ?? []).map((b) => ({
    ...b,
    ...parseRango(b.rango_tiempo as string),
    rango_tiempo: undefined,
  }));

  return json({ citas: citasOut, bloqueos: bloqueosOut, timezone: "America/Bogota", offset: OFF });
}

serve(async (req) => {
  try {
    const res = await agendaDiaRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});