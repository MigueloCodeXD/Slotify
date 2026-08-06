import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({ id: z.string().uuid() });

export async function eliminarBloqueoRequest(req: Request): Promise<Response> {
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

  const { data: bloqueo } = await admin
    .from("bloqueos")
    .select("id, profesional_id")
    .eq("id", parsed.data.id)
    .single();
  if (!bloqueo) return json({ error: "No se encontró el bloqueo." }, 404);
  if (bloqueo.profesional_id !== prof.id) return json({ error: "No puedes gestionar ese bloqueo." }, 403);

  const { error } = await admin.from("bloqueos").delete().eq("id", parsed.data.id);
  if (error) return json({ error: "No se pudo eliminar el bloqueo." }, 500);

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await eliminarBloqueoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});