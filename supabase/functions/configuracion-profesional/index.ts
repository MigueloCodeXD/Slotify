import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  accion: z.enum(["listar_disponibilidad", "guardar_disponibilidad", "asignar_servicios", "listar_mis_servicios"]),
  dias: z
    .array(
      z.object({
        dia_semana: z.number().int().min(0).max(6),
        hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
        hora_fin: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .optional(),
  servicio_ids: z.array(z.string().uuid()).optional(),
});

export async function configProfRequest(req: Request): Promise<Response> {
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
  const d = parsed.data;

  switch (d.accion) {
    case "listar_disponibilidad": {
      const { data } = await admin
        .from("disponibilidad_profesional")
        .select("id, dia_semana, hora_inicio, hora_fin")
        .eq("profesional_id", prof.id)
        .order("dia_semana");
      return json({ dias: data ?? [] });
    }
    case "guardar_disponibilidad": {
      if (!d.dias) return json({ error: "Faltan días." }, 400);
      for (const dia of d.dias) {
        if (dia.hora_fin <= dia.hora_inicio) return json({ error: "Rango horario inválido." }, 400);
      }
      await admin.from("disponibilidad_profesional").delete().eq("profesional_id", prof.id);
      if (d.dias.length > 0) {
        const { error } = await admin.from("disponibilidad_profesional").insert(
          d.dias.map((x) => ({ ...x, profesional_id: prof.id }))
        );
        if (error) return json({ error: "No se pudo guardar la disponibilidad." }, 500);
      }
      return json({ ok: true });
    }
    case "listar_mis_servicios": {
      const { data } = await admin
        .from("profesional_servicios")
        .select("servicio_id")
        .eq("profesional_id", prof.id);
      return json({ servicio_ids: (data ?? []).map((x) => x.servicio_id) });
    }
    case "asignar_servicios": {
      if (!d.servicio_ids) return json({ error: "Faltan servicios." }, 400);
      await admin.from("profesional_servicios").delete().eq("profesional_id", prof.id);
      if (d.servicio_ids.length > 0) {
        const { error } = await admin.from("profesional_servicios").insert(
          d.servicio_ids.map((servicio_id) => ({ profesional_id: prof.id, servicio_id }))
        );
        if (error) return json({ error: "No se pudo asignar." }, 500);
      }
      return json({ ok: true });
    }
  }
}

serve(async (req) => {
  try {
    const res = await configProfRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});