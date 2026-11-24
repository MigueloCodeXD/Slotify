import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeadersFor } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { esServiceRole } from "../_shared/auth.ts";
import { auditarCita } from "../_shared/auditoria.ts";

// Vence citas pendientes cuya confirmación expiró: libera el horario
// pasándolas a 'cancelada'. Corre por cron (cada hora).
export async function vencerConfirmacionesRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (!esServiceRole(req)) return json({ error: "No autorizado." }, 401, req);

  const { data: vencidas, error } = await admin
    .from("citas")
    .select("id")
    .eq("estado", "pendiente")
    .eq("confirmacion_pendiente", true)
    .lt("confirmacion_expira_at", new Date().toISOString())
    .limit(500);

  if (error) return json({ error: "No se pudo consultar." }, 500, req);

  const ids = (vencidas ?? []).map((c) => c.id);
  if (ids.length === 0) return json({ ok: true, vencidas: 0 }, 200, req);

  const { error: eUp } = await admin
    .from("citas")
    .update({ estado: "cancelada", confirmacion_pendiente: false })
    .in("id", ids);
  if (eUp) return json({ error: "No se pudo actualizar." }, 500, req);
  await Promise.all(ids.map((id) => auditarCita({ citaId: id, estadoAnterior: "pendiente", estadoNuevo: "cancelada", hechoPor: "sistema", accion: "confirmacion_vencida" })));

  console.log(JSON.stringify({ ts: new Date().toISOString(), nivel: "info", area: "vencer-confirmaciones", evento: "confirmaciones_vencidas", datos: { vencidas: ids.length } }));
  return json({ ok: true, vencidas: ids.length }, 200, req);
}

serve(async (req) => {
  try {
    const res = await vencerConfirmacionesRequest(req);
    return res;
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});