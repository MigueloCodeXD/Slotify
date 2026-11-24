import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";

// Marca `email_confirmado = true` en el profesional cuando su nuevo email ya fue
// confirmado en Supabase Auth. Se invoca desde el frontend después de que el
// profesional confirma el cambio de email (email_confirmed_at ya setado).
export async function confirmarEmailRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "No autorizado." }, 401, req);
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: "No autorizado." }, 401, req);

  const confirmadoEnAuth = Boolean(data.user.email_confirmed_at);

  const { data: prof } = await admin
    .from("profesionales")
    .select("id, email, email_confirmado, user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!prof) return json({ error: "No tienes un perfil de profesional." }, 404, req);

  if (!confirmadoEnAuth) {
    return json({
      ok: false,
      pendiente: true,
      email: prof.email,
      mensaje: "Pendiente: confirma el nuevo email desde el enlace que te enviamos.",
    }, 200, req);
  }

  if (data.user.email !== prof.email) {
    return json({
      ok: false,
      pendiente: true,
      email: prof.email,
      mensaje: "El email de tu cuenta aún no coincide con el nuevo correo.",
    }, 200, req);
  }

  if (prof.email_confirmado === true) return json({ ok: true, confirmado: true }, 200, req);

  const { error: eUpd } = await admin
    .from("profesionales")
    .update({ email_confirmado: true })
    .eq("id", prof.id);
  if (eUpd) return json({ error: "No se pudo confirmar el email." }, 500, req);

  return json({ ok: true, confirmado: true }, 200, req);
}

serve(async (req) => {
  try {
    return await confirmarEmailRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});