import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const TZ = Deno.env.get("APP_TIMEZONE") ?? "America/Bogota";

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => new Date(norm(s)).toISOString();
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

function fechaLocal(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
}

const DIA_MS = 24 * 3600 * 1000;

export async function dashboardRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401);

  const hoy = fechaLocal(Date.now());
  const hoyInicioMs = Date.parse(`${hoy}T05:00:00Z`);
  const hoyVentana = `["${new Date(hoyInicioMs).toISOString()}","${new Date(hoyInicioMs + DIA_MS).toISOString()}")`;

  const mes = hoy.slice(0, 7);
  const mesInicioMs = Date.parse(`${mes}-01T05:00:00Z`);
  const proxMes = (() => {
    const d = new Date(mesInicioMs + 32 * DIA_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const mesVentana = `["${new Date(mesInicioMs).toISOString()}","${new Date(Date.parse(`${proxMes}-01T05:00:00Z`)).toISOString()}")`;

  const proximaVentana = `["${new Date(hoyInicioMs).toISOString()}","${new Date(hoyInicioMs + 8 * DIA_MS).toISOString()}")`;

  const base = "id, rango_tiempo, estado, precio_servicio, servicio:servicios(id,nombre,precio,duracion_min), cliente:clientes(nombre,email)";

  const [hoyRes, proxRes, mesRes, bloqueosHoy] = await Promise.all([
    admin
      .from("citas")
      .select(base)
      .eq("profesional_id", prof.id)
      .filter("rango_tiempo", "ov", hoyVentana)
      .order("rango_tiempo"),
    admin
      .from("citas")
      .select(base)
      .eq("profesional_id", prof.id)
      .eq("estado", "confirmada")
      .filter("rango_tiempo", "ov", proximaVentana)
      .order("rango_tiempo")
      .limit(10),
    admin
      .from("citas")
      .select(base)
      .eq("profesional_id", prof.id)
      .filter("rango_tiempo", "ov", mesVentana),
    admin
      .from("bloqueos")
      .select("id, rango_tiempo, motivo")
      .eq("profesional_id", prof.id)
      .filter("rango_tiempo", "ov", hoyVentana),
  ]);

  if (hoyRes.error || proxRes.error || mesRes.error) {
    return json({ error: "No se pudo consultar el dashboard." }, 500);
  }

  const formatear = (c: any) => ({ ...parseRango(c.rango_tiempo as string), ...c, rango_tiempo: undefined });

  const citasHoy = (hoyRes.data ?? [])
    .filter((c) => c.estado !== "cancelada")
    .sort((a: any, b: any) => a.rango_tiempo.localeCompare(b.rango_tiempo))
    .map(formatear);
  const canceladasHoy = (hoyRes.data ?? []).filter((c) => c.estado === "cancelada").length;
  const proximas = (proxRes.data ?? []).map(formatear);

  const mesArr = mesRes.data ?? [];
  const cuenta = { confirmada: 0, completada: 0, cancelada: 0, no_show: 0 };
  let ingresos = 0;
  for (const c of mesArr) {
    const e = (c.estado as string) || "confirmada";
    if (e in cuenta) cuenta[e as keyof typeof cuenta]++;
    if (e === "confirmada" || e === "completada") {
      const precioSnapshot = Number(c.precio_servicio ?? 0);
      const precioActual = Number((c.servicio as unknown as { precio?: number } | null)?.precio ?? 0);
      ingresos += precioSnapshot || precioActual;
    }
  }

  return json({
    ok: true,
    hoy: {
      fecha: hoy,
      citas: citasHoy,
      total_confirmadas: citasHoy.filter((c: any) => c.estado === "confirmada").length,
      canceladas: canceladasHoy,
    },
    proximas,
    bloqueos_hoy: (bloqueosHoy.data ?? []).map((b) => ({ ...parseRango(b.rango_tiempo as string), motivo: b.motivo })),
    mes: { mes, cuenta, ingresos, total: mesArr.length },
    timezone: TZ,
  });
}

serve(async (req) => {
  try {
    const res = await dashboardRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});