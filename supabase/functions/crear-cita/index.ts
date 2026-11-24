import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { consultarDisponibilidad, getConfig } from "../_shared/disponibilidad.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { auditarCita } from "../_shared/auditoria.ts";

const schema = z.object({
  servicio_id: z.string().uuid(),
  profesional_id: z.string().uuid().optional().nullable(),
  start: z.string().datetime(),
  nombre_cliente: z.string().min(2).max(120),
  email_cliente: z.string().email().max(255),
  telefono_cliente: z.string().max(30).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
  website: z.string().max(0).optional(), // honeypot anti-spam
});

function rangeStr(startMs: number, endMs: number): string {
  return `["${new Date(startMs).toISOString()}","${new Date(endMs).toISOString()}")`;
}

export async function createCitaRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, req);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Datos inválidos", detalle: parsed.error.flatten() }, 400);
  }
  const d = parsed.data;

  // Honeypot anti-spam: si el campo oculto viene lleno, fingimos éxito.
  if (d.website) return json({ ok: true, cita: { id: "fake" } }, 200, req);

  const cfg = await getConfig();

  // Rate limit: máx 5 citas por email en 10 min.
  const ventanaMs = 10 * 60 * 1000;
  const { data: cliente } = await admin
    .from("clientes")
    .select("id")
    .eq("email", d.email_cliente.toLowerCase())
    .maybeSingle();
  if (cliente) {
    const { count } = await admin
      .from("citas")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", cliente.id)
      .gte("created_at", new Date(Date.now() - ventanaMs).toISOString());
    if ((count ?? 0) >= 5) {
      return json({ error: "Demasiadas solicitudes. Intenta en unos minutos." }, 429, req);
    }
  }

  const startMs = Date.parse(d.start);
  if (Number.isNaN(startMs)) return json({ error: "Fecha inválida" }, 400, req);

  const { data: servicio } = await admin
    .from("servicios")
    .select("id, nombre, duracion_min, buffer_min, precio")
    .eq("id", d.servicio_id)
    .single();
  if (!servicio) return json({ error: "Servicio no disponible" }, 400, req);

  // Validar margen de anticipación
  if (startMs < Date.now() + cfg.margen_anticipacion_horas * 3_600_000) {
    return json({ error: "Debes agendar con al menos la anticipación mínima." }, 400, req);
  }

  // Verificar disponibilidad real del horario elegido
  const disp = await consultarDisponibilidad({
    servicioId: d.servicio_id,
    profesionalId: d.profesional_id,
    start: startMs,
    end: startMs + servicio.duracion_min * 60_000,
  });

  const match = disp.slots.find((s) => Date.parse(s.start) === startMs);
  if (!match) {
    return json({ error: "El horario elegido ya no está disponible." }, 409, req);
  }
  const profesionalId = match.profesional_id;

  const { data: profesional } = await admin
    .from("profesionales")
    .select("id, nombre, email")
    .eq("id", profesionalId)
    .single();
  if (!profesional) return json({ error: "Datos del servicio no disponibles" }, 400, req);

  const bufferMs = servicio.buffer_min * 60_000;
  const endMs = startMs + servicio.duracion_min * 60_000;

  // Cliente: reutilizar por email o crear
  const { data: clienteEx } = await admin
    .from("clientes")
    .select("id")
    .eq("email", d.email_cliente.toLowerCase())
    .maybeSingle();
  let clienteId = clienteEx?.id ?? null;
  if (!clienteId) {
    const { data: nuevo, error: eNew } = await admin
      .from("clientes")
      .insert({
        nombre: d.nombre_cliente,
        email: d.email_cliente.toLowerCase(),
        telefono: d.telefono_cliente ?? null,
      })
      .select("id")
      .single();
    if (eNew) return json({ error: "No se pudo registrar el cliente" }, 500, req);
    clienteId = nuevo!.id;
  }

  // Aviso: si el cliente faltó a citas anteriores, lo informamos al profesional.
  const { count: noShows } = await admin
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", clienteId)
    .eq("estado", "no_show");
  const avisoNoShow = (noShows ?? 0) >= 1 ? { no_mostradas: noShows ?? 0, aviso: "Este cliente faltó en citas anteriores." } : null;

  const { data: cita, error: eIns } = await admin
    .from("citas")
    .insert({
      cliente_id: clienteId,
      profesional_id: profesionalId,
      servicio_id: servicio.id,
      rango_tiempo: rangeStr(startMs, endMs + bufferMs),
      precio_servicio: servicio.precio,
      duracion_min_servicio: servicio.duracion_min,
      notas: d.notas ?? null,
    })
    .select("*")
    .single();

  if (eIns) {
    if (String(eIns.message).includes("EXCLUDE") || String(eIns.code) === "23P01") {
      return json({ error: "Horario ocupado por otra cita." }, 409, req);
    }
    return json({ error: "No se pudo crear la cita" }, 500, req);
  }

  const { data: config } = await admin
    .from("config")
    .select("nombre_negocio, direccion")
    .single();

  const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;

  await auditarCita({ citaId: cita.id, estadoAnterior: null, estadoNuevo: cita.estado ?? "confirmada", hechoPor: "cliente" });
  // Notificaciones
  await enviarCorreo("cita_creada_cliente", {
    to: d.email_cliente,
    nombre: d.nombre_cliente,
    servicio: servicio.nombre,
    profesional: profesional.nombre,
    fecha: new Date(startMs).toISOString(),
    direccion: config?.direccion ?? "",
    link_gestion: link,
    negocio: config?.nombre_negocio ?? "Slotify",
  }).catch((e) => console.warn(JSON.stringify({ ts: new Date().toISOString(), nivel: "warn", area: "crear-cita", evento: "email_cliente_fallido", datos: { error: (e as Error).message } })));
  await enviarCorreo("cita_creada_profesional", {
    to: profesional.email,
    cliente: d.nombre_cliente,
    servicio: servicio.nombre,
    fecha: new Date(startMs).toISOString(),
    negocio: config?.nombre_negocio ?? "Slotify",
  }).catch((e) => console.warn(JSON.stringify({ ts: new Date().toISOString(), nivel: "warn", area: "crear-cita", evento: "email_profesional_fallido", datos: { error: (e as Error).message } })));

  return json({
    ok: true,
    cita: { ...cita, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() },
    link_gestion: link,
    aviso_cliente: avisoNoShow,
  }, 200, req);
}

serve(async (req) => {
  try {
    return await createCitaRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});
