import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getConfig } from "../_shared/disponibilidad.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { auditarCita } from "../_shared/auditoria.ts";

const schema = z.object({ token_gestion: z.string().uuid() });

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

export function parseRango(text: string): { start: number; end: number } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => Date.parse(norm(s));
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

export async function cancelarCitaRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400, req);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Token inválido" }, 400, req);

  const { data: cita, error } = await admin
    .from("citas")
    .select("*, cliente:clientes(*), servicio:servicios(*), profesional:profesionales(*)")
    .eq("token_gestion", parsed.data.token_gestion)
    .single();
  if (error || !cita) return json({ error: "No se encontró la cita." }, 404, req);
  if (cita.estado !== "confirmada") return json({ error: "Esta cita ya no es cancelable." }, 400, req);

  const cfg = await getConfig();
  const rango = parseRango(cita.rango_tiempo as string);
  if (rango.start - Date.now() < cfg.horas_limite_cancelacion * 3_600_000) {
    return json({ error: `Ya no puedes cancelar (límite ${cfg.horas_limite_cancelacion}h).` }, 400, req);
  }

  const { error: eUp } = await admin
    .from("citas")
    .update({ estado: "cancelada" })
    .eq("id", cita.id);
  if (eUp) return json({ error: "No se pudo cancelar la cita." }, 500, req);
  await auditarCita({ citaId: cita.id, estadoAnterior: cita.estado, estadoNuevo: "cancelada", hechoPor: "cliente" });

  const { data: cfgDir } = await admin.from("config").select("direccion").single();
  const direccion = (cfgDir?.direccion as string | null) ?? "";
  await enviarCorreo("cita_cancelada_cliente", {
    to: cita.cliente.email,
    nombre: cita.cliente.nombre,
    servicio: cita.servicio.nombre,
    profesional: cita.profesional.nombre,
    fecha: new Date(rango.start).toISOString(),
    direccion,
  }).catch(() => {});
  await enviarCorreo("cita_cancelada_profesional", {
    to: cita.profesional.email,
    cliente: cita.cliente.nombre,
    servicio: cita.servicio.nombre,
    fecha: new Date(rango.start).toISOString(),
    direccion,
  }).catch(() => {});

  return json({ ok: true }, 200, req);
}

serve(async (req) => {
  try {
    return await cancelarCitaRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});