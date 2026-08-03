import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { verificarSesionCliente } from "../_shared/token.ts";

const schema = z.object({
  sesion: z.string().optional(),
  token_gestion: z.string().uuid().optional(),
});

export async function misCitasRequest(req: Request): Promise<Response> {
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

  // Modo 1: cita puntual por token de gestión
  if (parsed.data.token_gestion) {
    const { data: cita } = await admin
      .from("citas")
      .select("*, servicio:servicios(id,nombre,descripcion,precio,duracion_min), profesional:profesionales(id,nombre,foto_url)")
      .eq("token_gestion", parsed.data.token_gestion)
      .single();
    if (!cita) return json({ error: "No se encontró la cita." }, 404);
    const { data: avisos } = await admin
      .from("avisos_cita")
      .select("id, mensaje, created_at")
      .eq("cita_id", cita.id)
      .eq("es_publico_cliente", true)
      .order("created_at", { ascending: false });
    return json({ citas: [cita], avisos: { [cita.id]: avisos ?? [] } });
  }

  // Modo 2: sesión por código de acceso
  if (!parsed.data.sesion) return json({ error: "Falta sesión o token." }, 400);
  const sesion = await verificarSesionCliente(parsed.data.sesion);
  if (!sesion) return json({ error: "Sesión inválida o expirada." }, 401);

  const { data: cliente } = await admin
    .from("clientes")
    .select("id")
    .eq("email", sesion.email)
    .maybeSingle();
  if (!cliente) return json({ citas: [], avisos: {} });

  const { data: citas } = await admin
    .from("citas")
    .select("*, servicio:servicios(id,nombre,descripcion,precio,duracion_min), profesional:profesionales(id,nombre,foto_url)")
    .eq("cliente_id", cliente.id)
    .order("created_at", { ascending: false });

  const citaIds = (citas ?? []).map((c) => c.id);
  let avisos: { cita_id: string; id: string; mensaje: string; created_at: string }[] = [];
  if (citaIds.length > 0) {
    const { data: a } = await admin
      .from("avisos_cita")
      .select("cita_id, id, mensaje, created_at")
      .in("cita_id", citaIds)
      .eq("es_publico_cliente", true)
      .order("created_at", { ascending: false });
    avisos = (a ?? []) as typeof avisos;
  }

  const agrupados: Record<string, typeof avisos> = {};
  for (const av of avisos) (agrupados[av.cita_id] ??= []).push(av);

  return json({ citas: citas ?? [], avisos: agrupados });
}

serve(async (req) => {
  try {
    const res = await misCitasRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});