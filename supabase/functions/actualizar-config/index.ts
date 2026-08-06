import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  nombre_negocio: z.string().min(1).max(120).optional(),
  zona_horaria: z.string().max(50).optional(),
  margen_anticipacion_horas: z.number().int().min(0).optional(),
  horas_limite_cancelacion: z.number().int().min(0).optional(),
  direccion: z.string().max(500).optional().nullable(),
  descripcion: z.string().max(2000).optional().nullable(),
});

export async function actualizarConfigRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof || prof.rol !== "admin") return json({ error: "Solo el administrador puede modificar la configuración." }, 403);

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
  if (d.nombre_negocio !== undefined) campos.nombre_negocio = d.nombre_negocio;
  if (d.zona_horaria !== undefined) campos.zona_horaria = d.zona_horaria;
  if (d.margen_anticipacion_horas !== undefined) campos.margen_anticipacion_horas = d.margen_anticipacion_horas;
  if (d.horas_limite_cancelacion !== undefined) campos.horas_limite_cancelacion = d.horas_limite_cancelacion;
  if (d.direccion !== undefined) campos.direccion = d.direccion;
  if (d.descripcion !== undefined) campos.descripcion = d.descripcion;

  const { data: fila } = await admin.from("config").select("id").limit(1).maybeSingle();
  if (fila) {
    const { error } = await admin.from("config").update(campos).eq("id", fila.id);
    if (error) return json({ error: "No se pudo actualizar la configuración." }, 500);
  } else {
    const { error: eIns } = await admin.from("config").insert({ ...campos, nombre_negocio: campos.nombre_negocio ?? "Slotify" });
    if (eIns) return json({ error: "No se pudo crear la configuración." }, 500);
  }

  return json({ ok: true });
}

serve(async (req) => {
  try {
    const res = await actualizarConfigRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});