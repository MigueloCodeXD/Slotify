import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { registrar } from "../_shared/logging.ts";

const schema = z.object({
  cita_id: z.string().uuid(),
});

export async function limpiarConversacionRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400);
  const { cita_id } = parsed.data;

  const { data: cita } = await admin.from("citas").select("profesional_id").eq("id", cita_id).single();
  if (!cita) return json({ error: "Cita no encontrada." }, 404);
  if (prof.rol !== "admin" && cita.profesional_id !== prof.id) {
    return json({ error: "No puedes limpiar esta conversación." }, 403);
  }

  const { error } = await admin.from("avisos_cita").delete().eq("cita_id", cita_id);
  if (error) return json({ error: "No se pudo limpiar la conversación." }, 500);

  registrar("limpiar-conversacion", "info", "conversacion_limpiada", { cita_id, profesional_id: prof.id });

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await limpiarConversacionRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});