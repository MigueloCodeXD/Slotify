import { admin } from "./db.ts";

// Fuente de verdad para la zona horaria: config.zona_horaria (admin),
// luego APP_TIMEZONE (env de funciones), y como última opción America/Bogota.
const DEFAULT_TZ = "America/Bogota";

let zonaCache: string | null = null;
let zonaFetchedAt = 0;

export async function getTZ(): Promise<string> {
  const now = Date.now();
  if (zonaCache && now - zonaFetchedAt < 60_000) return zonaCache;
  let zona: string | null = null;
  try {
    const { data } = await admin.from("config").select("zona_horaria").limit(1).maybeSingle();
    if (data?.zona_horaria) zona = data.zona_horaria.trim();
  } catch {
    /* ignore */
  }
  const final = zona || Deno.env.get("APP_TIMEZONE") || DEFAULT_TZ;
  zonaCache = final;
  zonaFetchedAt = now;
  return final;
}

export function esZonaValida(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format();
    return true;
  } catch {
    return false;
  }
}

// Devuelve una zona confiable (cae en DEFAULT si es inválida).
export function zonaSegura(tz: string): string {
  return esZonaValida(tz) ? tz : DEFAULT_TZ;
}

// Offset (ms) de UTC en el instante dado: UTC + offset = hora local.
export function utcOffset(utcMs: number, tz: string): number {
  const t = zonaSegura(tz);
  const wall = new Intl.DateTimeFormat("en-CA", {
    timeZone: t,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(utcMs));
  // en-CA con h23 → "YYYY-MM-DDTHH:mm" (con hora de 00 a 23)
  const local = wall.replace(", ", "T");
  return Date.parse(`${local}:00Z`) - utcMs;
}

// Instante UTC de la medianoche local del día que contiene utcMs.
export function dayStartUtc(utcMs: number, tz: string): number {
  const t = zonaSegura(tz);
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: t,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcMs)); // "YYYY-MM-DD"
  const candidate = Date.parse(`${d}T00:00:00Z`);
  return candidate - utcOffset(candidate, t);
}

// Día de la semana (0=domingo) en la zona local.
export function wallWeekday(utcMs: number, tz: string): number {
  const t = zonaSegura(tz);
  return new Date(utcMs - utcOffset(utcMs, t)).getUTCDay();
}

// Día local "YYYY-MM-DD" de un instante UTC.
export function diaLocalIso(utcMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaSegura(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcMs));
}
