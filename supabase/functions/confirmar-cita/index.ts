import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";

const schema = z.object({ token_gestion: z.string().uuid() });

export async function confirmarCitaRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

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
    .select("id, estado, confirmacion_pendiente, confirmacion_expira_at, confirmado_at")
    .eq("token_gestion", parsed.data.token_gestion)
    .single();
  if (error || !cita) return json({ error: "No se encontró la cita." }, 404);

  if (cita.estado === "confirmada") return json({ ok: true, ya_confirmada: true });

  if (cita.estado !== "pendiente" || !cita.confirmacion_pendiente) {
    return json({ error: "Esta cita no está pendiente de confirmación." }, 400);
  }

  if (cita.confirmacion_expira_at && Date.parse(cita.confirmacion_expira_at) < Date.now()) {
    return json({ error: "El tiempo de confirmación venció y el horario se liberó." }, 400);
  }

  const { error: eUp } = await admin
    .from("citas")
    .update({
      estado: "confirmada",
      confirmacion_pendiente: false,
      confirmado_at: new Date().toISOString(),
      confirmacion_expira_at: null,
    })
    .eq("id", cita.id);
  if (eUp) return json({ error: "No se pudo confirmar la cita." }, 500);

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await confirmarCitaRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});