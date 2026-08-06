import { admin } from "./db.ts";
import { getTZ, diaLocalIso } from "./time.ts";

export async function contextoHoy(): Promise<string> {
  const tz = await getTZ();
  const ahora = new Date();
  const fecha = diaLocalIso(ahora.getTime(), tz);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ahora);
  return `Hoy es ${fecha} (${hora}) · Zona horaria: ${tz}`;
}

export async function contextoNegocio(): Promise<string> {
  const { data } = await admin.from("config").select("nombre_negocio, direccion").single();
  if (!data) return "";
  const nombre = data.nombre_negocio ?? "";
  const direccion = data.direccion ?? "";
  if (nombre && direccion) return `${nombre} · ${direccion}`;
  return nombre || "";
}

export async function hoyIso(): Promise<string> {
  const tz = await getTZ();
  return diaLocalIso(Date.now(), tz);
}
