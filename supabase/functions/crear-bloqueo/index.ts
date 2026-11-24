import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";
import { citaConflicto } from "../_shared/disponibilidad.ts";

const schema = z.object({
  profesional_id: z.string().uuid().optional().nullable(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  motivo: z.string().max(200).optional().nullable(),
});

export async function crearBloqueoRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401, req);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, req);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400, req);
  const d = parsed.data;

  const objetivo = await resolverProfesionalObjetivo(prof, d.profesional_id);
  if ("error" in objetivo) return objetivo.error;
  const target = objetivo.data;

  const start = Date.parse(d.start);
  const end = Date.parse(d.end);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return json({ error: "Rango inválido." }, 400, req);
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

  const rango = `["${new Date(start).toISOString()}","${new Date(end).toISOString()}")`;
  const { data, error } = await admin
    .from("bloqueos")
    .insert({ profesional_id: target.id, rango_tiempo: rango, motivo: d.motivo ?? null })
    .select("id")
    .single();
  if (error) return json({ error: "No se pudo crear el bloqueo." }, 500, req);

  return json({ ok: true, id: data!.id }, 200, req);
}

serve(async (req) => {
  try {
    return await crearBloqueoRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});