import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";

const schema = z.object({
  accion: z.enum(["listar_disponibilidad", "guardar_disponibilidad", "asignar_servicios", "listar_mis_servicios", "listar_cargos"]),
  profesional_id: z.string().uuid().optional().nullable(),
  dias: z
    .array(
      z.object({
        dia_semana: z.number().int().min(0).max(6),
        hora_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        hora_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        pausa_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
        pausa_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
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

  const objetivo = await resolverProfesionalObjetivo(prof, d.profesional_id);
  if ("error" in objetivo) return objetivo.error;
  const target = objetivo.data;

  switch (d.accion) {
    case "listar_disponibilidad": {
      const { data } = await admin
        .from("disponibilidad_profesional")
        .select("id, dia_semana, hora_inicio, hora_fin, pausa_inicio, pausa_fin")
        .eq("profesional_id", target.id)
        .order("dia_semana");
      return json({
        dias: (data ?? []).map((x) => ({
          ...x,
          hora_inicio: x.hora_inicio.slice(0, 5),
          hora_fin: x.hora_fin.slice(0, 5),
          pausa_inicio: x.pausa_inicio ? x.pausa_inicio.slice(0, 5) : null,
          pausa_fin: x.pausa_fin ? x.pausa_fin.slice(0, 5) : null,
        })),
      });
    }
    case "guardar_disponibilidad": {
      if (!d.dias) return json({ error: "Faltan días." }, 400);
      for (const dia of d.dias) {
        if (dia.hora_fin <= dia.hora_inicio) return json({ error: "Rango horario inválido." }, 400);
        if (dia.pausa_inicio && dia.pausa_fin && dia.pausa_fin <= dia.pausa_inicio) {
          return json({ error: "La pausa es inválida." }, 400);
        }
      }
      await admin.from("disponibilidad_profesional").delete().eq("profesional_id", target.id);
      if (d.dias.length > 0) {
        const { error } = await admin.from("disponibilidad_profesional").insert(
          d.dias.map((x) => ({
            dia_semana: x.dia_semana,
            hora_inicio: x.hora_inicio.slice(0, 5),
            hora_fin: x.hora_fin.slice(0, 5),
            pausa_inicio: x.pausa_inicio ? x.pausa_inicio.slice(0, 5) : null,
            pausa_fin: x.pausa_fin ? x.pausa_fin.slice(0, 5) : null,
            profesional_id: target.id,
          }))
        );
        if (error) return json({ error: "No se pudo guardar la disponibilidad." }, 500);
      }
      return json({ ok: true });
    }
    case "listar_mis_servicios": {
      const { data } = await admin
        .from("profesional_servicios")
        .select("servicio_id")
        .eq("profesional_id", target.id);
      return json({ servicio_ids: (data ?? []).map((x) => x.servicio_id) });
    }
    case "listar_cargos": {
      const { data } = await admin.from("cargos").select("nombre").order("nombre");
      return json({ cargos: (data ?? []).map((x) => x.nombre) });
    }
    case "asignar_servicios": {
      if (!d.servicio_ids) return json({ error: "Faltan servicios." }, 400);
      // Un profesional solo puede ofrecer servicios cuyo cargo_requerido
      // coincida con su cargo (o servicios sin cargo requerido).
      const { data: servicios } = await admin
        .from("servicios")
        .select("id, cargo_requerido")
        .in("id", d.servicio_ids);
      const permitidos = (servicios ?? [])
        .filter((s) => !s.cargo_requerido || s.cargo_requerido === target.cargo)
        .map((s) => s.id);
      await admin.from("profesional_servicios").delete().eq("profesional_id", target.id);
      if (permitidos.length > 0) {
        const { error } = await admin.from("profesional_servicios").insert(
          permitidos.map((servicio_id) => ({ profesional_id: target.id, servicio_id }))
        );
        if (error) return json({ error: "No se pudo asignar." }, 500);
      }
      return json({ ok: true, asignados: permitidos.length });
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