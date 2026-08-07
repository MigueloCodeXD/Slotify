import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo } from "../_shared/auth.ts";
import { consultarDisponibilidad, getConfig } from "../_shared/disponibilidad.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { logInfo, logError } from "../_shared/logging.ts";

const HORAS_CONFIRMAR = 6;

const schema = z.object({
  servicio_id: z.string().uuid(),
  start: z.string().datetime(),
  profesional_id: z.string().uuid().optional().nullable(),
  cliente_id: z.string().uuid().optional(),
  email_cliente: z.string().email().max(255).optional(),
  nombre_cliente: z.string().min(2).max(120).optional(),
  telefono_cliente: z.string().max(30).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
});

function rangeStr(startMs: number, endMs: number): string {
  return `["${new Date(startMs).toISOString()}","${new Date(endMs).toISOString()}")`;
}

export async function crearCitaProfRequest(req: Request): Promise<Response> {
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

  const objetivo = await resolverProfesionalObjetivo(prof, d.profesional_id);
  if ("error" in objetivo) return objetivo.error;
  const target = objetivo.data;

  // Rate limit: máx 15 citas por profesional en 1 minuto (evita dobles envíos/abuso).
  const ventanaMs = 60 * 1000;
  const { count } = await admin
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("profesional_id", target.id)
    .gte("created_at", new Date(Date.now() - ventanaMs).toISOString());
  if ((count ?? 0) >= 15) {
    return json({ error: "Demasiadas solicitudes. Intenta en un momento." }, 429);
  }

  // Cliente: por id, o por email (reutiliza/crea)
  let clienteId = d.cliente_id ?? null;
  if (!clienteId) {
    if (!d.email_cliente || !d.nombre_cliente) {
      return json({ error: "Indica el cliente (id o email + nombre)." }, 400);
    }
    const { data: ex } = await admin
      .from("clientes")
      .select("id")
      .eq("email", d.email_cliente.toLowerCase())
      .maybeSingle();
    if (ex) {
      clienteId = ex.id;
    } else {
      const { data: nuevo, error: eNew } = await admin
        .from("clientes")
        .insert({ nombre: d.nombre_cliente, email: d.email_cliente.toLowerCase(), telefono: d.telefono_cliente ?? null })
        .select("id")
        .single();
      if (eNew) return json({ error: "No se pudo registrar el cliente." }, 500);
      clienteId = nuevo!.id;
    }
  }

  // Aviso: si el cliente faltó a citas anteriores, lo informamos al profesional.
  const { count: noShows } = await admin
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", clienteId)
    .eq("estado", "no_show");
  const avisoNoShow = (noShows ?? 0) >= 1 ? { no_mostradas: noShows ?? 0, aviso: "Este cliente faltó en citas anteriores." } : null;

  const startMs = Date.parse(d.start);
  if (Number.isNaN(startMs)) return json({ error: "Fecha inválida" }, 400);

  const { data: servicio } = await admin
    .from("servicios")
    .select("id, nombre, duracion_min, buffer_min, activo, precio")
    .eq("id", d.servicio_id)
    .single();
  if (!servicio || !servicio.activo) return json({ error: "Servicio no disponible" }, 400);

  // El profesional debe ofrecer el servicio (o el admin operando sobre él)
  if (target.rol !== "admin") {
    const { data: ps } = await admin
      .from("profesional_servicios")
      .select("profesional_id")
      .eq("profesional_id", target.id)
      .eq("servicio_id", d.servicio_id)
      .maybeSingle();
    if (!ps) return json({ error: `${target.nombre} no ofrece ese servicio.` }, 400);
  }

  const cfg = await getConfig();
  if (startMs < Date.now() + cfg.margen_anticipacion_horas * 3_600_000) {
    return json({ error: "El horario no cumple el margen de anticipación." }, 400);
  }

  const disp = await consultarDisponibilidad({
    servicioId: d.servicio_id,
    profesionalId: target.id,
    start: startMs,
    end: startMs + servicio.duracion_min * 60_000,
  });
  const match = disp.slots.find((s) => Date.parse(s.start) === startMs);
  if (!match) return json({ error: "El horario elegido ya no está disponible." }, 409);

  const endMs = startMs + servicio.duracion_min * 60_000;
  const bufferMs = servicio.buffer_min * 60_000;

  const { data: cita, error: eIns } = await admin
    .from("citas")
    .insert({
      cliente_id: clienteId,
      profesional_id: target.id,
      servicio_id: servicio.id,
      rango_tiempo: rangeStr(startMs, endMs + bufferMs),
      estado: "pendiente",
      precio_servicio: servicio.precio,
      duracion_min_servicio: servicio.duracion_min,
      notas: d.notas ?? null,
      confirmacion_pendiente: true,
      confirmacion_expira_at: new Date(Date.now() + HORAS_CONFIRMAR * 3_600_000).toISOString(),
    })
    .select("*")
    .single();
  if (eIns) {
    if (String(eIns.message).includes("EXCLUDE") || String(eIns.code) === "23P01") {
      return json({ error: "Horario ocupado por otra cita." }, 409);
    }
    return json({ error: "No se pudo crear la cita." }, 500);
  }

  const { data: cliente } = await admin.from("clientes").select("nombre, email").eq("id", clienteId).single();
  const { data: config } = await admin.from("config").select("nombre_negocio, direccion").single();

  const linkGestion = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;
  const linkConfirmar = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/confirmar?token=${cita.token_gestion}`;

  await enviarCorreo("cita_pendiente_confirmacion_cliente", {
    to: cliente?.email ?? "",
    nombre: cliente?.nombre ?? "Cliente",
    servicio: servicio.nombre,
    profesional: target.nombre,
    fecha: new Date(startMs).toISOString(),
    link_confirmar: linkConfirmar,
    link_gestion: linkGestion,
    negocio: config?.nombre_negocio ?? "Slotify",
  }).catch(() => {});

  logInfo("crear-cita-profesional", "cita_creada", {
    cita_id: cita.id,
    profesional_id: target.id,
    cliente_id: clienteId,
    servicio_id: servicio.id,
    estado: cita.estado,
  });

  return json({
    ok: true,
    cita: { ...cita, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() },
    confirmacion_expira_horas: HORAS_CONFIRMAR,
    link_confirmar: linkConfirmar,
    aviso_cliente: avisoNoShow,
  });
}

serve(async (req) => {
  try {
    const res = await crearCitaProfRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    logError("crear-cita-profesional", "excepcion", { mensaje: (err as Error).message });
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});
