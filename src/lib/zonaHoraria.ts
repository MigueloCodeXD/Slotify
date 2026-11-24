export const DEFECTO_TZ = "America/Bogota";

export const ZONAS = [
  { label: "Bogotá (Colombia)", value: "America/Bogota" },
  { label: "Caracas (Venezuela)", value: "America/Caracas" },
  { label: "Quito (Ecuador)", value: "America/Guayaquil" },
  { label: "Lima (Perú)", value: "America/Lima" },
  { label: "La Paz (Bolivia)", value: "America/La_Paz" },
  { label: "Santiago (Chile)", value: "America/Santiago" },
  { label: "Buenos Aires (Argentina)", value: "America/Argentina/Buenos_Aires" },
  { label: "Ciudad de México", value: "America/Mexico_City" },
  { label: "Miami / Nueva York", value: "America/New_York" },
  { label: "España", value: "Europe/Madrid" },
  { label: "UTC", value: "UTC" },
];

export let TZ: string = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? DEFECTO_TZ;

export function actualizarTZ(zona?: string | null): void {
  if (zona && zona.trim() && /^[A-Za-z_]+(\/[A-Za-z_]+)+$/.test(zona.trim())) {
    TZ = zona.trim();
  }
}

function partesZona(fecha: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(fecha)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function offsetZonaMs(fecha: Date, tz: string = TZ): number {
  const p = partesZona(fecha, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - fecha.getTime();
}

export function fechaLocalInputAISO(fechaLocal: string, horaLocal: string, tz: string = TZ): string {
  const [y, m, d] = fechaLocal.split("-").map(Number);
  const [hh, mm] = horaLocal.split(":").map(Number);
  let utcGuess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0);
  for (let i = 0; i < 3; i++) {
    const off = offsetZonaMs(new Date(utcGuess), tz);
    const next = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0) - off;
    if (next === utcGuess) break;
    utcGuess = next;
  }
  return new Date(utcGuess).toISOString();
}