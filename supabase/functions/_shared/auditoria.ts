import { admin } from "./db.ts";

export async function auditarCita(opts: {
  citaId: string;
  estadoAnterior?: string | null;
  estadoNuevo: string;
  hechoPor?: string | null;
  accion?: string;
  detalles?: Record<string, unknown>;
}) {
  try {
    const { error } = await admin.from("auditoria_cita").insert({
      cita_id: opts.citaId,
      estado_anterior: opts.estadoAnterior ?? null,
      estado_nuevo: opts.estadoNuevo,
      hecho_por: opts.hechoPor ?? null,
      accion: opts.accion ?? null,
      detalles: opts.detalles ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), nivel: "warn", area: "auditoria", evento: "auditoria_fallida", datos: { cita_id: opts.citaId, error: (e as Error).message } }));
  }
}
