import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { chatConHerramientas, type ToolDef } from "../_shared/gemini.ts";
import { consultarDisponibilidad, getConfig } from "../_shared/disponibilidad.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { crearSesionCliente, verificarSesionCliente } from "../_shared/token.ts";

const SISTEMA = `Eres el asistente de agendamiento de un negocio (Slotify). Ayudas al cliente a
elegir servicio, profesional y horario, y a agendar o gestionar citas.
REGLAS ESTRICTAS:
- NUNCA inventes precios, horarios, nombres de profesionales ni disponibilidad. Si necesitas ese dato, llama a la función correspondiente.
- Una cita es para UN solo servicio.
- Para crear una cita pide nombre y email del cliente, y confirma el horario antes de llamar a crear_cita.
- Si el cliente quiere ver "todas sus citas", indica que debe solicitar un código de acceso a /mis-citas y luego pasar el código.
- Para cancelar o reprogramar, pide el enlace/token que tiene en su correo.
Responde siempre de forma breve y en español.`;

const herramientas: ToolDef[] = [
  {
    name: "consultar_catalogo",
    description: "Lista los servicios activos con su precio y duración.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "consultar_disponibilidad",
    description: "Huecos disponibles (inicio/fin) para un servicio, opcionalmente para un profesional, en una fecha (AAAA-MM-DD).",
    parameters: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        fecha: { type: "string", description: "Fecha en formato AAAA-MM-DD" },
        profesional_id: { type: "string" },
      },
      required: ["servicio_id", "fecha"],
    },
  },
  {
    name: "crear_cita",
    description: "Agenda una cita confirmada para un solo servicio.",
    parameters: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        start: { type: "string", description: "Horario de inicio en ISO 8601 (de consultar_disponibilidad)" },
        profesional_id: { type: "string" },
        nombre_cliente: { type: "string" },
        email_cliente: { type: "string" },
        telefono_cliente: { type: "string" },
      },
      required: ["servicio_id", "start", "nombre_cliente", "email_cliente"],
    },
  },
  {
    name: "consultar_mis_citas",
    description: "Lista las citas del cliente usando la sesión obtenida al ingresar su código en /mis-citas.",
    parameters: {
      type: "object",
      properties: { sesion: { type: "string" } },
      required: ["sesion"],
    },
  },
  {
    name: "cancelar_cita",
    description: "Cancela una cita usando su token_gestion.",
    parameters: {
      type: "object",
      properties: { token_gestion: { type: "string" } },
      required: ["token_gestion"],
    },
  },
  {
    name: "reprogramar_cita",
    description: "Reprograma una cita usando su token_gestion y el nuevo horario.",
    parameters: {
      type: "object",
      properties: {
        token_gestion: { type: "string" },
        nuevo_start: { type: "string" },
      },
      required: ["token_gestion", "nuevo_start"],
    },
  },
];

export async function asistenteRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = z.object({ mensaje: z.string().max(800) }).safeParse(body);
  if (!parsed.success) return json({ error: "Mensaje inválido" }, 400);

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    consultar_catalogo: async () => {
      const { data } = await admin.from("servicios").select("id, nombre, descripcion, precio, duracion_min, buffer_min, categoria").eq("activo", true);
      return { servicios: data ?? [] };
    },
    consultar_disponibilidad: async (args) => {
      const servicio_id = String(args.servicio_id ?? "");
      const fecha = String(args.fecha ?? "");
      const profesional_id = args.profesional_id ? String(args.profesional_id) : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida" };
      const startMs = Date.parse(`${fecha}T05:00:00Z`);
      const { slots } = await consultarDisponibilidad({
        servicioId: servicio_id,
        profesionalId: profesional_id,
        start: startMs,
        end: startMs + 24 * 3600 * 1000,
      });
      return { horarios: slots };
    },
    crear_cita: async (args) => {
      return await crearCita(args);
    },
    consultar_mis_citas: async (args) => {
      const sesion = await verificarSesionCliente(String(args.sesion ?? ""));
      if (!sesion) return { error: "Sesión inválida." };
      const { data: cliente } = await admin.from("clientes").select("id").eq("email", sesion.email).maybeSingle();
      if (!cliente) return { citas: [] };
      const { data } = await admin
        .from("citas")
        .select("id, rango_tiempo, estado, servicio:servicios(nombre) ")
        .eq("cliente_id", cliente.id);
      return { citas: data ?? [] };
    },
    cancelar_cita: async (args) => {
      const token = String(args.token_gestion ?? "");
      const { data: cita } = await admin
        .from("citas")
        .select("*, cliente:clientes(*), servicio:servicios(*), profesional:profesionales(*)")
        .eq("token_gestion", token)
        .single();
      if (!cita) return { error: "Cita no encontrada." };
      if (cita.estado !== "confirmada") return { error: "La cita ya no es cancelable." };
      const cfg = await getConfig();
      const rango = parseRango(cita.rango_tiempo as string);
      if (rango.start - Date.now() < cfg.horas_limite_cancelacion * 3_600_000) return { error: "Ya no puedes cancelar." };
      await admin.from("citas").update({ estado: "cancelada" }).eq("id", cita.id);
      await enviarCorreo("cita_cancelada_cliente", {
        to: cita.cliente.email,
        nombre: cita.cliente.nombre,
        servicio: cita.servicio.nombre,
        profesional: cita.profesional.nombre,
        fecha: new Date(rango.start).toISOString(),
      }).catch(() => {});
      return { ok: true };
    },
    reprogramar_cita: async (args) => {
      return { error: "Para reprogramar, usa el enlace de tu correo." };
    },
  };

  const { respuesta, fallback } = await chatConHerramientas({
    sistema: SISTEMA,
    mensajes: [{ role: "user", text: parsed.data.mensaje }],
    herramientas,
    handlers,
    tipo: "cliente",
  });

  if (fallback) {
    return json({ respuesta: "", fallback: true });
  }
  return json({ respuesta, fallback: false });
}

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: number; end: number } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => Date.parse(norm(s));
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

