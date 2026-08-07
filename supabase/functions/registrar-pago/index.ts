import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser, resolverProfesionalObjetivo, type ProfesionalBase } from "../_shared/auth.ts";

const METODOS = ["efectivo", "tarjeta", "transferencia", "otro"] as const;

const schema = z
  .object({
    cita_id: z.string().uuid(),
    monto: z.number().min(0.01),
    metodo: z.enum(METODOS).default("efectivo"),
    otro: z.string().max(40).optional().nullable(),
    profesional_id: z.string().uuid().optional().nullable(),
  })
  .refine((d) => d.metodo !== "otro" || (d.otro && d.otro.trim().length > 0), {
    message: "Indica el método 'otro'.",
  });

export async function registrarPagoRequest(req: Request): Promise<Response> {
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

  // Admin puede operar sobre cualquier cita; un profesional solo sobre sus citas.
    let target: ProfesionalBase = prof;
  if (d.profesional_id && prof.rol === "admin") {
    const res = await resolverProfesionalObjetivo(prof, d.profesional_id);
    if ("error" in res) return res.error;
    target = res.data as ProfesionalBase;
  }

const { data: cita, error: eCita } = await admin
    .from("citas")
    .select("id, anticipo, profesional_id, estado_pago, servicio:servicios(precio)")
    .eq("id", d.cita_id)
    .single();
  if (eCita || !cita) return json({ error: "No se encontró la cita." }, 404);

  if (cita.profesional_id !== target.id) {
    return json({ error: "No puedes registrar pagos de esa cita." }, 403);
  }
  if (cita.estado_pago === "pagado") {
    return json({ error: "La cita ya está pagada." }, 400);
  }

  const srv = Array.isArray(cita.servicio) ? (cita.servicio as { precio?: unknown }[])[0] : (cita.servicio as { precio?: unknown } | undefined);
  const precio = Number(srv?.precio ?? 0);
  const anticipoAnterior = Number(cita.anticipo ?? 0);
  const nuevoAnticipo = anticipoAnterior + d.monto;
  const estado = nuevoAnticipo >= precio ? "pagado" : "parcial";

  const metodoFinal = d.metodo === "otro" ? (d.otro ?? "otro").trim() : d.metodo;

  const { error: ePago } = await admin.from("pagos").insert({
    cita_id: cita.id,
    monto: d.monto,
    metodo: metodoFinal,
    usuario: target.nombre,
  });
  if (ePago) return json({ error: "No se pudo registrar el pago." }, 500);

  const { error: eUp } = await admin
    .from("citas")
    .update({ anticipo: nuevoAnticipo, estado_pago: estado })
    .eq("id", cita.id);
  if (eUp) return json({ error: "No se pudo actualizar la cita." }, 500);

  return json({ ok: true, anticipo: nuevoAnticipo, estado_pago: estado, pagado: estado === "pagado" });
}

serve(async (req) => {
  try {
    const res = await registrarPagoRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});