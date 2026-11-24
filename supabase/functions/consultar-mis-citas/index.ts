import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
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
    return json({ error: "Body inválido" }, 400, req);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400, req);

  // Modo 1: cita puntual por token de gestión
  if (parsed.data.token_gestion) {
    const { data: cita } = await admin
      .from("citas")
      .select("*, servicio:servicios(id,nombre,descripcion,precio,duracion_min), profesional:profesionales(id,nombre)")
      .eq("token_gestion", parsed.data.token_gestion)
      .single();
    if (!cita) return json({ error: "No se encontró la cita." }, 404, req);
    const { data: avisos } = await admin
      .from("avisos_cita")
      .select("id, mensaje, emisor, created_at")
      .eq("cita_id", cita.id)
      .eq("es_publico_cliente", true)
      .order("created_at", { ascending: false });
    return json({ citas: [cita], avisos: { [cita.id]: avisos ?? [] } }, 200, req);
  }

  // Modo 2: sesión por código de acceso
  if (!parsed.data.sesion) return json({ error: "Falta sesión o token." }, 400, req);
  const sesion = await verificarSesionCliente(parsed.data.sesion);
  if (!sesion) return json({ error: "Sesión inválida o expirada." }, 401, req);

  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nombre, email, telefono")
    .eq("email", sesion.email)
    .maybeSingle();
  if (!cliente) return json({ citas: [], avisos: {}, cliente: null }, 200, req);

  const { data: citas } = await admin
    .from("citas")
    .select("*, servicio:servicios(id,nombre,descripcion,precio,duracion_min), profesional:profesionales(id,nombre)")
    .eq("cliente_id", cliente.id)
    .order("created_at", { ascending: false });

  const citaIds = (citas ?? []).map((c) => c.id);
  let avisos: { cita_id: string; id: string; mensaje: string; emisor: string; created_at: string }[] = [];
  if (citaIds.length > 0) {
    const { data: a } = await admin
      .from("avisos_cita")
      .select("cita_id, id, mensaje, emisor, created_at")
      .in("cita_id", citaIds)
      .eq("es_publico_cliente", true)
      .order("created_at", { ascending: false });
    avisos = (a ?? []) as typeof avisos;
  }

  const agrupados: Record<string, typeof avisos> = {};
  for (const av of avisos) (agrupados[av.cita_id] ??= []).push(av);

  return json({ citas: citas ?? [], avisos: agrupados, cliente }, 200, req);
}

serve(async (req) => {
  try {
    return await misCitasRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});