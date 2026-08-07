import { TZ } from "./zonaHoraria";

export { TZ } from "./zonaHoraria";

export function fechaEnZona(offsetDias: number, tz: string = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDias * 86_400_000));
}

export function diasProximos(cantidad: number, tz: string = TZ): string[] {
  return Array.from({ length: cantidad }, (_, i) => fechaEnZona(i, tz));
}

export function fmtPill(fecha: string, tz: string = TZ): string {
  return new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", timeZone: tz }).format(
    new Date(fecha + "T12:00:00Z")
  );
}
