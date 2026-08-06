import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { crearSesionCliente } from "../_shared/token.ts";
import { getClientIp } from "../_shared/ip.ts";

const schema = z.object({ email: z.string().email().max(255), codigo: z.string().length(6) });

const LIM = { maxPorIp: 15, ventanaMs: 10 * 60 * 1000 };

export async function verificarCodigoRequest(req: Request): Promise<Response> {
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

  const email = parsed.data.email.toLowerCase();
  const ip = getClientIp(req);
  const desde = new Date(Date.now() - LIM.ventanaMs).toISOString();

  // Rate limit por IP de intentos de verificación
  const { count: porIp } = await admin
    .from("intentos_codigo")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("tipo", "verificar")
    .gte("created_at", desde);
  if ((porIp ?? 0) >= LIM.maxPorIp) {
    return json({ error: "Demasiados intentos. Intenta más tarde." }, 429);
  }

  await admin.from("intentos_codigo").insert({ email, ip, tipo: "verificar" });

  const { data: registro, error } = await admin
    .from("codigos_acceso")
    .select("*")
    .eq("email", email)
    .eq("codigo", parsed.data.codigo)
    .eq("usado", false)
    .gte("expira_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !registro) {
    return json({ error: "Código inválido o expirado." }, 400);
  }

  await admin.from("codigos_acceso").update({ usado: true }).eq("id", registro.id);
  await admin.from("intentos_codigo").delete().eq("email", email).eq("tipo", "verificar");

  const sesion = await crearSesionCliente(email);
  return json({ ok: true, sesion });
}

serve(async (req) => {
  try {
    const res = await verificarCodigoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});