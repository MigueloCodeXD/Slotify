import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

export async function consultarMensajesRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401);

  let query = admin.from("avisos_cita").select(
    "id, cita_id, profesional_id, mensaje, emisor, created_at, cita:citas(id, estado, rango_tiempo, servicio:servicios(nombre), cliente:clientes(nombre))"
  );
  if (prof.rol !== "admin") {
    query = query.eq("profesional_id", prof.id);
  }

  const { data: avisos, error } = await query.order("created_at", { ascending: true });
  if (error) return json({ error: "No se pudieron cargar los mensajes." }, 500);

  const porCita = new Map<string, { citas: unknown; mensajes: unknown[] }>();
  for (const av of (avisos ?? []) as {
    id: string;
    cita_id: string;
    mensaje: string;
    emisor: string;
    created_at: string;
    cita: unknown;
  }[]) {
    let conv = porCita.get(av.cita_id);
    if (!conv) {
      conv = { citas: av.cita, mensajes: [] };
      porCita.set(av.cita_id, conv);
    }
    conv.mensajes.push({
      id: av.id,
      mensaje: av.mensaje,
      emisor: av.emisor,
      created_at: av.created_at,
    });
  }

  const conversaciones = Array.from(porCita.entries()).map(([cita_id, conv]) => ({
    cita_id,
    cita: conv.citas,
    mensajes: conv.mensajes as { id: string; mensaje: string; emisor: string; created_at: string }[],
    ultimo: (conv.mensajes[conv.mensajes.length - 1] as { created_at: string }).created_at,
  }));
  conversaciones.sort((a, b) => b.ultimo.localeCompare(a.ultimo));

  return json({ conversaciones });
}

serve(async (req) => {
  try {
    const res = await consultarMensajesRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});
