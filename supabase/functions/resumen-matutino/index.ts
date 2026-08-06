import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { esServiceRole } from "../_shared/auth.ts";
import { enviarCorreo } from "../_shared/brevo.ts";
import { getTZ, dayStartUtc, diaLocalIso } from "../_shared/time.ts";
import { registrar } from "../_shared/logging.ts";

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => new Date(norm(s)).toISOString();
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

export async function resumenRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!esServiceRole(req)) return json({ error: "No autorizado." }, 401);

  const tz = await getTZ();
  const fecha = diaLocalIso(Date.now(), tz);
  const desdeMs = dayStartUtc(Date.now(), tz);
  const hastaMs = desdeMs + 24 * 3600 * 1000;
  const ventana = `["${new Date(desdeMs).toISOString()}","${new Date(hastaMs).toISOString()}")`;

  const { data: profesionales } = await admin
    .from("profesionales")
    .select("id, nombre, email")
    .eq("activo", true);

  const resumenes: { email: string; nombre: string; citas: unknown[] }[] = [];

  for (const prof of profesionales ?? []) {
    const { data: citas } = await admin
      .from("citas")
      .select("id, rango_tiempo, estado, servicio:servicios(nombre), cliente:clientes(nombre, email)")
      .eq("profesional_id", prof.id)
      .eq("estado", "confirmada")
      .filter("rango_tiempo", "ov", ventana);
    if (citas && citas.length > 0) {
      resumenes.push({
        email: prof.email,
        nombre: prof.nombre,
        citas: citas.map((c) => ({
          ...parseRango(c.rango_tiempo as string),
          servicio: (c.servicio as unknown as { nombre?: string } | null)?.nombre,
          cliente: (c.cliente as unknown as { nombre?: string } | null)?.nombre,
        })),
      });
    }
  }

  let enviados = 0;
  for (const r of resumenes) {
    const filas = r.citas
      .map(
        (c: any) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #eee">${new Date(c.start).toLocaleString("es", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: tz,
          })}</td><td style="padding:8px;border-bottom:1px solid #eee">${c.cliente}</td><td style="padding:8px;border-bottom:1px solid #eee">${c.servicio}</td></tr>`
      )
      .join("");
    await enviarCorreo("resumen_matutino", {
      to: r.email,
      nombre: r.nombre,
      htmlCitas: `<table style="border-collapse:collapse;width:100%"><tr><th style="padding:8px;text-align:left">Hora</th><th style="padding:8px;text-align:left">Cliente</th><th style="padding:8px;text-align:left">Servicio</th></tr>${filas}</table>`,
    }).catch(() => {});
    enviados++;
  }

  registrar("resumen-matutino", "info", "resumen_generado", { fecha, profesionales_notificados: enviados });
  return json({ ok: true, fecha, profesionales_notificados: enviados });
}

serve(async (req) => {
  try {
    const res = await resumenRequest(req);
    return res;
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});