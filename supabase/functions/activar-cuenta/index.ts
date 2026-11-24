import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";

const schema = z.object({
  token: z.string().uuid(),
  password: z.string().min(8).max(72),
  nombre: z.string().min(2).max(120).optional(),
  telefono: z.string().max(30).optional().nullable(),
});

export async function activarRequest(req: Request): Promise<Response> {
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

  const { data: inv, error: eInv } = await admin
    .from("invitaciones")
    .select("*, profesional:profesionales!invitaciones_profesional_id_fkey(*)")
    .eq("token", d.token)
    .eq("usado", false)
    .gte("expira_at", new Date().toISOString())
    .single();
  if (eInv || !inv || !inv.profesional) {
    return json({ error: "Invitación inválida o expirada." }, 400, req);
  }

  const prof = inv.profesional;
  if (prof.user_id) return json({ error: "Esta cuenta ya fue activada." }, 400, req);

  let authUser = null;
  const { data: created, error: eCreate } = await admin.auth.admin.createUser({
    email: prof.email,
    password: d.password,
    email_confirm: true,
  });
  if (eCreate) {
    const { data: found } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    authUser = found?.users?.find((u) => u.email === prof.email) ?? null;
    if (!authUser) return json({ error: "No se pudo crear la cuenta." }, 500, req);
  } else {
    authUser = created.user;
  }

  const { error: eLink } = await admin
    .from("profesionales")
    .update({
      user_id: authUser.id,
      ...(d.nombre ? { nombre: d.nombre } : {}),
      ...(d.telefono !== undefined ? { telefono: d.telefono } : {}),
    })
    .eq("id", prof.id);
  if (eLink) return json({ error: "No se pudo vincular la cuenta." }, 500, req);

  await admin.auth.admin.updateUserById(authUser.id, {
    user_metadata: { nombre: prof.nombre, rol: prof.rol },
  });

  await admin.from("invitaciones").update({ usado: true }).eq("id", inv.id);

  return json({ ok: true, mensaje: "Cuenta activada. Ya puedes iniciar sesión." }, 200, req);
}

serve(async (req) => {
  try {
    return await activarRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});