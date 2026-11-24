import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { getTZ, dayStartUtc, diaLocalIso } from "../_shared/time.ts";

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRango(text: string): { start: string; end: string } {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => new Date(norm(s)).toISOString();
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

const DIA_MS = 24 * 3600 * 1000;

export async function dashboardRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401, req);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401, req);

  let body: { periodo?: string; desde?: string; hasta?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const tz = await getTZ();
  const hoy = diaLocalIso(Date.now(), tz);
  const hoyInicioMs = dayStartUtc(Date.now(), tz);
  const hoyVentana = `["${new Date(hoyInicioMs).toISOString()}","${new Date(hoyInicioMs + DIA_MS).toISOString()}")`;

  let mes = hoy.slice(0, 7);
  if (body.periodo === "mes_anterior") {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  let mesInicioMs = dayStartUtc(Date.parse(`${mes}-01T12:00:00Z`), tz);
  let proxMesInicioMs = dayStartUtc(Date.parse(`${(() => { const d = new Date(mesInicioMs + 32 * DIA_MS); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01T12:00:00Z`; })()}`), tz);
  if (body.desde && body.hasta && /^\d{4}-\d{2}-\d{2}$/.test(body.desde) && /^\d{4}-\d{2}-\d{2}$/.test(body.hasta)) {
    mesInicioMs = dayStartUtc(Date.parse(`${body.desde}T12:00:00Z`), tz);
    proxMesInicioMs = dayStartUtc(Date.parse(`${body.hasta}T12:00:00Z`), tz) + DIA_MS;
    mes = `${body.desde}_${body.hasta}`;
  }
  const mesVentana = `["${new Date(mesInicioMs).toISOString()}","${new Date(proxMesInicioMs).toISOString()}")`;

  const proximaVentana = `["${new Date(hoyInicioMs).toISOString()}","${new Date(hoyInicioMs + 8 * DIA_MS).toISOString()}")`;

  const base = "id, rango_tiempo, estado, precio_servicio, anticipo, estado_pago, profesional_id, servicio:servicios(id,nombre,precio,duracion_min), cliente:clientes(nombre,email), profesional:profesionales(nombre)";

  const rangoMs = proxMesInicioMs - mesInicioMs;
  const prevVentana = `["${new Date(mesInicioMs - rangoMs).toISOString()}","${new Date(mesInicioMs).toISOString()}")`;
  const [hoyRes, proxRes, mesRes, bloqueosHoy, prevRes] = await Promise.all([
    admin.from("citas").select(base).eq("profesional_id", prof.id).filter("rango_tiempo", "ov", hoyVentana).order("rango_tiempo"),
    admin.from("citas").select(base).eq("profesional_id", prof.id).eq("estado", "confirmada").filter("rango_tiempo", "ov", proximaVentana).order("rango_tiempo").limit(8),
    admin.from("citas").select(base).eq("profesional_id", prof.id).filter("rango_tiempo", "ov", mesVentana),
    admin.from("bloqueos").select("id, rango_tiempo, motivo").eq("profesional_id", prof.id).filter("rango_tiempo", "ov", hoyVentana),
    admin.from("citas").select(base).eq("profesional_id", prof.id).filter("rango_tiempo", "ov", prevVentana),
  ]);

  if (hoyRes.error || proxRes.error || mesRes.error) {
    return json({ error: "No se pudo consultar el dashboard." }, 500, req);
  }

  const formatear = (c: Record<string, unknown>) => ({ ...parseRango(c.rango_tiempo as string), ...c, rango_tiempo: undefined });

  const citasHoy = (hoyRes.data ?? [])
    .filter((c) => c.estado !== "cancelada")
    .sort((a, b) => String(a.rango_tiempo).localeCompare(String(b.rango_tiempo)))
    .map(formatear);
  const canceladasHoy = (hoyRes.data ?? []).filter((c) => c.estado === "cancelada").length;
  const proximas = (proxRes.data ?? []).map(formatear);

  const calcular = (arr: typeof mesArr) => {
    const cuenta = { confirmada: 0, completada: 0, cancelada: 0, no_show: 0 };
    let ingresos = 0; let pagosRecibidos = 0;
    const porServicio: Record<string, { servicio_id: string; servicio: string; cantidad: number; ingresos: number }> = {};
    const porProfesional: Record<string, { profesional_id: string; profesional: string; cantidad: number; ingresos: number }> = {};
    for (const c of arr) {
      const e = (c.estado as string) || "confirmada";
      if (e in cuenta) cuenta[e as keyof typeof cuenta]++;
      const precioSnapshot = Number(c.precio_servicio ?? 0);
      const precioActual = Number((c.servicio as unknown as { precio?: number } | null)?.precio ?? 0);
      const precio = precioSnapshot || precioActual;
      if (e === "confirmada" || e === "completada") {
        ingresos += precio;
        const ep = (c.estado_pago as string) || "pendiente";
        if (ep === "pagado") pagosRecibidos += precio;
        else if (ep === "parcial") pagosRecibidos += Number(c.anticipo ?? 0);
      }
      const svc = c.servicio as unknown as { id: string; nombre: string } | null;
      const svcNombre = svc?.nombre ?? "Sin servicio";
      const profNombre = (c.profesional as unknown as { nombre?: string } | null)?.nombre ?? "–";
      const keySvc = svc?.id ?? svcNombre;
      const dS = (porServicio[keySvc] ??= { servicio_id: svc?.id ?? "", servicio: svcNombre, cantidad: 0, ingresos: 0 });
      dS.cantidad++;
      if (e === "confirmada" || e === "completada") dS.ingresos += precio;
      const keyP = (c.profesional_id as string) ?? "0";
      const dP = (porProfesional[keyP] ??= { profesional_id: keyP, profesional: profNombre, cantidad: 0, ingresos: 0 });
      dP.cantidad++;
      if (e === "confirmada" || e === "completada") dP.ingresos += precio;
    }
    const total = arr.length;
    const tasas = { cancelacion: total ? cuenta.cancelada / total : 0, no_show: total ? cuenta.no_show / total : 0, completada: total ? cuenta.completada / total : 0 };
    return { cuenta, ingresos, pagosRecibidos, porServicio, porProfesional, total, tasas };
  };

  const mesArr = mesRes.data ?? [];
  const actual = calcular(mesArr);
  const { cuenta, ingresos, pagosRecibidos, porServicio, porProfesional } = actual;

  const prev = calcular(prevRes.data ?? []);
  const filasMes = mesArr.map((c) => ({
    id: c.id,
    ...parseRango(c.rango_tiempo as string),
    cliente: (c.cliente as unknown as { nombre?: string; email?: string } | null)?.nombre ?? "",
    email_cliente: (c.cliente as unknown as { nombre?: string; email?: string } | null)?.email ?? "",
    servicio: (c.servicio as unknown as { nombre?: string } | null)?.nombre ?? "",
    estado: c.estado,
    precio: Number(c.precio_servicio ?? 0),
    anticipo: Number(c.anticipo ?? 0),
    estado_pago: c.estado_pago ?? "pendiente",
  }));

  return json({
    ok: true,
    hoy: {
      fecha: hoy,
      citas: citasHoy,
      total_confirmadas: citasHoy.filter((c) => (c as { estado?: string }).estado === "confirmada").length,
      canceladas: canceladasHoy,
    },
    proximas,
    bloqueos_hoy: (bloqueosHoy.data ?? []).map((b) => ({ ...parseRango(b.rango_tiempo as string), motivo: b.motivo })),
    mes: {
      mes,
      cuenta,
      ingresos,
      pagos_recibidos: pagosRecibidos,
      total: mesArr.length,
      tasas: actual.tasas,
      comparativa: { ingresos: prev.ingresos, total: prev.total, tasas: prev.tasas, cuenta: prev.cuenta },
      desglose_servicios: Object.values(porServicio).sort((a, b) => b.ingresos - a.ingresos),
      desglose_profesionales: Object.values(porProfesional),
      filas: filasMes,
    },
    timezone: tz,
  });
}

serve(async (req) => {
  try {
    return await dashboardRequest(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Error interno" }, 500, req);
  }
});