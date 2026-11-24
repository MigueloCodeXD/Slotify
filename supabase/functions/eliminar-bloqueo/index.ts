import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";

const schema = z.object({
  id: z.string().uuid(),
  profesional_id: z.string().uuid().optional().nullable(),
});

export async function eliminarBloqueoRequest(req: Request): Promise<Response> {
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

  const objetivo = await resolverProfesionalObjetivo(prof, parsed.data.profesional_id);
  if ("error" in objetivo) return objetivo.error;
  const target = objetivo.data;

  const { data: bloqueo } = await admin
    .from("bloqueos")
    .select("id, profesional_id")
    .eq("id", parsed.data.id)
    .single();
  if (!bloqueo) return json({ error: "No se encontró el bloqueo." }, 404, req);
  if (bloqueo.profesional_id !== target.id) return json({ error: "No puedes gestionar ese bloqueo." }, 403, req);

  const { error } = await admin.from("bloqueos").delete().eq("id", parsed.data.id);
  if (error) return json({ error: "No se pudo eliminar el bloqueo." }, 500, req);

  return json({ ok: true }, 200, req);
}

serve(async (req) => {
  try {
    return await eliminarBloqueoRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});