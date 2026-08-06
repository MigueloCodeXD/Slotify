import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { citaConflicto } from "../_shared/disponibilidad.ts";

const schema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  motivo: z.string().max(200).optional().nullable(),
});

export async function crearBloqueoRequest(req: Request): Promise<Response> {
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

  const start = Date.parse(d.start);
  const end = Date.parse(d.end);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return json({ error: "Rango inválido." }, 400);
  }

  const conflicto = await citaConflicto({ profesionalId: prof.id, start, end });
  if (conflicto) {
    return json(
      {
        error: "El bloqueo solapa una cita existente. Ajusta el rango o gestiona la cita primero.",
        cita: { id: conflicto.id, estado: conflicto.estado, servicio: conflicto.servicio?.nombre ?? null },
      },
      409
    );
  }

  const rango = `["${new Date(start).toISOString()}","${new Date(end).toISOString()}")`;
  const { data, error } = await admin
    .from("bloqueos")
    .insert({ profesional_id: prof.id, rango_tiempo: rango, motivo: d.motivo ?? null })
    .select("id")
    .single();
  if (error) return json({ error: "No se pudo crear el bloqueo." }, 500);

  return json({ ok: true, id: data!.id });
}

serve(async (req) => {
  try {
    const res = await crearBloqueoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});