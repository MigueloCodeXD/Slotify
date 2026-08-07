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