async function crearCita(args: Record<string, unknown>): Promise<unknown> {
  const schema = z.object({
    servicio_id: z.string().uuid(),
    start: z.string(),
    profesional_id: z.string().uuid().optional().nullable(),
    nombre_cliente: z.string().min(2).max(120),
    email_cliente: z.string().email().max(255),
    telefono_cliente: z.string().max(30).optional().nullable(),
  });
  const parsed = schema.safeParse(args);
  if (!parsed.success) return { error: "Faltan datos para agendar (nombre y email del cliente)." };
  const d = parsed.data;

  const cfg = await getConfig();
  const startMs = Date.parse(d.start);
  if (Number.isNaN(startMs)) return { error: "Horario inválido." };
  if (startMs < Date.now() + cfg.margen_anticipacion_horas * 3_600_000) {
    return { error: "El horario no cumple el margen de anticipación." };
  }

  const { data: servicio } = await admin.from("servicios").select("id, nombre, duracion_min, buffer_min").eq("id", d.servicio_id).single();
  if (!servicio) return { error: "Servicio no disponible." };

  const disp = await consultarDisponibilidad({
    servicioId: d.servicio_id,
    profesionalId: d.profesional_id,
    start: startMs,
    end: startMs + servicio.duracion_min * 60_000,
  });
  const match = disp.slots.find((s) => Date.parse(s.start) === startMs);
  if (!match) return { error: "Ese horario ya no está disponible." };
  const profesionalId = match.profesional_id;

  const { data: profesional } = await admin.from("profesionales").select("id, nombre, email").eq("id", profesionalId).single();
  if (!profesional) return { error: "Servicio no disponible." };

  const bufferMs = servicio.buffer_min * 60_000;
  const endMs = startMs + servicio.duracion_min * 60_000;

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

  const { data: cita, error: eIns } = await admin
    .from("citas")
    .insert({
      cliente_id: clienteId,
      profesional_id: profesionalId,
      servicio_id: servicio.id,
      rango_tiempo: `["${new Date(startMs).toISOString()}","${new Date(endMs + bufferMs).toISOString()}")`,
    })
    .select("*")
    .single();
  if (eIns) {
    if (String(eIns.code) === "23P01") return { error: "Ese horario se acaba de ocupar." };
    return { error: "No se pudo crear la cita." };
  }

  const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/mi-cita?token=${cita.token_gestion}`;
  await enviarCorreo("cita_creada_cliente", {
    to: d.email_cliente,
    nombre: d.nombre_cliente,
    servicio: servicio.nombre,
    profesional: profesional.nombre,
    fecha: new Date(startMs).toISOString(),
    link_gestion: link,
    direccion: "",
  }).catch(() => {});
  await enviarCorreo("cita_creada_profesional", {
    to: profesional.email,
    cliente: d.nombre_cliente,
    servicio: servicio.nombre,
    fecha: new Date(startMs).toISOString(),
  }).catch(() => {});

  return { ok: true, cita_id: cita.id, servicio: servicio.nombre, profesional: profesional.nombre, horario: new Date(startMs).toISOString() };
}

serve(async (req) => {
  try {
    const res = await asistenteRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});