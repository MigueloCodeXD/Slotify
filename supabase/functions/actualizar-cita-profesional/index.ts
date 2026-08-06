import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";

const schema = z.object({
  cita_id: z.string().uuid(),
  profesional_id: z.string().uuid().optional().nullable(),
  estado: z.enum(["confirmada", "cancelada", "completada", "no_show"]).optional(),
  notas: z.string().max(500).optional().nullable(),
});

export async function actualizarCitaProfRequest(req: Request): Promise<Response> {
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

  const objetivo = await resolverProfesionalObjetivo(prof, parsed.data.profesional_id);
  if ("error" in objetivo) return objetivo.error;
  const target = objetivo.data;

  const { data: cita } = await admin
    .from("citas")
    .select("id, profesional_id, estado")
    .eq("id", parsed.data.cita_id)
    .single();
  if (!cita) return json({ error: "No se encontró la cita." }, 404);
  if (cita.profesional_id !== target.id) return json({ error: "No puedes gestionar esa cita." }, 403);

  const campos: Record<string, unknown> = {};
  if (parsed.data.estado !== undefined) {
    const nuevo = parsed.data.estado;
    if (nuevo === "confirmada") {
      campos.estado = "confirmada";
      campos.confirmacion_pendiente = false;
      campos.confirmado_at = new Date().toISOString();
      campos.confirmacion_expira_at = null;
    } else {
      campos.estado = nuevo;
      campos.confirmacion_pendiente = false;
      campos.confirmacion_expira_at = null;
    }
  }
  if (parsed.data.notas !== undefined) campos.notas = parsed.data.notas;

  if (Object.keys(campos).length === 0) return json({ ok: true });

  const { error } = await admin.from("citas").update(campos).eq("id", cita.id);
  if (error) return json({ error: "No se pudo actualizar la cita." }, 500);

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await actualizarCitaProfRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});