import { admin } from "./db.ts";

const TZ = Deno.env.get("APP_TIMEZONE") ?? "America/Bogota";

export function contextoHoy(): string {
  const ahora = new Date();
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ahora);
  return `Hoy es ${fecha} (${hora}) · Zona horaria: ${TZ}`;
}

export async function contextoNegocio(): Promise<string> {
  const { data } = await admin.from("config").select("nombre_negocio, direccion").single();
  if (!data) return "";
  const nombre = data.nombre_negocio ?? "";
  const direccion = data.direccion ?? "";
  if (nombre && direccion) return `${nombre} · ${direccion}`;
  return nombre || "";
}

export function hoyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
