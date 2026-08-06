import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { registrar } from "../_shared/logging.ts";

// Endpoint de salud: verifica que la función levante y que el proyecto responde.
export async function healthRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const inicio = Date.now();
  let db: "ok" | "error" = "ok";
  let errorDb: string | null = null;
  try {
    const { error } = await admin.from("config").select("id").limit(1).maybeSingle();
    if (error) {
      db = "error";
      errorDb = error.message;
    }
  } catch (e) {
    db = "error";
    errorDb = (e as Error).message;
  }

  registrar("health", db === "ok" ? "info" : "error", "health_check", { db });

  const cuerpo = {
    status: db === "ok" ? "ok" : "degraded",
    db,
    db_error: errorDb,
    hora: new Date().toISOString(),
    latencia_ms: Date.now() - inicio,
  };
  return json(cuerpo, db === "ok" ? 200 : 503);
}

serve(async (req) => {
  try {
    return await healthRequest(req);
  } catch (err) {
    registrar("health", "error", "health_excepcion", { mensaje: (err as Error).message });
    return new Response(JSON.stringify({ status: "error" }), { status: 500, headers: corsHeaders });
  }
});