import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

const schema = z.object({
  cita_id: z.string().uuid(),
  mensaje: z.string().min(1).max(500),
  es_publico_cliente: z.boolean().optional().default(true),
});

export async function enviarAvisoRequest(req: Request): Promise<Response> {
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

  const { data: cita, error } = await admin
    .from("citas")
    .select("id, profesional_id, token_gestion, cliente:clientes(*)")
    .eq("id", d.cita_id)
    .single();
  if (error || !cita) return json({ error: "No se encontró la cita." }, 404);
  if (cita.profesional_id !== prof.id && prof.rol !== "admin") {
    return json({ error: "No puedes enviar avisos en esa cita." }, 403);
  }

  const { error: eIns } = await admin.from("avisos_cita").insert({
    cita_id: cita.id,
    profesional_id: prof.id,
    mensaje: d.mensaje,
    es_publico_cliente: d.es_publico_cliente,
    emisor: "profesional",
  });
  if (eIns) return json({ error: "No se pudo guardar el aviso." }, 500);

  if (d.es_publico_cliente) {
    const cli = (Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente) as unknown as
      | { email?: string; nombre?: string }
      | undefined;
    const { data: cfgDir } = await admin.from("config").select("direccion").single();
    const direccion = (cfgDir?.direccion as string | null) ?? "";
    await enviarCorreo("aviso_profesional_cliente", {
      to: cli?.email ?? "",
      nombre: cli?.nombre ?? "Cliente",
      mensaje: d.mensaje,
      direccion,
      link_gestion: `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`,
    }).catch(() => {});
  }

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await enviarAvisoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});