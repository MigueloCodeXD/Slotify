import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

const schema = z.object({ email: z.string().email().max(255) });

const GEN = { max: 3, ventanaMs: 10 * 60 * 1000, expiraMs: 15 * 60 * 1000 };

export async function solicitarCodigoRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Email inválido" }, 400);

  const email = parsed.data.email.toLowerCase();

  // Rate limit: máx 3 códigos por email en 10 min
  const { count } = await admin
    .from("codigos_acceso")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", new Date(Date.now() - GEN.ventanaMs).toISOString());
  if ((count ?? 0) >= GEN.max) {
    // Respuesta genérica para no filtrar nada
    return json({ ok: true, mensaje: "Si el correo existe, recibirás un código." });
  }

  const codigo = String(Math.floor(100000 + Math.random() * 900000));

  // Invalidar códigos previos no usados del mismo email
  await admin.from("codigos_acceso").update({ usado: true }).eq("email", email).eq("usado", false);

  const { error } = await admin.from("codigos_acceso").insert({
    email,
    codigo,
    expira_at: new Date(Date.now() + GEN.expiraMs).toISOString(),
  });
  if (error) {
    console.error("Error guardando código:", error);
    return json({ error: "No se pudo procesar la solicitud." }, 500);
  }

  const { data: cliente } = await admin
    .from("clientes")
    .select("nombre")
    .eq("email", email)
    .maybeSingle();

await enviarCorreo("codigo_acceso_cliente", {
    to: email,
    nombre: cliente?.nombre ?? "usuario",
    codigo,
  }).catch(() => {});

  return json({ ok: true, mensaje: "Si el correo existe, recibirás un código." });
}

serve(async (req) => {
  try {
    const res = await solicitarCodigoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});