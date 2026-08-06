import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";
import { citaConflicto } from "../_shared/disponibilidad.ts";

const schema = z.object({
  id: z.string().uuid(),
  profesional_id: z.string().uuid().optional().nullable(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  motivo: z.string().max(200).optional().nullable(),
});

export async function actualizarBloqueoRequest(req: Request): Promise<Response> {
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

  const { data: bloqueo } = await admin
    .from("bloqueos")
    .select("id, profesional_id, rango_tiempo, motivo")
    .eq("id", d.id)
    .single();
  if (!bloqueo) return json({ error: "No se encontró el bloqueo." }, 404);
  if (bloqueo.profesional_id !== target.id) return json({ error: "No puedes gestionar ese bloqueo." }, 403);

  const campos: Record<string, unknown> = {};
  const cambioRango = d.start !== undefined || d.end !== undefined;
  if (cambioRango) {
    const rangoActual = parseRango(String(bloqueo.rango_tiempo));
    const start = d.start !== undefined ? Date.parse(d.start) : Date.parse(rangoActual.start);
    const end = d.end !== undefined ? Date.parse(d.end) : Date.parse(rangoActual.end);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return json({ error: "Rango inválido." }, 400);
    }
    const conflicto = await citaConflicto({ profesionalId: target.id, start, end });
    if (conflicto) {
      return json(
        {
          error: "El bloqueo solapa una cita existente. Ajusta el rango o gestiona la cita primero.",
          cita: { id: conflicto.id, estado: conflicto.estado, servicio: conflicto.servicio?.nombre ?? null },
        },
        409
      );
    }
    campos.rango_tiempo = `["${new Date(start).toISOString()}","${new Date(end).toISOString()}")`;
  }
  if (d.motivo !== undefined) campos.motivo = d.motivo ?? null;

  if (Object.keys(campos).length === 0) return json({ ok: true });
  const { error } = await admin.from("bloqueos").update(campos).eq("id", d.id);
  if (error) return json({ error: "No se pudo actualizar el bloqueo." }, 500);

  return json({ ok: true });
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const norm = (s: string) => new Date(s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
  return { start: norm(parts[0]!), end: norm(parts[1]!) };
}

serve(async (req) => {
  try {
    const res = await actualizarBloqueoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});
