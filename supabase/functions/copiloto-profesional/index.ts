import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json, asegurarCategoria } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { chatConHerramientas, type ToolDef } from "../_shared/gemini.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { consultarDisponibilidad, getConfig, citaConflicto } from "../_shared/disponibilidad.ts";
import { contextoHoy, contextoNegocio, hoyIso } from "../_shared/contexto.ts";
import { getTZ, dayStartUtc, diaLocalIso } from "../_shared/time.ts";

async function construirSistema(soloInfo: boolean, prof: { nombre: string; rol: string }): Promise<string> {
  const hoy = await contextoHoy();
  const negocio = await contextoNegocio();
  return `Eres el copiloto de un profesional en un negocio de citas (Slotify${negocio ? `: ${negocio}` : ""}).
Profesional autenticado: ${prof.nombre} (rol: ${prof.rol}).
${hoy}.
${soloInfo ? "MODO SOLO INFORMACIÓN: SOLO consultas y respuestas. NO crees bloqueos, NO canceles citas, NO envíes avisos, NO modifiques el catálogo, NO invites ni edites profesionales."
  : "Ayudas a gestionar su agenda mediante comandos."}
REGLAS:
- NUNCA inventes datos. Usa siempre las funciones disponibles.
- El profesional autenticado es quien pregunta; actúa solo sobre sus citas.
- Puedes registrar pagos (con registrar_pago), ver los mensajes del cliente de una cita (con consultar_mensajes) y enviar avisos al cliente (con enviar_aviso).
- Los cobros reflejan el estado de pago de cada cita (pendiente, parcial o pagado) y el anticipo; responde con esos datos cuando pregunten por dinero cobrado.
- El profesional puede configurar su propia disponibilidad semanal y los servicios que ofrece. Solo el admin puede modificar el catálogo, invitar profesionales, gestionar el equipo (ver/editar/desactivar/eliminar profesionales, asignarles servicios) y configurar el negocio.
- NUNCA preguntes al profesional por la fecha u hora actual: ya la conoces.
- Para fechas usa formato AAAA-MM-DD; para horas, ISO 8601.
- Responde breve y en español.`;
}

const herramientas: ToolDef[] = [
  {
    name: "consultar_agenda_dia",
    description: "Citas del profesional entre dos fechas (desde/hasta en AAAA-MM-DD). Si no conoces las fechas, usa las de hoy.",
    parameters: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD (opcional; por defecto hoy)" },
        hasta: { type: "string", description: "AAAA-MM-DD (opcional; por defecto hoy)" },
      },
    },
  },
  {
    name: "crear_cita_profesional",
    description: "Agenda una cita para un cliente (reutiliza el cliente si el email ya existe). La cita queda en estado PENDIENTE: el cliente debe confirmarla con el enlace que recibe por correo antes de 6 horas.",
    parameters: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        start: { type: "string", description: "Horario de inicio en ISO 8601" },
        email_cliente: { type: "string" },
        nombre_cliente: { type: "string" },
        telefono_cliente: { type: "string" },
        notas: { type: "string" },
      },
      required: ["servicio_id", "start", "email_cliente", "nombre_cliente"],
    },
  },
  {
    name: "reprogramar_cita_profesional",
    description: "Reprograma una cita confirmada del profesional a un nuevo horario y notifica al cliente.",
    parameters: {
      type: "object",
      properties: {
        cita_id: { type: "string" },
        nuevo_start: { type: "string", description: "Nuevo horario de inicio en ISO 8601" },
      },
      required: ["cita_id", "nuevo_start"],
    },
  },
  {
    name: "cambiar_estado_cita",
    description: "Cambia el estado de una cita del profesional (confirmada, completada, no_show o cancelada) y opcionalmente deja notas.",
    parameters: {
      type: "object",
      properties: {
        cita_id: { type: "string" },
        estado: { type: "string", enum: ["confirmada", "completada", "no_show", "cancelada"] },
        notas: { type: "string" },
      },
      required: ["cita_id", "estado"],
    },
  },
  {
    name: "consultar_catalogo",
    description: "Lista los servicios activos con su id, nombre, precio y duración.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "crear_bloqueo",
    description: "Bloquea un rango horario (ej. almuerzo, vacaciones). Para un solo día usa start y end del mismo día; para un rango de fechas usa fechas distintas en start y end. No puede solapar una cita existente.",
    parameters: {
      type: "object",
      properties: {
        start: { type: "string", description: "ISO 8601 inicio" },
        end: { type: "string", description: "ISO 8601 fin" },
        motivo: { type: "string" },
      },
      required: ["start", "end"],
    },
  },
  {
    name: "actualizar_bloqueo",
    description: "Modifica un bloqueo existente (rango y/o motivo). Si cambias el rango, no puede solapar una cita existente.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        start: { type: "string", description: "ISO 8601 inicio (opcional)" },
        end: { type: "string", description: "ISO 8601 fin (opcional)" },
        motivo: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "eliminar_bloqueo",
    description: "Elimina un bloqueo existente por su id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "cancelar_cita_profesional",
    description: "Cancela una cita del profesional y notifica al cliente.",
    parameters: {
      type: "object",
      properties: { cita_id: { type: "string" } },
      required: ["cita_id"],
    },
  },
  {
    name: "enviar_aviso",
    description: "Envía un mensaje al cliente de una cita (se guarda y notifica por correo).",
    parameters: {
      type: "object",
      properties: {
        cita_id: { type: "string" },
        mensaje: { type: "string" },
        es_publico_cliente: { type: "boolean" },
      },
      required: ["cita_id", "mensaje"],
    },
  },
  {
    name: "editar_catalogo",
    description: "Crea, actualiza o elimina un servicio del catálogo (solo el admin). Con 'eliminar' true borra el servicio si no tiene citas activas; si no, desactívalo con activo=false. Opcionalmente asigna profesionales con profesionales_ids.",
    parameters: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        nombre: { type: "string" },
        descripcion: { type: "string" },
        categoria: { type: "string" },
        precio: { type: "number" },
        duracion_min: { type: "number" },
        buffer_min: { type: "number" },
        activo: { type: "boolean" },
        eliminar: { type: "boolean" },
        profesionales_ids: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "consultar_historial_cliente",
    description: "Historial de citas del cliente en contexto con este profesional.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "invitar_profesional",
    description: "Invita a un nuevo profesional por email (solo el admin).",
    parameters: {
      type: "object",
      properties: { email: { type: "string" }, nombre: { type: "string" } },
      required: ["email", "nombre"],
    },
  },
  {
    name: "listar_profesionales",
    description: "Lista todos los profesionales del negocio: nombre, email, rol, si está activo, si vinculó su cuenta y cuántos servicios ofrece (solo el admin).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "editar_profesional",
    description: "Actualiza datos de un profesional: nombre, email, teléfono, rol o activo (solo el admin). No puedes desactivar tu propia cuenta ni degradar al último admin.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        nombre: { type: "string" },
        email: { type: "string" },
        telefono: { type: "string" },
        rol: { type: "string", enum: ["admin", "profesional"] },
        activo: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "eliminar_profesional",
    description: "Elimina un profesional del negocio (solo el admin). Se rechaza si tiene citas activas o es el último admin; en ese caso sugiere desactivarlo.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "asignar_servicios_profesional",
    description: "Reemplaza la lista de servicios que ofrece un profesional (solo el admin). Pasa una lista vacía para quitar todos.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        servicio_ids: { type: "array", items: { type: "string" } },
      },
      required: ["id", "servicio_ids"],
    },
  },
  {
    name: "reenviar_invitacion_profesional",
    description: "Reenvía el correo de invitación a un profesional que aún no vinculó su cuenta (solo el admin).",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "consultar_mi_configuracion",
    description: "Muestra tu disponibilidad semanal (días y horarios) y los servicios que ofreces.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "guardar_disponibilidad_semanal",
    description: "Reemplaza tu disponibilidad semanal. Cada día (0=domingo...6=sábado) con hora_inicio y hora_fin en formato HH:MM. Pasa un array vacío para quitar toda tu disponibilidad.",
    parameters: {
      type: "object",
      properties: {
        dias: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dia_semana: { type: "number", description: "0=domingo, 1=lunes, ..., 6=sábado" },
              hora_inicio: { type: "string", description: "HH:MM" },
              hora_fin: { type: "string", description: "HH:MM" },
            },
          },
        },
      },
      required: ["dias"],
    },
  },
  {
    name: "asignar_mis_servicios",
    description: "Reemplaza la lista de servicios que ofreces. Pasa una lista vacía para no ofrecer ninguno.",
    parameters: {
      type: "object",
      properties: { servicio_ids: { type: "array", items: { type: "string" } } },
      required: ["servicio_ids"],
    },
  },
  {
    name: "consultar_negocio",
    description: "Muestra la configuración del negocio (nombre, zona horaria, márgenes, dirección).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "configurar_negocio",
    description: "Actualiza la configuración del negocio (nombre, zona horaria, margen de anticipación en horas, límite de cancelación en horas, dirección). Solo el admin.",
    parameters: {
      type: "object",
      properties: {
        nombre_negocio: { type: "string" },
        zona_horaria: { type: "string" },
        margen_anticipacion_horas: { type: "number" },
        horas_limite_cancelacion: { type: "number" },
        direccion: { type: "string" },
      },
    },
  },
  {
    name: "resumen_negocio",
    description: "Resumen del negocio/profesional: citas de hoy, próximas citas, bloqueos de hoy, estadísticas e ingresos del mes y montos cobrado/pendiente por cobrar según el estado de pago.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "consultar_mensajes",
    description: "Consulta los mensajes de una cita (si cita_id va vacío, lista todos los hilos de conversación del profesional). Devuelve el hilo de avisos con su emisor (cliente o profesional) para leer la conversación con un cliente.",
    parameters: {
      type: "object",
      properties: { cita_id: { type: "string", description: "ID de la cita (opcional)" } },
    },
  },
  {
    name: "registrar_pago",
    description: "Registra un pago de una cita del profesional. El monto no puede superar el valor pendiente (precio menos abonos acumulados); si lo cubre, la cita queda 'pagado', si no 'parcial'. Método: efectivo, tarjeta, transferencia u otro.",
    parameters: {
      type: "object",
      properties: {
        cita_id: { type: "string" },
        monto: { type: "number", description: "Monto a registrar, mayor a 0 y sin superar el pendiente" },
        metodo: { type: "string", enum: ["efectivo", "tarjeta", "transferencia", "otro"] },
        otro: { type: "string", description: "Texto si el método es 'otro'" },
      },
      required: ["cita_id", "monto", "metodo"],
    },
  },
];

