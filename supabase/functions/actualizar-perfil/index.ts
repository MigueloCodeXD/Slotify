import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  telefono: z.string().max(30).nullable().optional(),
  cedula: z.string().max(30).nullable().optional(),
  cargo: z.string().max(100).nullable().optional(),
  foto_url: z.string().url().max(500).nullable().optional(),
});

export async function actualizarPerfilRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401, req);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, req);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400, req);
  const d = parsed.data;

  const campos: Record<string, unknown> = {};
  if (d.nombre !== undefined) campos.nombre = d.nombre;
  if (d.telefono !== undefined) campos.telefono = d.telefono;
  if (d.cedula !== undefined) campos.cedula = d.cedula;
  if (d.cargo !== undefined) campos.cargo = d.cargo;
  if (d.foto_url !== undefined) campos.foto_url = d.foto_url;
  if (Object.keys(campos).length === 0) return json({ ok: true }, 200, req);

  const { error } = await admin.from("profesionales").update(campos).eq("id", prof.id);
  if (error) return json({ error: "No se pudo actualizar el perfil." }, 500, req);

  if (d.nombre !== undefined) {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { nombre: d.nombre, rol: prof.rol },
    }).catch(() => {});
  }

  return json({ ok: true }, 200, req);
}

serve(async (req) => {
  try {
    return await actualizarPerfilRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});