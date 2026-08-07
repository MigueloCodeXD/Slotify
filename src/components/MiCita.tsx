"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Boton, ChipEstado, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { configPublica } from "@/lib/supabaseClient";
import { googleCalendarLink, icsLink } from "@/lib/calendarLink";
import { diasProximos, fmtPill } from "@/lib/fechas";
import { useToast } from "@/components/Toast";
import { TZ, actualizarTZ } from "@/lib/zonaHoraria";
import type { CitaCliente, Aviso } from "@/types";

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function fmtMoneda(v: number): string {
  const n = Number(v ?? 0);
  return "$" + (Number.isFinite(n) ? n : 0).toFixed(2);
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

export function MiCita() {
  const { notificar } = useToast();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [cita, setCita] = useState<CitaCliente | null>(null);
  const [avisos, setAvisos] = useState<Record<string, Aviso[]>>({});
  const [cargando, setCargando] = useState(true);
  const [cambio, setCambio] = useState<"cancelar" | "reprogramar" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(null);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    try {
      const res = await llamarEdge<{ citas: CitaCliente[]; avisos: Record<string, Aviso[]> }>(
        "consultar-mis-citas",
        { token_gestion: token }
      );
      const { data: cfg } = await configPublica();
      actualizarTZ((cfg as { zona_horaria?: string } | null)?.zona_horaria);
      setCita(res.citas[0]);
      setAvisos(res.avisos ?? {});
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (token) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const dias = useMemo(() => diasProximos(7, TZ), []);

  async function cargarSlots(dia: string) {
    if (!cita) return;
    setCargandoSlots(true);
    setSlot(null);
    try {
      const res = await llamarEdge<{ slots: { start: string; end: string }[] }>(
        "consultar-disponibilidad",
        {
          servicio_id: cita.servicio?.id,
          profesional_id: cita.profesional?.id,
          fecha: dia,
          dias: 1,
        }
      );
      setSlots(res.slots.sort((a, b) => a.start.localeCompare(b.start)));
    } catch (e) {
      notificar((e as Error).message, "error");
      setSlots([]);
    } finally {
      setCargandoSlots(false);
    }
  }

  async function cancelar() {
    if (!cita) return;
    if (enviando) return;
    setEnviando(true);
    try {
      await llamarEdge("cancelar-cita", { token_gestion: token });
      setCambio(null);
      await cargar();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar() {
    if (!cita) return;
    try {
      await llamarEdge("confirmar-cita", { token_gestion: token });
      setCambio(null);
      await cargar();
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function reprogramar() {
    if (!cita || !slot) return;
    setOcupado(false);
    try {
      await llamarEdge("reprogramar-cita", { token_gestion: token, nuevo_start: slot.start });
      setCambio(null);
      await cargar();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("ocupada") || msg.includes("disponible")) setOcupado(true);
      notificar(msg, "error");
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <Spinner />
        </main>
      </div>
    );
  }

  if (!cita) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-lg px-4 py-16">
          <Tarjeta className="p-6 text-center text-sm text-zinc-400">
            No encontramos tu cita. Revisa el enlace de confirmación.
          </Tarjeta>
        </main>
      </div>
    );
  }
  const r = rango(cita);
  const titulo = cita.servicio?.nombre ?? "Cita";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <Tarjeta className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">{titulo}</h1>
              <p className="mt-1 text-sm text-zinc-400">{fmt(r.start)}</p>
              <p className="text-xs text-zinc-500">
                {cita.profesional?.nombre ?? ""} · {cita.servicio?.duracion_min} min
              </p>
            </div>
            <ChipEstado estado={cita.estado} />
          </div>

          {(cita.estado === "confirmada" || cita.estado === "completada") && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-zinc-300">
              <span>
                Total:{" "}
                <span className="font-mono font-semibold text-white">
                  {fmtMoneda(Number(cita.precio_servicio ?? cita.servicio?.precio ?? 0))}
                </span>
              </span>
              {Number(cita.anticipo ?? 0) > 0 && (
                <span>
                  Anticipo:{" "}
                  <span className="font-mono font-semibold text-amber-200">
                    {fmtMoneda(cita.anticipo ?? 0)}
                  </span>
                </span>
              )}
              <span className="capitalize">
                Pago:{" "}
                <span className="font-semibold text-emerald-200">{cita.estado_pago ?? "pendiente"}</span>
              </span>
            </div>
          )}

          {avisos[cita.id] && avisos[cita.id].length > 0 && (
            <div className="mt-4 space-y-2">
              {avisos[cita.id].map((a) => (
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

          {cita.estado === "pendiente" && cita.confirmacion_pendiente && (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">
                Esta cita aún no está confirmada.
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Confírmala para que quede reservada
                {cita.confirmacion_expira_at
                  ? ` antes del ${new Intl.DateTimeFormat("es", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(cita.confirmacion_expira_at))}.`
                  : "."}
              </p>
              <div className="mt-3 flex gap-3">
                <Boton variante="primario" onClick={confirmar}>
                  ✓ Confirmar mi cita
                </Boton>
                <Boton variante="claro" onClick={() => setCambio("cancelar")}>
                  Cancelar
                </Boton>
              </div>
            </div>
          )}

          {cita.estado === "confirmada" && !cambio && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                href={googleCalendarLink({
                  start: r.start,
                  end: r.end,
                  titulo,
                  ubicacion: "",
                })}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-violet-400/100"
              >
                Google Calendar
              </a>
              <a
                href={icsLink({ start: r.start, end: r.end, titulo, uid: cita.id })}
                download="cita.ics"
                className="rounded-xl border border-violet-300 px-4 py-2.5 text-center text-sm font-semibold text-violet-300 transition hover:bg-violet-400/10"
              >
                Descargar .ics
              </a>
              <Boton variante="claro" onClick={() => setCambio("reprogramar")}>
                Reprogramar
              </Boton>
              <Boton variante="peligro" onClick={() => setCambio("cancelar")}>
                Cancelar
              </Boton>
            </div>
          )}

          {cita.estado === "confirmada" && cambio === "cancelar" && (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-rose-700">
                ¿Seguro que quieres cancelar esta cita?
              </p>
              <div className="mt-3 flex gap-3">
                <Boton variante="primario" onClick={cancelar} disabled={enviando} className="bg-rose-600 hover:bg-rose-500">
                  {enviando ? "Cancelando…" : "Sí, cancelar"}
                </Boton>
                <Boton variante="claro" onClick={() => setCambio(null)}>
                  Volver
                </Boton>
              </div>
            </div>
          )}

          {cita.estado === "confirmada" && cambio === "reprogramar" && (
            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold text-zinc-200">
                Elige un nuevo horario
              </p>
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {dias.map((d) => (
                  <button
                    key={d}
                    onClick={() => cargarSlots(d)}
                    className="shrink-0 rounded-xl border border-violet-400/25 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-400/10"
                  >
                    {fmtPill(d, TZ)}
                  </button>
                ))}
              </div>
              {cargandoSlots && <Spinner />}
              {!cargandoSlots && slots.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <button
                        key={s.start}
                        onClick={() => setSlot(s)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          slot?.start === s.start
                            ? "border-violet-600 bg-violet-600 text-white"
                            : "border-violet-400/30 text-violet-300 hover:bg-violet-400/10"
                        }`}
                      >
                        {new Intl.DateTimeFormat("es", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: TZ,
                        }).format(new Date(s.start))}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-3">
                    <Boton variante="primario" onClick={reprogramar} disabled={!slot}>
                      {ocupado ? "Volver a intentar" : "Confirmar cambio"}
                    </Boton>
                    <Boton variante="claro" onClick={() => setCambio(null)}>
                      Cancelar
                    </Boton>
                  </div>
                </>
              )}
              {!cargandoSlots && slots.length === 0 && (
                <p className="text-sm text-zinc-400">
                  No hay horarios disponibles ese día. Prueba con otro.
                </p>
              )}
            </div>
          )}
        </Tarjeta>
      </main>
    </div>
  );
}