export async function copilotoRequest(req: Request): Promise<Response> {
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
  const parsed = z
    .object({
      mensaje: z.string().max(800),
      cliente_id: z.string().uuid().optional(),
      modo: z.enum(["gestion", "info"]).optional(),
      historial: z
        .array(
          z.object({
            role: z.enum(["user", "model"]),
            text: z.string().max(2000),
          })
        )
        .max(20)
        .optional(),
    })
    .safeParse(body);
  if (!parsed.success) return json({ error: "Mensaje inválido" }, 400);

  const esAdmin = prof.rol === "admin";
  const soloInfo = parsed.data.modo === "info";
  const herramientasActivas = soloInfo
    ? herramientas.filter(
        (h) =>
          ![
            "crear_bloqueo",
            "actualizar_bloqueo",
            "eliminar_bloqueo",
            "cancelar_cita_profesional",
            "enviar_aviso",
            "editar_catalogo",
            "invitar_profesional",
            "editar_profesional",
            "eliminar_profesional",
            "asignar_servicios_profesional",
            "reenviar_invitacion_profesional",
            "crear_cita_profesional",
            "reprogramar_cita_profesional",
            "cambiar_estado_cita",
            "registrar_pago",
            "guardar_disponibilidad_semanal",
            "asignar_mis_servicios",
            "configurar_negocio",
          ].includes(h.name)
      )
    : herramientas;

  let contextoCliente: { id: string; nombre: string } | null = null;
  if (parsed.data.cliente_id) {
    const { data: cliente } = await admin
      .from("clientes")
      .select("id, nombre, email")
      .eq("id", parsed.data.cliente_id)
      .maybeSingle();
    if (!cliente) return json({ error: "Cliente no encontrado." }, 404);
    const { count } = await admin
      .from("citas")
      .select("id", { count: "exact", head: true })
      .eq("profesional_id", prof.id)
      .eq("cliente_id", cliente.id);
    if ((count ?? 0) === 0) return json({ error: "No puedes consultar ese cliente." }, 403);
    contextoCliente = { id: cliente.id, nombre: cliente.nombre };
  }

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    consultar_agenda_dia: async (args) => {
      const tz = await getTZ();
      const hoy = await hoyIso();
      const desde = String(args.desde ?? hoy);
      const hasta = String(args.hasta ?? desde);
      const desdeMs = dayStartUtc(Date.parse(`${desde}T12:00:00Z`), tz);
      const hastaMs = dayStartUtc(Date.parse(`${hasta}T12:00:00Z`), tz) + 24 * 3600 * 1000;
      const ventana = `["${new Date(desdeMs).toISOString()}","${new Date(hastaMs).toISOString()}")`;
      const [citasRes, bloqueosRes] = await Promise.all([
        admin
          .from("citas")
          .select("id, rango_tiempo, estado, servicio:servicios(nombre), cliente:clientes(nombre,email,telefono)")
          .eq("profesional_id", prof.id)
          .neq("estado", "cancelada")
          .filter("rango_tiempo", "ov", ventana),
        admin
          .from("bloqueos")
          .select("id, rango_tiempo, motivo")
          .eq("profesional_id", prof.id)
          .filter("rango_tiempo", "ov", ventana),
      ]);
      const citas = (citasRes.data ?? []).map((c) => ({ ...c, rango_tiempo: parseRango(c.rango_tiempo as string) }));
      const bloqueos = (bloqueosRes.data ?? []).map((b) => ({ id: b.id, motivo: b.motivo, rango_tiempo: parseRango(b.rango_tiempo as string) }));
      return { citas, bloqueos, timezone: tz };
    },
    consultar_historial_cliente: async () => {
      if (!contextoCliente) return { error: "No hay cliente en contexto." };
      const { data } = await admin
        .from("citas")
        .select("id, rango_tiempo, estado, servicio:servicios(nombre), notas")
        .eq("profesional_id", prof.id)
        .eq("cliente_id", contextoCliente.id)
        .order("rango_tiempo", { ascending: false })
        .limit(50);
      return { cliente: contextoCliente, citas: (data ?? []).map((c) => ({ ...c, rango_tiempo: parseRango(c.rango_tiempo as string) })) };
    },
    crear_bloqueo: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const start = Date.parse(String(args.start ?? ""));
      const end = Date.parse(String(args.end ?? ""));
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return { error: "Rango inválido." };
      const conflicto = await citaConflicto({ profesionalId: prof.id, start, end });
      if (conflicto) {
        return {
          error: "El bloqueo solapa una cita existente. Ajusta el rango o gestiona la cita primero.",
          cita: { id: conflicto.id, estado: conflicto.estado, servicio: conflicto.servicio?.nombre ?? null },
        };
      }
      const { error } = await admin.from("bloqueos").insert({
        profesional_id: prof.id,
        rango_tiempo: `["${new Date(start).toISOString()}","${new Date(end).toISOString()}")`,
        motivo: String(args.motivo ?? "").slice(0, 200) || null,
      });
      if (error) return { error: "No se pudo crear el bloqueo." };
      return { ok: true };
    },
    actualizar_bloqueo: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const id = String(args.id ?? "");
      const { data: bloqueo } = await admin
        .from("bloqueos")
        .select("id, profesional_id, rango_tiempo, motivo")
        .eq("id", id)
        .single();
      if (!bloqueo) return { error: "Bloqueo no encontrado." };
      if (bloqueo.profesional_id !== prof.id) return { error: "No puedes gestionar ese bloqueo." };

      const campos: Record<string, unknown> = {};
      const startStr = args.start !== undefined ? String(args.start) : null;
      const endStr = args.end !== undefined ? String(args.end) : null;
      if (startStr !== null || endStr !== null) {
        const start = startStr !== null ? Date.parse(startStr) : NaN;
        const end = endStr !== null ? Date.parse(endStr) : NaN;
        if (Number.isNaN(start) && startStr !== null) return { error: "Horario de inicio inválido." };
        if (Number.isNaN(end) && endStr !== null) return { error: "Horario de fin inválido." };
        const rangoActual = parseRango(bloqueo.rango_tiempo as string);
        const s = Number.isNaN(start) ? Date.parse(rangoActual.start) : start;
        const e = Number.isNaN(end) ? Date.parse(rangoActual.end) : end;
        if (e <= s) return { error: "Rango inválido." };
        const conflicto = await citaConflicto({ profesionalId: prof.id, start: s, end: e });
        if (conflicto) {
          return {
            error: "El bloqueo solapa una cita existente.",
            cita: { id: conflicto.id, estado: conflicto.estado, servicio: conflicto.servicio?.nombre ?? null },
          };
        }
        campos.rango_tiempo = `["${new Date(s).toISOString()}","${new Date(e).toISOString()}")`;
      }
      if (args.motivo !== undefined) campos.motivo = args.motivo ? String(args.motivo).slice(0, 200) : null;
      if (Object.keys(campos).length === 0) return { ok: true };
      const { error } = await admin.from("bloqueos").update(campos).eq("id", id);
      if (error) return { error: "No se pudo actualizar el bloqueo." };
      return { ok: true };
    },
    eliminar_bloqueo: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const id = String(args.id ?? "");
      const { data: bloqueo } = await admin.from("bloqueos").select("id, profesional_id").eq("id", id).single();
      if (!bloqueo) return { error: "Bloqueo no encontrado." };
      if (bloqueo.profesional_id !== prof.id) return { error: "No puedes gestionar ese bloqueo." };
      const { error } = await admin.from("bloqueos").delete().eq("id", id);
      if (error) return { error: "No se pudo eliminar el bloqueo." };
      return { ok: true };
    },
    consultar_catalogo: async () => {
      const { data } = await admin.from("servicios").select("id, nombre, descripcion, precio, duracion_min, buffer_min, categoria").eq("activo", true);
      return { servicios: data ?? [] };
    },
    crear_cita_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const schema = z.object({
        servicio_id: z.string().uuid(),
        start: z.string(),
        email_cliente: z.string().email().max(255),
        nombre_cliente: z.string().min(2).max(120),
        telefono_cliente: z.string().max(30).optional().nullable(),
        notas: z.string().max(500).optional().nullable(),
      });
      const parsed = schema.safeParse(args);
      if (!parsed.success) return { error: "Faltan datos para agendar (servicio, horario, nombre y email del cliente)." };
      const d = parsed.data;

      const cfg = await getConfig();
      const startMs = Date.parse(d.start);
      if (Number.isNaN(startMs)) return { error: "Horario inválido." };
      if (startMs < Date.now() + cfg.margen_anticipacion_horas * 3_600_000) {
        return { error: "El horario no cumple el margen de anticipación." };
      }

      const { data: servicio } = await admin.from("servicios").select("id, nombre, duracion_min, buffer_min, activo").eq("id", d.servicio_id).single();
      if (!servicio || !servicio.activo) return { error: "Servicio no disponible." };

      if (prof.rol !== "admin") {
        const { data: ps } = await admin
          .from("profesional_servicios")
          .select("profesional_id")
          .eq("profesional_id", prof.id)
          .eq("servicio_id", d.servicio_id)
          .maybeSingle();
        if (!ps) return { error: "No ofreces ese servicio." };
      }

      const disp = await consultarDisponibilidad({
        servicioId: d.servicio_id,
        profesionalId: prof.id,
        start: startMs,
        end: startMs + servicio.duracion_min * 60_000,
      });
      const match = disp.slots.find((s) => Date.parse(s.start) === startMs);
      if (!match) return { error: "Ese horario ya no está disponible." };

      const { data: cliente } = await admin.from("clientes").select("id").eq("email", d.email_cliente.toLowerCase()).maybeSingle();
      let clienteId = cliente?.id ?? null;
      if (!clienteId) {
        const { data: nuevo, error: eNew } = await admin
          .from("clientes")
          .insert({ nombre: d.nombre_cliente, email: d.email_cliente.toLowerCase(), telefono: d.telefono_cliente ?? null })
          .select("id")
          .single();
        if (eNew || !nuevo) return { error: "No se pudo registrar al cliente." };
        clienteId = nuevo!.id;
      }

      const endMs = startMs + servicio.duracion_min * 60_000;
      const bufferMs = servicio.buffer_min * 60_000;
      const HORAS_CONFIRMAR = 6;
      const { data: cita, error: eIns } = await admin
        .from("citas")
        .insert({
          cliente_id: clienteId,
          profesional_id: prof.id,
          servicio_id: servicio.id,
          rango_tiempo: `["${new Date(startMs).toISOString()}","${new Date(endMs + bufferMs).toISOString()}")`,
          estado: "pendiente",
          notas: d.notas ?? null,
          confirmacion_pendiente: true,
          confirmacion_expira_at: new Date(Date.now() + HORAS_CONFIRMAR * 3_600_000).toISOString(),
        })
        .select("*")
        .single();
      if (eIns) {
        if (String(eIns.message).includes("EXCLUDE") || String(eIns.code) === "23P01") {
          return { error: "Ese horario se acaba de ocupar." };
        }
        return { error: "No se pudo crear la cita." };
      }

      const linkGestion = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;
      const linkConfirmar = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/confirmar?token=${cita.token_gestion}`;
      const { data: config } = await admin.from("config").select("nombre_negocio, direccion").single();
      await enviarCorreo("cita_pendiente_confirmacion_cliente", {
        to: d.email_cliente,
        nombre: d.nombre_cliente,
        servicio: servicio.nombre,
        profesional: prof.nombre,
        fecha: new Date(startMs).toISOString(),
        link_confirmar: linkConfirmar,
        link_gestion: linkGestion,
        negocio: config?.nombre_negocio ?? "Slotify",
      }).catch(() => {});
      return {
        ok: true,
        cita_id: cita.id,
        servicio: servicio.nombre,
        horario: new Date(startMs).toISOString(),
        estado: "pendiente",
        confirmacion_expira_horas: HORAS_CONFIRMAR,
        link_confirmar: linkConfirmar,
      };
    },
    reprogramar_cita_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const citaId = String(args.cita_id ?? "");
      const nuevoStartMs = Date.parse(String(args.nuevo_start ?? ""));
      if (!citaId || Number.isNaN(nuevoStartMs)) return { error: "Faltan cita_id o el nuevo horario." };

      const { data: cita, error } = await admin
        .from("citas")
        .select("*, cliente:clientes(*), servicio:servicios(*), profesional:profesionales(*)")
        .eq("id", citaId)
        .single();
      if (error || !cita) return { error: "Cita no encontrada." };
      if (cita.profesional_id !== prof.id) return { error: "No puedes gestionar esa cita." };
      if (cita.estado !== "confirmada") return { error: "Esta cita ya no es reprogramable." };

      const cfg = await getConfig();
      if (nuevoStartMs < Date.now() + cfg.margen_anticipacion_horas * 3_600_000) {
        return { error: "La nueva fecha no cumple el margen de anticipación." };
      }
      const disp = await consultarDisponibilidad({
        servicioId: cita.servicio_id,
        profesionalId: cita.profesional_id,
        start: nuevoStartMs,
        end: nuevoStartMs + cita.servicio.duracion_min * 60_000,
      });
      const match = disp.slots.find((s) => Date.parse(s.start) === nuevoStartMs);
      if (!match) return { error: "El nuevo horario ya no está disponible." };

      const endMs = nuevoStartMs + cita.servicio.duracion_min * 60_000 + cita.servicio.buffer_min * 60_000;
      const nuevoRango = `["${new Date(nuevoStartMs).toISOString()}","${new Date(endMs).toISOString()}")`;
      const { error: eUp } = await admin.from("citas").update({ rango_tiempo: nuevoRango }).eq("id", cita.id);
      if (eUp) return { error: "No se pudo reprogramar la cita." };

      const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;
      await enviarCorreo("cita_modificada_cliente", {
        to: cita.cliente.email,
        nombre: cita.cliente.nombre,
        servicio: cita.servicio.nombre,
        profesional: cita.profesional.nombre,
        fecha: new Date(nuevoStartMs).toISOString(),
        link_gestion: link,
      }).catch(() => {});
      await enviarCorreo("cita_modificada_profesional", {
        to: cita.profesional.email,
        cliente: cita.cliente.nombre,
        servicio: cita.servicio.nombre,
        fecha: new Date(nuevoStartMs).toISOString(),
      }).catch(() => {});
      return { ok: true, nueva_fecha: new Date(nuevoStartMs).toISOString() };
    },
    cambiar_estado_cita: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const citaId = String(args.cita_id ?? "");
      const estado = String(args.estado ?? "");
      if (!citaId || !["confirmada", "completada", "no_show", "cancelada"].includes(estado)) {
        return { error: "Faltan cita_id o el estado es inválido." };
      }
      const { data: cita } = await admin.from("citas").select("id, profesional_id").eq("id", citaId).single();
      if (!cita) return { error: "Cita no encontrada." };
      if (cita.profesional_id !== prof.id) return { error: "No puedes gestionar esa cita." };

      const campos: Record<string, unknown> = { estado, confirmacion_pendiente: false };
      if (estado === "confirmada") {
        campos.confirmado_at = new Date().toISOString();
        campos.confirmacion_expira_at = null;
      }
      if (args.notas !== undefined) campos.notas = String(args.notas).slice(0, 500);
      const { error: eUp } = await admin.from("citas").update(campos).eq("id", citaId);
      if (eUp) return { error: "No se pudo actualizar la cita." };
      return { ok: true };
    },
    cancelar_cita_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const { data: cita, error } = await admin
        .from("citas")
        .select("*, cliente:clientes(*), servicio:servicios(*), profesional:profesionales(*)")
        .eq("id", String(args.cita_id ?? ""))
        .single();
      if (error || !cita) return { error: "Cita no encontrada." };
      if (cita.profesional_id !== prof.id) return { error: "No puedes gestionar esa cita." };
      if (cita.estado !== "confirmada") return { error: "Esta cita ya no es cancelable." };
      const { error: eUp } = await admin.from("citas").update({ estado: "cancelada" }).eq("id", cita.id);
      if (eUp) return { error: "No se pudo cancelar." };
      const rango = parseRango(cita.rango_tiempo as string);
      const cliente = ((cita.cliente as unknown as { email: string; nombre: string }[])[0]);
      const servicio = ((cita.servicio as unknown as { nombre: string }[])[0]);
      const profesional = ((cita.profesional as unknown as { nombre: string }[])[0]);
      await enviarCorreo("cita_cancelada_cliente", {
        to: cliente.email,
        nombre: cliente.nombre,
        servicio: servicio.nombre,
        profesional: profesional.nombre,
        fecha: new Date(rango.start).toISOString(),
      }).catch(() => {});
      return { ok: true };
    },
    enviar_aviso: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const { data: cita } = await admin
        .from("citas")
        .select("id, profesional_id, token_gestion, cliente:clientes(*)")
        .eq("id", String(args.cita_id ?? ""))
        .single();
      if (!cita) return { error: "Cita no encontrada." };
      if (cita.profesional_id !== prof.id && prof.rol !== "admin") return { error: "No puedes enviar avisos ahí." };
      const publico = (args.es_publico_cliente as boolean | undefined) ?? true;
      const { error } = await admin.from("avisos_cita").insert({
        cita_id: cita.id,
        profesional_id: prof.id,
        mensaje: String(args.mensaje ?? "").slice(0, 500),
        es_publico_cliente: publico,
        emisor: "profesional",
      });
      if (error) return { error: "No se pudo enviar el aviso." };
      if (publico) {
        await enviarCorreo("aviso_profesional_cliente", {
          to: (cita.cliente as unknown as { email: string }[])[0].email,
          nombre: (cita.cliente as unknown as { nombre: string }[])[0].nombre,
          mensaje: String(args.mensaje ?? ""),
          link_gestion: `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`,
        }).catch(() => {});
      }
      return { ok: true };
    },
    editar_catalogo: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      if (!esAdmin) return { error: "Solo el administrador puede modificar el catálogo." };
      const schema = z.object({
        servicio_id: z.string().uuid().optional(),
        nombre: z.string().min(1).max(120).optional(),
        descripcion: z.string().max(500).optional().nullable(),
        categoria: z.string().max(60).optional().nullable(),
        precio: z.number().min(0).optional(),
        duracion_min: z.number().int().min(1).optional(),
        buffer_min: z.number().int().min(0).optional(),
        activo: z.boolean().optional(),
        eliminar: z.boolean().optional(),
        profesionales_ids: z.array(z.string().uuid()).optional(),
      });
      const parsed = schema.safeParse(args);
      if (!parsed.success) return { error: "Datos inválidos." };
      const d = parsed.data;
      const servicioId = d.servicio_id ?? null;

      if (servicioId && d.eliminar) {
        const { count } = await admin
          .from("citas")
          .select("id", { count: "exact", head: true })
          .eq("servicio_id", servicioId)
          .in("estado", ["confirmada", "pendiente"]);
        if ((count ?? 0) > 0) {
          return { error: "No se puede eliminar: hay citas activas. Desactívalo con activo=false." };
        }
        const { error: eDel } = await admin.from("servicios").delete().eq("id", servicioId);
        if (eDel) return { error: "No se pudo eliminar el servicio." };
        await admin.from("profesional_servicios").delete().eq("servicio_id", servicioId);
        return { ok: true, eliminado: true };
      }

      if (
        d.nombre === undefined && d.descripcion === undefined && d.categoria === undefined &&
        d.precio === undefined && d.duracion_min === undefined && d.buffer_min === undefined &&
        d.activo === undefined && !servicioId && !d.profesionales_ids
      ) {
        return { error: "Sin cambios." };
      }

      const campos: Record<string, unknown> = {};
      if (d.nombre !== undefined) campos.nombre = d.nombre;
      if (d.descripcion !== undefined) campos.descripcion = d.descripcion;
      if (d.categoria !== undefined) campos.categoria = await asegurarCategoria(d.categoria);
      if (d.precio !== undefined) campos.precio = d.precio;
      if (d.duracion_min !== undefined) campos.duracion_min = d.duracion_min;
      if (d.buffer_min !== undefined) campos.buffer_min = d.buffer_min;
      if (d.activo !== undefined) campos.activo = d.activo;

      let targetId = servicioId;
      if (targetId) {
        const { error } = await admin.from("servicios").update(campos).eq("id", targetId);
        if (error) return { error: "No se pudo actualizar el servicio." };
      } else {
        const { data, error } = await admin
          .from("servicios")
          .insert({ nombre: d.nombre ?? "Nuevo servicio", precio: d.precio ?? 0, duracion_min: d.duracion_min ?? 30 })
          .select("id")
          .single();
        if (error || !data) return { error: "No se pudo crear el servicio." };
        targetId = data!.id;
      }

      const ids = d.profesionales_ids;
      if (ids) {
        await admin.from("profesional_servicios").delete().eq("servicio_id", targetId);
        if (ids.length > 0) {
          await admin.from("profesional_servicios").insert(ids.map((pid) => ({ profesional_id: pid, servicio_id: targetId! })));
        }
      } else if (!servicioId) {
        await admin.from("profesional_servicios").insert({ profesional_id: prof.id, servicio_id: targetId! });
      }
      return { ok: true, servicio_id: targetId };
    },
    invitar_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      if (!esAdmin) return { error: "Solo el administrador puede invitar." };
      const email = String(args.email ?? "").toLowerCase();
      const nombre = String(args.nombre ?? "");
      if (!/.+@.+\..+/.test(email) || nombre.length < 2) return { error: "Email o nombre inválidos." };
      const { data: existente } = await admin.from("profesionales").select("id").eq("email", email).maybeSingle();
      if (existente) return { error: "Ese email ya existe." };
      const { data: profNuevo, error } = await admin
        .from("profesionales")
        .insert({ nombre, email, rol: "profesional" })
        .select("id")
        .single();
      if (error || !profNuevo) return { error: "No se pudo invitar." };
      const { data: inv } = await admin
        .from("invitaciones")
        .insert({ profesional_id: profNuevo!.id, creado_por: prof.id })
        .select("token")
        .single();
      await enviarCorreo("invitacion_profesional", {
        to: email,
        nombre,
        link_activacion: `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/activar-cuenta?token=${inv?.token}`,
      }).catch(() => {});
      return { ok: true };
    },
    listar_profesionales: async () => {
      if (!esAdmin) return { error: "Solo el administrador puede gestionar el equipo." };
      const [profsRes, invRes, servRes] = await Promise.all([
        admin.from("profesionales").select("id, nombre, email, telefono, rol, activo, user_id").order("nombre"),
        admin.from("invitaciones").select("profesional_id, expira_at").eq("usado", false).gt("expira_at", new Date().toISOString()),
        admin.from("profesional_servicios").select("profesional_id"),
      ]);
      const pendiente = new Set((invRes.data ?? []).map((i) => i.profesional_id));
      const nServ: Record<string, number> = {};
      for (const s of servRes.data ?? []) nServ[s.profesional_id] = (nServ[s.profesional_id] ?? 0) + 1;
      return {
        profesionales: (profsRes.data ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          email: p.email,
          rol: p.rol,
          activo: p.activo,
          vinculado: Boolean(p.user_id),
          servicios: nServ[p.id] ?? 0,
          invitacion_pendiente: pendiente.has(p.id),
        })),
      };
    },
    editar_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      if (!esAdmin) return { error: "Solo el administrador puede editar profesionales." };
      const id = String(args.id ?? "");
      const campos: Record<string, unknown> = {};
      if (args.nombre !== undefined) campos.nombre = String(args.nombre);
      if (args.telefono !== undefined) campos.telefono = args.telefono ? String(args.telefono) : null;
      if (args.email !== undefined) {
        const email = String(args.email).toLowerCase();
        campos.email = email;
      }
      if (args.rol !== undefined) campos.rol = args.rol;
      if (args.activo !== undefined) campos.activo = Boolean(args.activo);
      if (Object.keys(campos).length === 0) return { error: "No hay campos que editar." };

      const { data: prof } = await admin.from("profesionales").select("id, rol, activo, user_id, email, nombre").eq("id", id).single();
      if (!prof) return { error: "Profesional no encontrado." };
      if (campos.email) {
        const { data: dup } = await admin.from("profesionales").select("id").eq("email", campos.email).neq("id", id).maybeSingle();
        if (dup) return { error: "Ese email ya lo usa otro profesional." };
      }
      if (campos.rol === "profesional" && prof.rol === "admin") {
        const { data: admins } = await admin.from("profesionales").select("id").eq("rol", "admin").eq("activo", true);
        if ((admins ?? []).length <= 1) return { error: "No puedes degradar al último administrador." };
      }
      if (campos.activo === false && id === prof.id) return { error: "No puedes desactivar tu propia cuenta." };
      const { error } = await admin.from("profesionales").update(campos).eq("id", id);
      if (error) return { error: "No se pudo actualizar el profesional." };
      if (campos.rol !== undefined && prof.user_id) {
        await admin.auth.admin.updateUserById(prof.user_id, {
          user_metadata: { nombre: (campos.nombre as string) ?? prof.nombre, rol: campos.rol as string },
        }).catch(() => {});
      }
      return { ok: true };
    },
    eliminar_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      if (!esAdmin) return { error: "Solo el administrador puede eliminar profesionales." };
      const id = String(args.id ?? "");
      if (id === prof.id) return { error: "No puedes eliminar tu propia cuenta." };
      const { data: profEli } = await admin.from("profesionales").select("id, rol").eq("id", id).single();
      if (!profEli) return { error: "Profesional no encontrado." };
      const { data: citas } = await admin.from("citas").select("id").eq("profesional_id", id).in("estado", ["confirmada", "pendiente"]).limit(1);
      if ((citas ?? []).length > 0) return { error: "No se puede eliminar: tiene citas activas. Mejor desactívalo." };
      if (profEli.rol === "admin") {
        const { data: admins } = await admin.from("profesionales").select("id").eq("rol", "admin").eq("activo", true);
        if ((admins ?? []).length <= 1) return { error: "No puedes eliminar al último administrador." };
      }
      const { error } = await admin.from("profesionales").delete().eq("id", id);
      if (error) return { error: "No se pudo eliminar el profesional." };
      return { ok: true };
    },
    asignar_servicios_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      if (!esAdmin) return { error: "Solo el administrador puede asignar servicios." };
      const id = String(args.id ?? "");
      const ids = (args.servicio_ids as string[]) ?? [];
      const { data: profEli } = await admin.from("profesionales").select("id").eq("id", id).single();
      if (!profEli) return { error: "Profesional no encontrado." };
      await admin.from("profesional_servicios").delete().eq("profesional_id", id);
      if (ids.length > 0) {
        const { error } = await admin.from("profesional_servicios").insert(ids.map((sid) => ({ profesional_id: id, servicio_id: sid })));
        if (error) return { error: "No se pudieron asignar los servicios." };
      }
      return { ok: true };
    },
    reenviar_invitacion_profesional: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      if (!esAdmin) return { error: "Solo el administrador puede reenviar invitaciones." };
      const id = String(args.id ?? "");
      const { data: profEli } = await admin.from("profesionales").select("id, nombre, email, user_id").eq("id", id).single();
      if (!profEli) return { error: "Profesional no encontrado." };
      if (profEli.user_id) return { error: "Este profesional ya vinculó su cuenta." };
      const { data: invExistente } = await admin.from("invitaciones").select("id").eq("profesional_id", id).eq("usado", false).maybeSingle();
      let token: string;
      if (invExistente) {
        const nuevoToken = crypto.randomUUID();
        const { data: inv } = await admin.from("invitaciones").update({ token: nuevoToken, expira_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString() }).eq("id", invExistente.id).select("token").single();
        token = inv?.token ?? nuevoToken;
      } else {
        const { data: inv } = await admin.from("invitaciones").insert({ profesional_id: id, creado_por: prof.id }).select("token").single();
        token = inv?.token ?? "";
      }
      await enviarCorreo("invitacion_profesional", {
        to: profEli.email,
        nombre: profEli.nombre,
        link_activacion: `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/activar-cuenta?token=${token}`,
      }).catch(() => {});
      return { ok: true };
    },
    consultar_mi_configuracion: async () => {
      const [dispRes, servRes] = await Promise.all([
        admin
          .from("disponibilidad_profesional")
          .select("id, dia_semana, hora_inicio, hora_fin")
          .eq("profesional_id", prof.id)
          .order("dia_semana"),
        admin
          .from("profesional_servicios")
          .select("servicio:servicios(id, nombre)")
          .eq("profesional_id", prof.id),
      ]);
      const dias = (dispRes.data ?? []).map((x) => ({
        dia_semana: x.dia_semana,
        hora_inicio: String(x.hora_inicio).slice(0, 5),
        hora_fin: String(x.hora_fin).slice(0, 5),
      }));
      const servicios = (servRes.data ?? [])
        .map((x) => (x.servicio as unknown as { id: string; nombre: string } | null))
        .filter((s): s is { id: string; nombre: string } => Boolean(s));
      return { dias, servicios };
    },
    guardar_disponibilidad_semanal: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const schema = z.object({
        dias: z.array(
          z.object({
            dia_semana: z.number().int().min(0).max(6),
            hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
            hora_fin: z.string().regex(/^\d{2}:\d{2}$/),
          })
        ),
      });
      const parsed = schema.safeParse(args);
      if (!parsed.success) return { error: "Datos inválidos (dias requerido)." };
      for (const dia of parsed.data.dias) {
        if (dia.hora_fin <= dia.hora_inicio) return { error: `Rango horario inválido el día ${dia.dia_semana}.` };
      }
      await admin.from("disponibilidad_profesional").delete().eq("profesional_id", prof.id);
      if (parsed.data.dias.length > 0) {
        const { error } = await admin.from("disponibilidad_profesional").insert(
          parsed.data.dias.map((x) => ({
            dia_semana: x.dia_semana,
            hora_inicio: x.hora_inicio.slice(0, 5),
            hora_fin: x.hora_fin.slice(0, 5),
            profesional_id: prof.id,
          }))
        );
        if (error) return { error: "No se pudo guardar la disponibilidad." };
      }
      return { ok: true };
    },
    asignar_mis_servicios: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const schema = z.object({ servicio_ids: z.array(z.string().uuid()) });
      const parsed = schema.safeParse(args);
      if (!parsed.success) return { error: "Datos inválidos (servicio_ids requerido)." };
      await admin.from("profesional_servicios").delete().eq("profesional_id", prof.id);
      if (parsed.data.servicio_ids.length > 0) {
        const { error } = await admin.from("profesional_servicios").insert(
          parsed.data.servicio_ids.map((servicio_id) => ({ profesional_id: prof.id, servicio_id }))
        );
        if (error) return { error: "No se pudo asignar." };
      }
      return { ok: true, asignados: parsed.data.servicio_ids.length };
    },
    consultar_negocio: async () => {
      const { data } = await admin
        .from("config")
        .select("nombre_negocio, zona_horaria, margen_anticipacion_horas, horas_limite_cancelacion, direccion")
        .single();
      return data ?? {};
    },
    configurar_negocio: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      if (!esAdmin) return { error: "Solo el administrador puede configurar el negocio." };
      const schema = z.object({
        nombre_negocio: z.string().min(1).max(120).optional(),
        zona_horaria: z.string().max(50).optional(),
        margen_anticipacion_horas: z.number().int().min(0).optional(),
        horas_limite_cancelacion: z.number().int().min(0).optional(),
        direccion: z.string().max(500).optional().nullable(),
      });
      const parsed = schema.safeParse(args);
      if (!parsed.success) return { error: "Datos inválidos." };
      const campos: Record<string, unknown> = {};
      const d = parsed.data;
      if (d.nombre_negocio !== undefined) campos.nombre_negocio = d.nombre_negocio;
      if (d.zona_horaria !== undefined) campos.zona_horaria = d.zona_horaria;
      if (d.margen_anticipacion_horas !== undefined) campos.margen_anticipacion_horas = d.margen_anticipacion_horas;
      if (d.horas_limite_cancelacion !== undefined) campos.horas_limite_cancelacion = d.horas_limite_cancelacion;
      if (d.direccion !== undefined) campos.direccion = d.direccion;
      if (Object.keys(campos).length === 0) return { error: "Sin cambios." };
      const { data: fila } = await admin.from("config").select("id").limit(1).maybeSingle();
      if (fila) {
        const { error } = await admin.from("config").update(campos).eq("id", fila.id);
        if (error) return { error: "No se pudo actualizar la configuración." };
      } else {
        const { error: eIns } = await admin.from("config").insert({ ...campos, nombre_negocio: campos.nombre_negocio ?? "Slotify" });
        if (eIns) return { error: "No se pudo crear la configuración." };
      }
      return { ok: true };
    },
    consultar_mensajes: async (args) => {
      const citaId = args && args.cita_id ? String(args.cita_id) : null;
      let q = admin.from("avisos_cita").select(
        "id, cita_id, profesional_id, mensaje, emisor, created_at, cita:citas(id, estado, rango_tiempo, servicio:servicios(nombre), cliente:clientes(nombre))"
      );
      if (prof.rol !== "admin") q = q.eq("profesional_id", prof.id);
      if (citaId) q = q.eq("cita_id", citaId);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) return { error: "No se pudieron cargar los mensajes." };
      const porCita = new Map<string, { cita: unknown; mensajes: unknown[] }>();
      for (const av of (data ?? []) as {
        cita_id: string;
        id: string;
        mensaje: string;
        emisor: string;
        created_at: string;
        cita: unknown;
      }[]) {
        let c = porCita.get(av.cita_id);
        if (!c) {
          c = { cita: av.cita, mensajes: [] };
          porCita.set(av.cita_id, c);
        }
        c.mensajes.push({ id: av.id, mensaje: av.mensaje, emisor: av.emisor, created_at: av.created_at });
      }
      const conversaciones = Array.from(porCita.entries()).map(([citaId_, c]) => ({
        cita_id: citaId_,
        cita: c.cita,
        mensajes: c.mensajes,
      }));
      return { conversaciones };
    },
    registrar_pago: async (args) => {
      if (soloInfo) return { error: "Modo información: no se permiten acciones." };
      const schema = z.object({
        cita_id: z.string().uuid(),
        monto: z.number().min(0.01),
        metodo: z.enum(["efectivo", "tarjeta", "transferencia", "otro"]),
        otro: z.string().max(40).optional().nullable(),
      });
      const parsed = schema.safeParse(args);
      if (!parsed.success) return { error: "Datos de pago inválidos (monto, método y cita_id)." };
      const d = parsed.data;
      const { data: cita, error: eCita } = await admin
        .from("citas")
        .select("id, anticipo, profesional_id, estado_pago, precio_servicio, servicio:servicios(precio)")
        .eq("id", d.cita_id)
        .single();
      if (eCita || !cita) return { error: "Cita no encontrada." };
      if (cita.profesional_id !== prof.id && prof.rol !== "admin") {
        return { error: "No puedes registrar pagos de esa cita." };
      }
      if (cita.estado_pago === "pagado") return { error: "La cita ya está pagada." };
      const srv = Array.isArray(cita.servicio) ? cita.servicio[0] : cita.servicio;
      const precio = Number(cita.precio_servicio ?? (srv as { precio?: number } | undefined)?.precio ?? 0);
      const anticipoAnterior = Number(cita.anticipo ?? 0);
      const pendiente = Math.max(0, precio - anticipoAnterior);
      if (d.monto > pendiente) return { error: `El monto no puede superar el pendiente ($${pendiente.toFixed(2)}).` };
      const nuevoAnticipo = anticipoAnterior + d.monto;
      const estado = nuevoAnticipo >= precio ? "pagado" : "parcial";
      const metodoFinal = d.metodo === "otro" ? (d.otro ?? "otro").trim() : d.metodo;
      const { error: ePago } = await admin.from("pagos").insert({
        cita_id: cita.id,
        monto: d.monto,
        metodo: metodoFinal,
        usuario: prof.nombre,
      });
      if (ePago) return { error: "No se pudo registrar el pago." };
      const { error: eUp } = await admin.from("citas").update({ anticipo: nuevoAnticipo, estado_pago: estado }).eq("id", cita.id);
      if (eUp) return { error: "No se pudo actualizar la cita." };
      return { ok: true, anticipo: nuevoAnticipo, estado_pago: estado };
    },
    resumen_negocio: async () => {
      const tz = await getTZ();
      const DIA_MS = 24 * 3600 * 1000;
      const hoy = diaLocalIso(Date.now(), tz);
      const hoyInicioMs = dayStartUtc(Date.now(), tz);
      const diaFinMs = hoyInicioMs + DIA_MS;
      const hoyVentana = `["${new Date(hoyInicioMs).toISOString()}","${new Date(diaFinMs).toISOString()}")`;
      const mes = hoy.slice(0, 7);
      const mesInicioMs = dayStartUtc(Date.parse(`${mes}-01T12:00:00Z`), tz);
      const proxMes = (() => {
        const d = new Date(mesInicioMs + 32 * DIA_MS);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      })();
      const mesFinMs = dayStartUtc(Date.parse(`${proxMes}-01T12:00:00Z`), tz);
      const mesVentana = `["${new Date(mesInicioMs).toISOString()}","${new Date(mesFinMs).toISOString()}")`;
      const proximaVentana = `["${new Date(hoyInicioMs).toISOString()}","${new Date(diaFinMs + 8 * DIA_MS).toISOString()}")`;
      const base = "id, rango_tiempo, estado, estado_pago, anticipo, precio_servicio, servicio:servicios(id,nombre,precio,duracion_min), cliente:clientes(nombre,email)";
      const [hoyRes, proxRes, mesRes, bloqueosRes] = await Promise.all([
        admin.from("citas").select(base).eq("profesional_id", prof.id).filter("rango_tiempo", "ov", hoyVentana),
        admin
          .from("citas")
          .select(base)
          .eq("profesional_id", prof.id)
          .eq("estado", "confirmada")
          .filter("rango_tiempo", "ov", proximaVentana)
          .order("rango_tiempo")
          .limit(8),
        admin.from("citas").select(base).eq("profesional_id", prof.id).filter("rango_tiempo", "ov", mesVentana),
        admin.from("bloqueos").select("id, rango_tiempo, motivo").eq("profesional_id", prof.id).filter("rango_tiempo", "ov", hoyVentana),
      ]);
      const fmt = (c: { rango_tiempo: string; estado: string; cliente?: unknown; servicio?: unknown }) => ({
        ...parseRango(c.rango_tiempo),
        estado: c.estado,
        cliente: (c.cliente as unknown as { nombre?: string } | null)?.nombre ?? null,
        servicio: (c.servicio as unknown as { nombre?: string } | null)?.nombre ?? null,
      });
      const citasHoy = ((hoyRes.data ?? []) as unknown[])
        .filter((c) => (c as { estado: string }).estado !== "cancelada")
        .map((c) => fmt(c as never));
      const canceladasHoy = ((hoyRes.data ?? []) as { estado: string }[]).filter((c) => c.estado === "cancelada").length;
      const proximas = ((proxRes.data ?? []) as never[]).map((c) => fmt(c as never));
      const bloqueos_hoy = ((bloqueosRes.data ?? []) as { rango_tiempo: string; motivo: string | null }[]).map((b) => ({
        ...parseRango(b.rango_tiempo),
        motivo: b.motivo,
      }));
      const cuenta = { confirmada: 0, pendiente: 0, completada: 0, cancelada: 0, no_show: 0 };
      let ingresos = 0;
      let cobrado = 0;
      let pendiente_cobrar = 0;
      for (const c of (mesRes.data ?? []) as {
        estado: string;
        estado_pago?: string | null;
        anticipo?: number | null;
        servicio?: unknown;
      }[]) {
        const e = c.estado as keyof typeof cuenta;
        if (e in cuenta) cuenta[e]++;
        if (e === "confirmada" || e === "completada") {
          ingresos += Number(((c.servicio as unknown as { precio?: number } | null)?.precio) ?? 0);
        }
        if (e === "cancelada") continue;
        const precio = Number((c.servicio as unknown as { precio?: number } | null)?.precio ?? 0);
        const ante = Number(c.anticipo ?? 0);
        const ep = (c.estado_pago as string | null | undefined) ?? "pendiente";
        if (ep === "pagado") cobrado += precio;
        else if (ep === "parcial") cobrado += ante;
        else pendiente_cobrar += Math.max(0, precio - ante);
      }
      return {
        hoy: { fecha: hoy, citas: citasHoy, total_confirmadas: citasHoy.filter((c) => c.estado === "confirmada").length, canceladas: canceladasHoy },
        proximas,
        bloqueos_hoy,
        mes: { mes, cuenta, ingresos, cobrado, pendiente_cobrar, total: (mesRes.data ?? []).length },
        timezone: tz,
      };
    },
  };

  const mensajesIniciales: { role: "user" | "model"; text: string }[] = [...(parsed.data.historial ?? [])];
  if (contextoCliente) {
    mensajesIniciales.push({
      role: "user",
      text: `Estoy viendo la ficha del cliente "${contextoCliente.nombre}" (id ${contextoCliente.id}). Usa consultar_historial_cliente para ver su historial conmigo y darme un resumen o recomendaciones.`,
    });
  }
  mensajesIniciales.push({ role: "user", text: parsed.data.mensaje });

  const { respuesta, fallback } = await chatConHerramientas({
    sistema: await construirSistema(soloInfo, prof),
    mensajes: mensajesIniciales,
    herramientas: herramientasActivas,
    handlers,
    tipo: "profesional",
  });

  if (fallback) return json({ respuesta, fallback: true });
  return json({ respuesta, fallback: false });
}

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => new Date(norm(s)).toISOString();
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

serve(async (req) => {
  try {
    const res = await copilotoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});