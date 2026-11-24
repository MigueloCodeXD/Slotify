import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";
import { auditarCita } from "../_shared/auditoria.ts";

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

  const { data: cita } = await admin
    .from("citas")
    .select("id, profesional_id, estado")
    .eq("id", parsed.data.cita_id)
    .single();
  if (!cita) return json({ error: "No se encontró la cita." }, 404, req);
  if (cita.profesional_id !== target.id) return json({ error: "No puedes gestionar esa cita." }, 403, req);

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

  if (Object.keys(campos).length === 0) return json({ ok: true }, 200, req);

  const { error } = await admin.from("citas").update(campos).eq("id", cita.id);
  if (error) return json({ error: "No se pudo actualizar la cita." }, 500, req);

  if (campos.estado && campos.estado !== cita.estado) {
    await auditarCita({ citaId: cita.id, estadoAnterior: cita.estado, estadoNuevo: String(campos.estado), hechoPor: target.email });
  }

  return json({ ok: true }, 200, req);
}

serve(async (req) => {
  try {
    return await actualizarCitaProfRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});