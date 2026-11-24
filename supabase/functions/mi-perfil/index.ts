import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors } from "../_shared/cors.ts";
import { json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

export async function miPerfilRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401, req);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401, req);

  return json({
    profesional: {
      id: prof.id,
      nombre: prof.nombre,
      email: prof.email,
      rol: prof.rol,
      activo: prof.activo,
      telefono: prof.telefono,
      cargo: prof.cargo,
      cedula: prof.cedula,
      foto_url: prof.foto_url,
    },
  }, 200, req);
}

serve(async (req) => {
  try {
    return await miPerfilRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});