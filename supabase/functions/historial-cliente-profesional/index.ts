import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({ cliente_id: z.string().uuid() });

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => new Date(norm(s)).toISOString();
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

export async function historialClienteRequest(req: Request): Promise<Response> {
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

  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nombre, email, telefono")
    .eq("id", parsed.data.cliente_id)
    .maybeSingle();
  if (!cliente) return json({ error: "No se encontró el cliente." }, 404);

  const { data: citas, error } = await admin
    .from("citas")
    .select("id, rango_tiempo, estado, servicio:servicios(id,nombre,precio,duracion_min)")
    .eq("profesional_id", prof.id)
    .eq("cliente_id", cliente.id)
    .order("rango_tiempo", { ascending: false })
    .limit(100);
  if (error) return json({ error: "No se pudo consultar el historial." }, 500);

  return json({
    ok: true,
    cliente,
    citas: (citas ?? []).map((c) => ({ ...c, ...parseRango(c.rango_tiempo as string), rango_tiempo: undefined })),
  });
}

serve(async (req) => {
  try {
    const res = await historialClienteRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});