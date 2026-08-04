import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { chatConHerramientas, type ToolDef } from "../_shared/gemini.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

function sistema(soloInfo: boolean): string {
  return `Eres el copiloto de un profesional en un negocio de citas (Slotify).
${soloInfo ? "MODO SOLO INFORMACIÓN: SOLO consultas y respuestas. NO crees bloqueos, NO canceles citas, NO envíes avisos, NO modifiques el catálogo ni invites profesionales."
  : "Ayudas a gestionar su agenda mediante comandos."}
REGLAS:
- NUNCA inventes datos. Usa siempre las funciones disponibles.
- El profesional autenticado es quien pregunta; actúa solo sobre sus citas.
- Para fechas usa formato AAAA-MM-DD; para horas, ISO 8601.
- Responde breve y en español.`;
}

const herramientas: ToolDef[] = [
  {
    name: "consultar_agenda_dia",
    description: "Citas del profesional entre dos fechas (desde/hasta en AAAA-MM-DD).",
    parameters: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
      },
      required: ["desde", "hasta"],
    },
  },
  {
    name: "crear_bloqueo",
    description: "Bloquea un rango horario (ej. almuerzo, vacaciones).",
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
    description: "Crea o actualiza un servicio del catálogo (solo el admin).",
    parameters: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        nombre: { type: "string" },
        descripcion: { type: "string" },
        precio: { type: "number" },
        duracion_min: { type: "number" },
        activo: { type: "boolean" },
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
    })
    .safeParse(body);
  if (!parsed.success) return json({ error: "Mensaje inválido" }, 400);

  const esAdmin = prof.rol === "admin";
  const soloInfo = parsed.data.modo === "info";
  const herramientasActivas = soloInfo
    ? herramientas.filter(
        (h) => !["crear_bloqueo", "cancelar_cita_profesional", "enviar_aviso", "editar_catalogo", "invitar_profesional"].includes(h.name)
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
      const desde = String(args.desde ?? "");
      const hasta = String(args.hasta ?? "");
      const desdeMs = Date.parse(`${desde}T05:00:00Z`);
      const hastaMs = Date.parse(`${hasta}T05:00:00Z`) + 24 * 3600 * 1000;
      const ventana = `["${new Date(desdeMs).toISOString()}","${new Date(hastaMs).toISOString()}")`;
      const { data } = await admin
        .from("citas")
        .select("id, rango_tiempo, estado, servicio:servicios(nombre), cliente:clientes(nombre,email,telefono)")
        .eq("profesional_id", prof.id)
        .filter("rango_tiempo", "ov", ventana);
      const citas = (data ?? []).map((c) => ({ ...c, rango_tiempo: parseRango(c.rango_tiempo as string) }));
      return { citas };
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
      const { error } = await admin.from("bloqueos").insert({
        profesional_id: prof.id,
        rango_tiempo: `["${new Date(start).toISOString()}","${new Date(end).toISOString()}")`,
        motivo: String(args.motivo ?? "").slice(0, 200) || null,
      });
      if (error) return { error: "No se pudo crear el bloqueo." };
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
      if (cita.profesional_id !== prof.id) return { error: "No puedes enviar avisos ahí." };
      const publico = (args.es_publico_cliente as boolean | undefined) ?? true;
      const { error } = await admin.from("avisos_cita").insert({
        cita_id: cita.id,
        profesional_id: prof.id,
        mensaje: String(args.mensaje ?? "").slice(0, 500),
        es_publico_cliente: publico,
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
      const servicioId = args.servicio_id ? String(args.servicio_id) : null;
      const campos: Record<string, unknown> = {};
      if (args.nombre !== undefined) campos.nombre = String(args.nombre);
      if (args.descripcion !== undefined) campos.descripcion = args.descripcion ? String(args.descripcion) : null;
      if (args.precio !== undefined) campos.precio = Number(args.precio);
      if (args.duracion_min !== undefined) campos.duracion_min = Number(args.duracion_min);
      if (args.activo !== undefined) campos.activo = Boolean(args.activo);
      if (servicioId) {
        const { error } = await admin.from("servicios").update(campos).eq("id", servicioId);
        if (error) return { error: "No se pudo actualizar." };
      } else {
        const { data, error } = await admin
          .from("servicios")
          .insert({ nombre: String(args.nombre ?? "Nuevo servicio"), precio: Number(args.precio ?? 0), duracion_min: Number(args.duracion_min ?? 30) })
          .select("id")
          .single();
        if (error || !data) return { error: "No se pudo crear." };
        await admin.from("profesional_servicios").insert({ profesional_id: prof.id, servicio_id: data!.id });
      }
      return { ok: true };
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
  };

  const mensajesIniciales: { role: "user" | "model"; text: string }[] = [];
  if (contextoCliente) {
    mensajesIniciales.push({
      role: "user",
      text: `Estoy viendo la ficha del cliente "${contextoCliente.nombre}" (id ${contextoCliente.id}). Usa consultar_historial_cliente para ver su historial conmigo y darme un resumen o recomendaciones.`,
    });
  }
  mensajesIniciales.push({ role: "user", text: parsed.data.mensaje });

  const { respuesta, fallback } = await chatConHerramientas({
    sistema: sistema(soloInfo),
    mensajes: mensajesIniciales,
    herramientas: herramientasActivas,
    handlers,
    tipo: "profesional",
  });

  if (fallback) return json({ respuesta: "", fallback: true });
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