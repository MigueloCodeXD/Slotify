import { admin } from "./db.ts";

// Devuelve el user_id de Supabase Auth (jwt) o null si no hay sesión válida.
export async function getUserFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Resuelve la fila `profesionales` a partir del user_id de la sesión.
export async function getProfesionalByUser(userId: string) {
  const { data, error } = await admin
    .from("profesionales")
    .select("id, nombre, email, rol, activo, telefono, foto_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { data: null, error };
  return { data, error: null };
}

// Verifica que la llamada provenga del service_role (usado por los crons).
// Compara el token del header contra el service role de la plataforma.
export function esServiceRole(req: Request): boolean {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, "");
  const esperado = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!esperado) return false;
  return token.length === esperado.length && token === esperado;
}