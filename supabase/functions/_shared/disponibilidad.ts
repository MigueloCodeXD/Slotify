import { admin } from "./db.ts";

export interface Slot {
  start: string;
  end: string;
}

export interface Rango {
  start: number;
  end: number;
}

export interface DatosConfig {
  margen_anticipacion_horas: number;
  horas_limite_cancelacion: number;
}

// America/Bogota es UTC-5, sin horario de verano.
const OFF = 5 * 3600 * 1000;
const STEP_MIN = 15;
const DAY_MS = 24 * 3600 * 1000;

function hmsToMs(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return ((h ?? 0) * 3600 + (m ?? 0) * 60) * 1000;
}

function dayStartUtc(utcMs: number): number {
  const w = new Date(utcMs - OFF);
  return Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) + OFF;
}

function wallWeekday(utcMs: number): number {
  return new Date(utcMs - OFF).getUTCDay();
}

function iso(utcMs: number): string {
  return new Date(utcMs).toISOString();
}

function overlaps(a: Rango, b: Rango): boolean {
  return a.start < b.end && b.start < a.end;
}

export async function getConfig(): Promise<DatosConfig> {
  const { data, error } = await admin
    .from("config")
    .select("margen_anticipacion_horas, horas_limite_cancelacion")
    .single();
  if (error) throw new Error("Error leyendo configuración");
  return data as DatosConfig;
}

function norm(s: string): string {
  return s.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

function parseRange(text: string): Rango {
  const clean = text.replace(/[\[\]\(\)"]/g, "").trim();
  const parts = clean.split(",");
  const parse = (s: string) => Date.parse(norm(s));
  return { start: parse(parts[0]!), end: parse(parts[1]!) };
}

export async function getOcupado(opts: {
  profesionalIds: string[];
  start: number;
  end: number;
}): Promise<{ bloqueos: Record<string, Rango[]>; citas: Record<string, Rango[]> }> {
  const ventana = `["${iso(opts.start)}","${iso(opts.end)}")`;

  const { data: bloqueos, error: eB } = await admin
    .from("bloqueos")
    .select("profesional_id, rango_tiempo")
    .in("profesional_id", opts.profesionalIds)
    .filter("rango_tiempo", "ov", ventana);

  const { data: citas, error: eC } = await admin
    .from("citas")
    .select("profesional_id, rango_tiempo")
    .eq("estado", "confirmada")
    .in("profesional_id", opts.profesionalIds)
    .filter("rango_tiempo", "ov", ventana);

  if (eB || eC) {
    console.error("getOcupado error", eB, eC);
    throw new Error("Error consultando ocupación");
  }

  const group = (rows: { profesional_id: string; rango_tiempo: string }[] | null) => {
    const map: Record<string, Rango[]> = {};
    for (const r of rows ?? []) (map[r.profesional_id] ??= []).push(parseRange(r.rango_tiempo));
    return map;
  };

  return {
    bloqueos: group(bloqueos as { profesional_id: string; rango_tiempo: string }[] | null),
    citas: group(citas as { profesional_id: string; rango_tiempo: string }[] | null),
  };
}

export async function consultarDisponibilidad(opts: {
  servicioId: string;
  profesionalId?: string | null;
  start: number;
  end: number;
}): Promise<{ slots: { profesional_id: string; start: string; end: string }[] }> {
  const cfg = await getConfig();

  const { data: servicio, error: eS } = await admin
    .from("servicios")
    .select("id, duracion_min, buffer_min, activo")
    .eq("id", opts.servicioId)
    .single();
  if (eS || !servicio || !servicio.activo) throw new Error("Servicio no disponible");

  const durMs = servicio.duracion_min * 60_000;
  const bufferMs = servicio.buffer_min * 60_000;

  let profesionalIds: string[];
  if (opts.profesionalId) {
    profesionalIds = [opts.profesionalId];
  } else {
    const { data: ps, error: eP } = await admin
      .from("profesional_servicios")
      .select("profesional_id")
      .eq("servicio_id", opts.servicioId);
    if (eP) throw new Error("Error leyendo profesionales");
    profesionalIds = (ps ?? []).map((p) => p.profesional_id);
  }
  if (profesionalIds.length === 0) return { slots: [] };

  const { data: activos, error: eA } = await admin
    .from("profesionales")
    .select("id")
    .eq("activo", true)
    .in("id", profesionalIds);
  if (eA) throw new Error("Error leyendo profesionales");
  const activosSet = new Set((activos ?? []).map((p) => p.id));
  const idsActivos = profesionalIds.filter((id) => activosSet.has(id));
  if (idsActivos.length === 0) return { slots: [] };

  const margenMs = cfg.margen_anticipacion_horas * 3_600_000;
  const nowPlus = Date.now() + margenMs;

  const ocupado = await getOcupado({
    profesionalIds: idsActivos,
    start: opts.start,
    end: opts.end + bufferMs,
  });

  const { data: disponibilidad, error: eD } = await admin
    .from("disponibilidad_profesional")
    .select("profesional_id, dia_semana, hora_inicio, hora_fin")
    .in("profesional_id", idsActivos);
  if (eD) throw new Error("Error leyendo disponibilidad");

  const periodosPorProf: Record<string, { dia: number; inicio: number; fin: number }[]> = {};
  for (const d of (disponibilidad ?? []) as {
    profesional_id: string;
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
  }[]) {
    (periodosPorProf[d.profesional_id] ??= []).push({
      dia: d.dia_semana,
      inicio: hmsToMs(d.hora_inicio),
      fin: hmsToMs(d.hora_fin),
    });
  }

  const slots: { profesional_id: string; start: string; end: string }[] = [];

  for (
    let dayStart = dayStartUtc(opts.start);
    dayStart < opts.end + durMs;
    dayStart += DAY_MS
  ) {
    const wd = wallWeekday(dayStart);

    for (const pid of idsActivos) {
      const periodos = periodosPorProf[pid]?.filter((p) => p.dia === wd) ?? [];
      for (const periodo of periodos) {
        const winStart = dayStart + periodo.inicio;
        const winEnd = dayStart + periodo.fin;

        for (let s = winStart; s + durMs <= winEnd; s += STEP_MIN * 60_000) {
          if (s < nowPlus) continue;
          if (s < opts.start || s + durMs > opts.end) continue;

          const candidato: Rango = { start: s, end: s + durMs + bufferMs };
          const ocupacion = [...(ocupado.bloqueos[pid] ?? []), ...(ocupado.citas[pid] ?? [])];
          let libre = true;
          for (const o of ocupacion) {
            if (overlaps(candidato, o)) {
              libre = false;
              break;
            }
          }
          if (libre) {
            slots.push({ profesional_id: pid, start: iso(s), end: iso(s + durMs) });
          }
        }
      }
    }
  }

  return { slots };
}
