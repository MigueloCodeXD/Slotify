import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

const schema = z.object({
  email: z.string().email().max(255),
  nombre: z.string().min(2).max(120),
});

export async function invitarRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);

  const { data: adminProf } = await getProfesionalByUser(userId);
  if (!adminProf || adminProf.rol !== "admin") {
    return json({ error: "Solo el administrador puede invitar profesionales." }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400);
  const d = parsed.data;

  const email = d.email.toLowerCase();

  const { data: existente } = await admin
    .from("profesionales")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existente) return json({ error: "Ese email ya es un profesional." }, 400);

  const { data: prof, error: eProf } = await admin
    .from("profesionales")
    .insert({ nombre: d.nombre, email, rol: "profesional" })
    .select("id")
    .single();
  if (eProf) return json({ error: "No se pudo crear el profesional." }, 500);

  const { data: inv, error: eInv } = await admin
    .from("invitaciones")
    .insert({ profesional_id: prof!.id, creado_por: adminProf.id })
    .select("token, expira_at")
    .single();
  if (eInv) return json({ error: "No se pudo generar la invitación." }, 500);

  const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/activar-cuenta?token=${inv!.token}`;
  await enviarCorreo("invitacion_profesional", {
    to: email,
    nombre: d.nombre,
    link_activacion: link,
    negocio: "Slotify",
  }).catch(() => {});

  return json({ ok: true, mensaje: "Invitación enviada." });
}

serve(async (req) => {
  try {
    const res = await invitarRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});