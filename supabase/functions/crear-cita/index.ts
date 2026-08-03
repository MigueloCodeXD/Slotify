import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { consultarDisponibilidad, getConfig } from "../_shared/disponibilidad.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

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
    return json({ error: "Body inválido" }, 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Datos inválidos", detalle: parsed.error.flatten() }, 400);
  }
  const d = parsed.data;

  // Honeypot anti-spam: si el campo oculto viene lleno, fingimos éxito.
  if (d.website) return json({ ok: true, cita: { id: "fake" } });

  const cfg = await getConfig();

  // Rate limit: máx 5 citas por email en 10 min.
  const ventanaMs = 10 * 60 * 1000;
  const { data: cliente, error: eCl } = await admin
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
      return json({ error: "Demasiadas solicitudes. Intenta en unos minutos." }, 429);
    }
  }

  const startMs = Date.parse(d.start);
  if (Number.isNaN(startMs)) return json({ error: "Fecha inválida" }, 400);

  const { data: servicio } = await admin
    .from("servicios")
    .select("id, nombre, duracion_min, buffer_min")
    .eq("id", d.servicio_id)
    .single();
  if (!servicio) return json({ error: "Servicio no disponible" }, 400);

  // Validar margen de anticipación
  if (startMs < Date.now() + cfg.margen_anticipacion_horas * 3_600_000) {
    return json({ error: "Debes agendar con al menos la anticipación mínima." }, 400);
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
    return json({ error: "El horario elegido ya no está disponible." }, 409);
  }
  const profesionalId = match.profesional_id;

  const { data: profesional } = await admin
    .from("profesionales")
    .select("id, nombre, email")
    .eq("id", profesionalId)
    .single();
  if (!profesional) return json({ error: "Datos del servicio no disponibles" }, 400);

  const bufferMs = servicio.buffer_min * 60_000;
  const endMs = startMs + servicio.duracion_min * 60_000;

  // Cliente: reutilizar por email o crear
  const { data: clienteEx, error: eEx } = await admin
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
    if (eNew) return json({ error: "No se pudo registrar el cliente" }, 500);
    clienteId = nuevo!.id;
  }

  const { data: cita, error: eIns } = await admin
    .from("citas")
    .insert({
      cliente_id: clienteId,
      profesional_id: profesionalId,
      servicio_id: servicio.id,
      rango_tiempo: rangeStr(startMs, endMs + bufferMs),
      notas: d.notas ?? null,
    })
    .select("*")
    .single();

  if (eIns) {
    if (String(eIns.message).includes("EXCLUDE") || String(eIns.code) === "23P01") {
      return json({ error: "Horario ocupado por otra cita." }, 409);
    }
    return json({ error: "No se pudo crear la cita" }, 500);
  }

  const { data: config } = await admin
    .from("config")
    .select("nombre_negocio, direccion")
    .single();

  const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;

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
  }).catch(() => {});
  await enviarCorreo("cita_creada_profesional", {
    to: profesional.email,
    cliente: d.nombre_cliente,
    servicio: servicio.nombre,
    fecha: new Date(startMs).toISOString(),
    negocio: config?.nombre_negocio ?? "Slotify",
  }).catch(() => {});

  return json({
    ok: true,
    cita: { ...cita, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() },
    link_gestion: link,
  });
}

serve(async (req) => {
  const headers = { ...corsHeaders };
  try {
    const res = await createCitaRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers,
    });
  }
});
