import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  telefono: z.string().max(30).nullable().optional(),
  cedula: z.string().max(30).nullable().optional(),
  foto_url: z.string().max(500).nullable().optional(),
});

export async function actualizarPerfilRequest(req: Request): Promise<Response> {
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

  const campos: Record<string, unknown> = {};
  if (d.nombre !== undefined) campos.nombre = d.nombre;
  if (d.telefono !== undefined) campos.telefono = d.telefono;
  if (d.cedula !== undefined) campos.cedula = d.cedula;
  if (d.foto_url !== undefined) campos.foto_url = d.foto_url;
  if (Object.keys(campos).length === 0) return json({ ok: true });

  const { error } = await admin.from("profesionales").update(campos).eq("id", prof.id);
  if (error) return json({ error: "No se pudo actualizar el perfil." }, 500);

  if (d.nombre !== undefined) {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { nombre: d.nombre, rol: prof.rol },
    }).catch(() => {});
  }

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await actualizarPerfilRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});