// Logging estructurado (JSON al stdout, capturado por Edge Logs / Logflare).
export type LogDatas = Record<string, unknown> | undefined;

function redacted(datos: LogDatas): Record<string, unknown> {
  const src = datos ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (/token|secret|password|apikey|authorization|codigo/i.test(k)) out[k] = "[redacted]";
    else out[k] = v;
  }
  return out;
}

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

export function registrar(
  area: string,
  nivel: "debug" | "info" | "warn" | "error",
  evento: string,
  datos?: LogDatas
): void {
  const linea = {
    ts: new Date().toISOString(),
    nivel,
    area,
    evento,
    datos: redacted(datos),
  };
  const s = JSON.stringify(linea);
  if (nivel === "error") console.error(s);
  else if (nivel === "warn") console.warn(s);
  else console.log(s);
}

export function logInfo(area: string, evento: string, datos?: LogDatas) { registrar(area, "info", evento, datos); }
export function logWarn(area: string, evento: string, datos?: LogDatas) { registrar(area, "warn", evento, datos); }
export function logError(area: string, evento: string, datos?: LogDatas) { registrar(area, "error", evento, datos); }