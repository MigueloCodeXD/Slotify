import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { verificarSesionCliente } from "../_shared/token.ts";

const schema = z.object({
  sesion: z.string().min(10),
  nombre: z.string().min(2).max(120).optional(),
  telefono: z.string().max(30).nullable().optional(),
});

export async function editarPerfilRequest(req: Request): Promise<Response> {
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
  const d = parsed.data;

  const sesion = await verificarSesionCliente(d.sesion);
  if (!sesion) return json({ error: "Sesión inválida o expirada." }, 401, req);

  const { data: cliente } = await admin
    .from("clientes")
    .select("id")
    .eq("email", sesion.email)
    .maybeSingle();
  if (!cliente) return json({ error: "No se encontró el cliente." }, 404, req);

  const campos: Record<string, unknown> = {};
  if (d.nombre !== undefined) campos.nombre = d.nombre;
  if (d.telefono !== undefined) campos.telefono = d.telefono === "" ? null : d.telefono;
  if (Object.keys(campos).length === 0) return json({ error: "Sin cambios." }, 400, req);

  const { error } = await admin.from("clientes").update(campos).eq("id", cliente.id);
  if (error) return json({ error: "No se pudo actualizar tu perfil." }, 500, req);

  const { data: actualizado } = await admin
    .from("clientes")
    .select("id, nombre, email, telefono")
    .eq("id", cliente.id)
    .single();

  return json({ ok: true, cliente: actualizado }, 200, req);
}

serve(async (req) => {
  try {
    return await editarPerfilRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});