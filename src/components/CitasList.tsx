"use client";

import Link from "next/link";
import { ChipEstado } from "@/components/ui";
import type { CitaCliente, Aviso } from "@/types";

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota";

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
}: {
  citas: CitaCliente[];
  avisos: Record<string, Aviso[]>;
}) {
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
                  <div key={a.id} className="rounded-xl border-l-4 border-violet-400 bg-violet-400/10 px-3 py-2 text-sm text-violet-200">
                    {a.mensaje}
                  </div>
                ))}
              </div>
            )}

            {c.estado === "confirmada" && (
              <div className="mt-4">
                <Link
                  href={`/mi-cita?token=${c.token_gestion}`}
                  className="inline-block rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400/100"
                >
                  Ver / gestionar
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}