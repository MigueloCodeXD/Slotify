import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  servicio_id: z.string().uuid().optional(),
  nombre: z.string().min(1).max(120).optional(),
  descripcion: z.string().max(500).optional().nullable(),
  categoria: z.string().max(60).optional().nullable(),
  precio: z.number().min(0).optional(),
  duracion_min: z.number().int().min(1).optional(),
  buffer_min: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
  profesionales_ids: z.array(z.string().uuid()).optional(),
});

export async function editarCatalogoRequest(req: Request): Promise<Response> {
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
  if (!parsed.success) return json({ error: "Datos inválidos", detalle: parsed.error.flatten() }, 400);
  const d = parsed.data;

  const campos: Record<string, unknown> = {};
  if (d.nombre !== undefined) campos.nombre = d.nombre;
  if (d.descripcion !== undefined) campos.descripcion = d.descripcion;
  if (d.categoria !== undefined) campos.categoria = d.categoria;
  if (d.precio !== undefined) campos.precio = d.precio;
  if (d.duracion_min !== undefined) campos.duracion_min = d.duracion_min;
  if (d.buffer_min !== undefined) campos.buffer_min = d.buffer_min;
  if (d.activo !== undefined) campos.activo = d.activo;

  let servicioId = d.servicio_id ?? null;
  if (d.servicio_id) {
    const { error } = await admin.from("servicios").update(campos).eq("id", d.servicio_id);
    if (error) return json({ error: "No se pudo actualizar el servicio." }, 500);
  } else {
    const { data, error } = await admin
      .from("servicios")
      .insert({ nombre: d.nombre ?? "Nuevo servicio", precio: d.precio ?? 0, duracion_min: d.duracion_min ?? 30 })
      .select("id")
      .single();
    if (error) return json({ error: "No se pudo crear el servicio." }, 500);
    servicioId = data!.id;
  }

  if (d.profesionales_ids) {
    await admin.from("profesional_servicios").delete().eq("servicio_id", servicioId);
    if (d.profesionales_ids.length > 0) {
      await admin.from("profesional_servicios").insert(
        d.profesionales_ids.map((pid) => ({ profesional_id: pid, servicio_id: servicioId! }))
      );
    }
  }

  return json({ ok: true, servicio_id: servicioId });
}

serve(async (req) => {
  try {
    const res = await editarCatalogoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});