import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { verificarSesionCliente } from "../_shared/token.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { registrar } from "../_shared/logging.ts";

const schema = z.object({
  sesion: z.string().min(10).optional(),
  token_gestion: z.string().uuid().optional(),
  cita_id: z.string().uuid(),
  mensaje: z.string().min(5).max(500),
  telefono_contacto: z.string().max(30).optional().nullable(),
});

export async function contactarRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400);
  const d = parsed.data;

  let clienteEmail: string | null = null;
  let clienteNombre = "Cliente";
  let citaId = d.cita_id;

  // Autorización: sesión de cliente o token de gestión de la cita.
  if (d.sesion) {
    const sesion = await verificarSesionCliente(d.sesion);
    if (!sesion) return json({ error: "Sesión inválida o expirada." }, 401);
    clienteEmail = sesion.email;
    const { data: cli } = await admin.from("clientes").select("nombre, email").eq("email", sesion.email).maybeSingle();
    if (cli) clienteNombre = cli.nombre;
  } else if (d.token_gestion) {
    const { data: cita } = await admin.from("citas").select("cliente_id").eq("token_gestion", d.token_gestion).single();
    if (!cita) return json({ error: "Cita no encontrada." }, 404);
    citaId = cita.cliente_id;
    const { data: cli } = await admin.from("clientes").select("nombre, email").eq("id", cita.cliente_id).maybeSingle();
    if (cli) {
      clienteEmail = cli.email;
      clienteNombre = cli.nombre;
    }
  } else {
    return json({ error: "Falta sesión o token." }, 400);
  }

  const { data: cita } = await admin
    .from("citas")
    .select("id, profesional:profesionales(id, nombre, email), servicio:servicios(nombre), rango_tiempo")
    .eq("id", citaId)
    .single();
  if (!cita || !cita.profesional) return json({ error: "Cita no encontrada." }, 404);

  const prof = cita.profesional as { nombre: string; email: string };
  const rango = String(cita.rango_tiempo ?? "");
  const [startRaw] = rango.replace(/[\[\]"]/g, "").split(",");
  const inicio = startRaw ? new Date(startRaw).toISOString() : null;

  await enviarCorreo("contacto_cliente_profesional", {
    to: prof.email,
    nombre: prof.nombre,
    cliente: clienteNombre,
    email_cliente: clienteEmail ?? "",
    telefono_cliente: d.telefono_contacto ?? "",
    servicio: (cita.servicio as unknown as { nombre?: string } | null)?.nombre ?? "",
    fecha: inicio ?? "",
    mensaje: d.mensaje,
    negocio: "Slotify",
  }).catch(() => {});

  registrar("contactar-profesional", "info", "contacto_enviado", {
    cita_id: citaId,
    profesional_id: cita.profesional_id,
  });

  return json({ ok: true, mensaje: "Mensaje enviado al profesional." });
}

serve(async (req) => {
  try {
    return await contactarRequest(req);
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});