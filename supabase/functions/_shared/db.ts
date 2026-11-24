import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "./cors.ts";
import { getRequestId } from "./logging.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export const admin = createClient(supabaseUrl!, serviceRoleKey!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function json(data: unknown, status = 200, req?: Request): Response {
  const cors = req ? corsHeadersFor(req) : { "Access-Control-Allow-Origin": "*" };
  const rid = req ? getRequestId(req) : undefined;
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors, ...(rid ? { "x-request-id": rid } : {}) },
  });
}

// Garantiza que una categoría exista en la tabla `categorias` antes de
// asignarla a un servicio (la FK en servicios.categoria lo exige).
// Devuelve el nombre canónico (trim) o null si viene vacío.
export async function asegurarCategoria(nombre: string | null | undefined): Promise<string | null> {
  const limpio = (nombre ?? "").trim();
  if (!limpio) return null;
  const { error } = await admin
    .from("categorias")
    .upsert({ nombre: limpio }, { onConflict: "nombre", ignoreDuplicates: true });
  if (error) return null;
  return limpio;
}
