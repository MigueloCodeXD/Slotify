"use client";

import { useState } from "react";
import Link from "next/link";
import { Boton, ChipEstado } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { TZ } from "@/lib/zonaHoraria";
import type { CitaCliente, Aviso } from "@/types";


function fmt(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function rango(c: CitaCliente): { start: string; end: string } {
  const r = c.rango_tiempo as unknown;
  if (typeof r === "string") {
    const norm = (s: string) =>
      s
        .trim()
        .replace(/[\[\]\(\)"]/g, "")
        .replace(" ", "T")
        .replace(/([+-]\d\d)$/, "$1:00");
    const parts = r.split(",");
    const parse = (s: string) => new Date(norm(s)).toISOString();
    return { start: parse(parts[0]!), end: parse(parts[1]!) };
  }
  const obj = r as { start?: string; lower?: string; end?: string; upper?: string };
  return { start: obj.start ?? obj.lower ?? "", end: obj.end ?? obj.upper ?? "" };
}

export function CitasList({
  citas,
  avisos,
  sesion,
  onEnviado,
}: {
  citas: CitaCliente[];
  avisos: Record<string, Aviso[]>;
  sesion: string;
  onEnviado?: () => void;
}) {
  const [contacto, setContacto] = useState<{ citaId: string; mensaje: string; enviando: boolean } | null>(null);
  const [errorContacto, setErrorContacto] = useState<string | null>(null);

  async function enviarContacto() {
    if (!contacto) return;
    setContacto({ ...contacto, enviando: true });
    setErrorContacto(null);
    try {
      const res = await llamarEdge<{ mensaje: string }>("contactar-profesional", {
        sesion,
        cita_id: contacto.citaId,
        mensaje: contacto.mensaje,
      });
      alert(res.mensaje);
      setContacto(null);
    } catch (e) {
      setErrorContacto((e as Error).message);
      setContacto((c) => (c ? { ...c, enviando: false } : c));
    } finally {
      onEnviado?.();
    }
  }

  if (citas.length === 0) {
    return (
      <p className="py-12 text-center text-violet-100">
        Todavía no tienes citas agendadas.
      </p>
    );
  }

  const ordenadas = [...citas].sort((a, b) => {
    const sa = rango(a).start;
    const sb = rango(b).start;
    return sa.localeCompare(sb);
  });

  return (
    <div className="space-y-4">
      {ordenadas.map((c) => {
        const r = rango(c);
        return (
          <div key={c.id} className="glass glass-hover rounded-2xl p-5 text-zinc-100 shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-zinc-100">
                  {c.servicio?.nombre ?? "Servicio"}
                </p>
                <p className="text-sm text-zinc-400 capitalize">{fmt(r.start)}</p>
                <p className="text-xs text-zinc-500">
                  {c.profesional?.nombre ?? ""} · {c.servicio?.duracion_min} min
                </p>
              </div>
              <ChipEstado estado={c.estado} />
            </div>

            {avisos[c.id] && avisos[c.id].length > 0 && (
              <div className="mt-3 space-y-2">
                {avisos[c.id].map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      a.emisor === "profesional"
                        ? "rounded-bl-sm bg-violet-600/90 text-white"
                        : "rounded-br-sm border-l-4 border-violet-400 bg-violet-400/10 text-violet-200"
                    }`}
                  >
                    {a.mensaje}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {c.estado === "confirmada" && (
                <Link
                  href={`/mi-cita?token=${c.token_gestion}`}
                  className="inline-block rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400/100"
                >
                  Ver / gestionar
                </Link>
              )}
              <button
                onClick={() => setContacto({ citaId: c.id, mensaje: "", enviando: false })}
                className="rounded-xl border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-300 transition hover:bg-violet-400/10"
              >
                Contactar
              </button>
            </div>

            {contacto?.citaId === c.id && (
              <div className="mt-4 rounded-xl border border-violet-400/25 bg-violet-400/5 p-4">
                <textarea
                  value={contacto.mensaje}
                  onChange={(e) => setContacto({ ...contacto, mensaje: e.target.value })}
                  rows={3}
                  maxLength={500}
                  placeholder="Escribe tu mensaje para el profesional…"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:outline-none"
                />
                {errorContacto && <p className="mt-2 text-xs text-rose-300">{errorContacto}</p>}
                <div className="mt-3 flex gap-2">
                  <Boton
                    variante="primario"
                    disabled={contacto.mensaje.trim().length < 5 || contacto.enviando}
                    onClick={enviarContacto}
                  >
                    {contacto.enviando ? "Enviando…" : "Enviar mensaje"}
                  </Boton>
                  <Boton variante="claro" onClick={() => setContacto(null)}>
                    Cancelar
                  </Boton>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}