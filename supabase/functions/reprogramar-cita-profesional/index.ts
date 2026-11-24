import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";
import { consultarDisponibilidad } from "../_shared/disponibilidad.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { auditarCita } from "../_shared/auditoria.ts";

const schema = z.object({
  cita_id: z.string().uuid(),
  nuevo_start: z.string().datetime(),
  profesional_id: z.string().uuid().optional().nullable(),
});

export async function reprogramarProfRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401, req);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, req);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400, req);

  const objetivo = await resolverProfesionalObjetivo(prof, parsed.data.profesional_id);
  if ("error" in objetivo) return objetivo.error;
  const target = objetivo.data;

  const { data: cita, error } = await admin
    .from("citas")
    .select("*, cliente:clientes(*), servicio:servicios(*), profesional:profesionales(*)")
    .eq("id", parsed.data.cita_id)
    .single();
  if (error || !cita) return json({ error: "No se encontró la cita." }, 404, req);
  if (cita.profesional_id !== target.id) return json({ error: "No puedes gestionar esa cita." }, 403, req);
  if (cita.estado !== "confirmada") return json({ error: "Esta cita ya no es reprogramable." }, 400, req);

  const nuevoStart = Date.parse(parsed.data.nuevo_start);
  if (Number.isNaN(nuevoStart)) return json({ error: "Fecha inválida" }, 400, req);

  const duracionMin = Number(cita.duracion_min_servicio ?? cita.servicio.duracion_min);
  const bufferMin = Number(cita.servicio.buffer_min ?? 0);

  const disp = await consultarDisponibilidad({
    servicioId: cita.servicio_id,
    profesionalId: cita.profesional_id,
    start: nuevoStart,
    end: nuevoStart + duracionMin * 60_000,
  });
  const match = disp.slots.find((s) => Date.parse(s.start) === nuevoStart);
  if (!match) {
    return json({ error: "El nuevo horario ya no está disponible. Es posible que no cumpla el margen de anticipación." }, 409, req);
  }

  const endMs = nuevoStart + duracionMin * 60_000 + bufferMin * 60_000;
  const nuevoRango = `["${new Date(nuevoStart).toISOString()}","${new Date(endMs).toISOString()}")`;

  const { error: eUp } = await admin
    .from("citas")
    .update({ rango_tiempo: nuevoRango })
    .eq("id", cita.id);
  if (eUp) return json({ error: "No se pudo reprogramar la cita." }, 500, req);
  await auditarCita({ citaId: cita.id, estadoAnterior: cita.estado, estadoNuevo: cita.estado, hechoPor: target.email, accion: "reprogramada_profesional", detalles: { antes: cita.rango_tiempo, despues: nuevoRango } }).catch(() => {});

  const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;
  const { data: cfgDir } = await admin.from("config").select("direccion").single();
  const direccion = (cfgDir?.direccion as string | null) ?? "";
  await enviarCorreo("cita_modificada_cliente", {
    to: cita.cliente.email,
    nombre: cita.cliente.nombre,
    servicio: cita.servicio.nombre,
    profesional: cita.profesional.nombre,
    fecha: new Date(nuevoStart).toISOString(),
    link_gestion: link,
    direccion,
  }).catch(() => {});
  await enviarCorreo("cita_modificada_profesional", {
    to: cita.profesional.email,
    cliente: cita.cliente.nombre,
    servicio: cita.servicio.nombre,
    fecha: new Date(nuevoStart).toISOString(),
    direccion,
  }).catch(() => {});

  return json({ ok: true }, 200, req);
}

serve(async (req) => {
  try {
    return await reprogramarProfRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});