// Logging estructurado (JSON al stdout, capturado por Edge Logs / Logflare).
// Niveles: debug, info, warn, error. `area` identifica el flujo (p. ej. "crear-cita").

export type LogDatas = Record<string, unknown> | undefined;

export function registrar(area: string, nivel: "debug" | "info" | "warn" | "error", evento: string, datos?: LogDatas): void {
  const linea = {
    ts: new Date().toISOString(),
    nivel,
    area,
    evento,
    datos: datos ?? {},
  };
  // Salida consolidada en una sola línea JSON para parsing fácil.
  if (nivel === "error") console.error(JSON.stringify(linea));
  else if (nivel === "warn") console.warn(JSON.stringify(linea));
  else console.log(JSON.stringify(linea));
}

export function logInfo(area: string, evento: string, datos?: LogDatas) {
  registrar(area, "info", evento, datos);
}
export function logWarn(area: string, evento: string, datos?: LogDatas) {
  registrar(area, "warn", evento, datos);
}
export function logError(area: string, evento: string, datos?: LogDatas) {
  registrar(area, "error", evento, datos);
}