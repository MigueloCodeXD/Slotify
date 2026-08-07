import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseService = createClient(
  supabaseUrl,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    const jwt = auth?.replace("Bearer ", "") ?? "";
    const supaCli = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: { user } } = await supaCli.auth.getUser(jwt);
    if (!user) return new Response(JSON.stringify({ error: "sin sesion" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const perfil = (await supaCli.from("profesionales").select("id, admin").eq("user_id", user.id).single()).data;
    if (!perfil) return new Response(JSON.stringify({ error: "no eres profesional" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json();
    const citaId = body?.cita_id;
    if (!citaId) return new Response(JSON.stringify({ error: "falta cita_id" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: cita, error: eCita } = await supaCli.from("citas").select("profesional_id").eq("id", citaId).single();
    if (eCita || !cita) throw new Error("cita no encontrada");
    if (!perfil.admin && cita.profesional_id !== perfil.id)
      return new Response(JSON.stringify({ error: "no es tu cita" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const { error } = await supaCli.from("avisos_cita").delete().eq("cita_id", citaId);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = (err as Error).message ?? "error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});