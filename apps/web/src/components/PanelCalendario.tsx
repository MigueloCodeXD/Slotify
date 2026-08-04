"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boton, Campo, Skeleton, Spinner, Tarjeta } from "@/components/ui";
import { Copiloto } from "@/components/Copiloto";
import NuevaCita from "@/components/NuevaCita";
import { useToast } from "@/components/Toast";
import { ChatIA } from "@/components/ChatIA";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import { diasProximos, fmtPill } from "@/lib/fechas";
import type { CitaProfesional, Bloqueo, Profesional } from "@/types";

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const COLOR_DOT: Record<string, string> = {
  confirmada: "bg-teal-400",
  pendiente: "bg-fuchsia-400",
  completada: "bg-sky-400",
  no_show: "bg-amber-400",
  cancelada: "bg-rose-400/70",
};

const COLOR_CHIP: Record<string, string> = {
  confirmada: "border-teal-300/30 bg-teal-400/10 text-teal-200",
  pendiente: "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-200",
  completada: "border-sky-300/30 bg-sky-400/10 text-sky-200",
  no_show: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  cancelada: "border-rose-300/25 bg-rose-400/5 text-rose-200/70 line-through",
};

const TONO_ESTADO: Record<string, string> = {
  confirmada: "bg-teal-400/10 text-teal-300 border-teal-300/25",
  pendiente: "bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-300/25",
  completada: "bg-sky-400/10 text-sky-300 border-sky-300/25",
  no_show: "bg-amber-400/10 text-amber-300 border-amber-300/25",
  cancelada: "bg-rose-400/10 text-rose-300/80 border-rose-400/25",
};

function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function fechaLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

function keyDia(d: Date): string {
  return fechaLocal(d.toISOString());
}

function construirMesa(mes: Date): Date[] {
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const desplazamiento = (primero.getDay() + 6) % 7;
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1 - desplazamiento);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return d;
  });
}

export function PanelCalendario() {
  const { notificar } = useToast();
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [citas, setCitas] = useState<CitaProfesional[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);

  const [bloqueoForm, setBloqueoForm] = useState({ fecha: "", inicio: "", fin: "", motivo: "" });

  const [reproId, setReproId] = useState<string | null>(null);
  const [reproDia, setReproDia] = useState("");
  const [reproSlot, setReproSlot] = useState<{ start: string; end: string } | null>(null);
  const [reproSlots, setReproSlots] = useState<{ start: string; end: string }[]>([]);
  const [reproCargando, setReproCargando] = useState(false);
  const [reproOcupado, setReproOcupado] = useState(false);

  const [notasDraft, setNotasDraft] = useState("");
  const [historial, setHistorial] = useState<{
    cliente: { id: string; nombre: string; email: string; telefono: string | null } | null;
    citas: CitaProfesional[];
  } | null>(null);
  const [historialCargando, setHistorialCargando] = useState(false);
  const [detalleMsg, setDetalleMsg] = useState<string | null>(null);
  const [nuevaCita, setNuevaCita] = useState(false);

  const reproDias = useMemo(() => diasProximos(14, TZ), []);

  const grid = useMemo(() => construirMesa(mes), [mes]);

  const cargar = useCallback(async (mostrarCarga = false) => {
    if (mostrarCarga) setCargando(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const desde = new Date(mes.getFullYear(), mes.getMonth(), 1).toISOString().slice(0, 10);
      const hasta = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).toISOString().slice(0, 10);
      const res = await llamarEdge<{ citas: CitaProfesional[]; bloqueos: Bloqueo[] }>(
        "consultar-agenda-dia",
        { desde, hasta },
        token
      );
      setCitas(res.citas ?? []);
      setBloqueos(res.bloqueos ?? []);
      setSelId(null);
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }, [mes, notificar]);

  useEffect(() => {
    const cita = citas.find((c) => c.id === selId);
    setNotasDraft(cita?.notas ?? "");
    setDetalleMsg(null);
    setHistorial(null);
  }, [selId, citas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearBloqueo(e: React.FormEvent) {
    e.preventDefault();
    if (!bloqueoForm.fecha || !bloqueoForm.inicio || !bloqueoForm.fin) return;
    const start = new Date(`${bloqueoForm.fecha}T${bloqueoForm.inicio}:00-05:00`).toISOString();
    const end = new Date(`${bloqueoForm.fecha}T${bloqueoForm.fin}:00-05:00`).toISOString();
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("crear-bloqueo", { start, end, motivo: bloqueoForm.motivo }, token);
      setBloqueoForm({ fecha: "", inicio: "", fin: "", motivo: "" });
      await cargar();
    } catch (err) {
      notificar((err as Error).message, "error");
    }
  }

  function abrirReprogramar(id: string) {
    setReproId(id);
    setReproDia(reproDias[0] ?? "");
    setReproSlot(null);
    setReproSlots([]);
    setReproOcupado(false);
    void cargarSlots(reproDias[0] ?? "");
  }

  async function cargarSlots(dia: string) {
    const cita = citas.find((c) => c.id === reproId);
    if (!cita) return;
    setReproDia(dia);
    setReproSlot(null);
    setReproCargando(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const res = await llamarEdge<{ slots: { start: string; end: string }[] }>(
        "consultar-disponibilidad",
        {
          servicio_id: cita.servicio?.id,
          profesional_id: cita.profesional_id,
          fecha: dia,
          dias: 1,
        },
        token
      );
      setReproSlots((res.slots ?? []).sort((a, b) => a.start.localeCompare(b.start)));
    } catch (e) {
      notificar((e as Error).message, "error");
      setReproSlots([]);
    } finally {
      setReproCargando(false);
    }
  }

  async function confirmarReprogramar() {
    if (!reproId || !reproSlot) return;
    setReproOcupado(false);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("reprogramar-cita-profesional", { cita_id: reproId, nuevo_start: reproSlot.start }, token);
      setReproId(null);
      setSelId(null);
      await cargar();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("disponible")) setReproOcupado(true);
      notificar(msg, "error");
    }
  }

  async function cambiarEstado(estado: string) {
    if (!selId) return;
    setDetalleMsg(null);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("actualizar-cita-profesional", { cita_id: selId, estado }, token);
      await cargar();
    } catch (e) {
      setDetalleMsg((e as Error).message);
    }
  }

  async function guardarNotas() {
    if (!selId) return;
    setDetalleMsg(null);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("actualizar-cita-profesional", { cita_id: selId, notas: notasDraft }, token);
      setCitas((prev) => prev.map((c) => (c.id === selId ? { ...c, notas: notasDraft } : c)));
      setDetalleMsg("Notas guardadas.");
    } catch (e) {
      setDetalleMsg((e as Error).message);
    }
  }

  async function abrirHistorial(clienteId: string) {
    setHistorialCargando(true);
    setHistorial(null);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const res = await llamarEdge<{ cliente: Profesional | null; citas: CitaProfesional[] }>(
        "historial-cliente-profesional",
        { cliente_id: clienteId },
        token
      );
      setHistorial({ cliente: res.cliente, citas: res.citas ?? [] });
    } catch (e) {
      setDetalleMsg((e as Error).message);
    } finally {
      setHistorialCargando(false);
    }
  }

  const eventosDelDia = (d: Date) => {
    const k = keyDia(d);
    const hoy = fechaLocal(new Date().toISOString());
    const citasDia = citas
      .filter((c) => fechaLocal(c.start) === k)
      .sort((a, b) => a.start.localeCompare(b.start));
    const bloqueosDia = bloqueos.filter((b) => fechaLocal(b.start) === k);
    return { citas: citasDia, bloqueos: bloqueosDia, esHoy: k === hoy, fueraMes: d.getMonth() !== mes.getMonth() };
  };

  const tituloMes = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(mes);

  const hoyStr = fechaLocal(new Date().toISOString());
  const citasHoy = citas
    .filter((c) => c.estado !== "cancelada" && fechaLocal(c.start) === hoyStr)
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white animate-fade-up">Calendario</h1>
          <p className="mt-1 text-sm text-violet-200/60">Gestiona tus citas del mes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            className="glass glass-hover flex h-9 w-9 items-center justify-center rounded-xl text-white"
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <button
            onClick={() => setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="glass glass-hover rounded-xl px-3 py-1.5 text-sm text-white"
          >
            Hoy
          </button>
          <button
            onClick={() => setNuevaCita(true)}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-violet-400 px-3 py-1.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 hover:-translate-y-0.5 hover:to-fuchsia-400 active:scale-95"
          >
            + Nueva cita
          </button>
          <button
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            className="glass glass-hover flex h-9 w-9 items-center justify-center rounded-xl text-white"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {/* ---- Citas de hoy: línea de tiempo vertical ---- */}
      <Tarjeta className="p-4 sm:p-5 animate-fade-up">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Agenda de hoy</h2>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold capitalize text-violet-200">
            {new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date())}
          </span>
        </div>
        {citasHoy.length === 0 ? (
          <p className="text-sm text-zinc-400">No tienes citas confirmadas para hoy.</p>
        ) : (
          <div className="relative space-y-3">
            <span className="absolute top-1 bottom-1 left-[7px] w-px bg-white/10" aria-hidden />
            {citasHoy.map((c, i) => (
              <div
                key={c.id}
                className="relative flex items-center gap-3 rounded-xl pl-1 animate-card-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span
                  className={`relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[#0b0817] ${COLOR_DOT[c.estado] ?? "bg-teal-400"}`}
                />
                <button
                  onClick={() => setSelId(selId === c.id ? null : c.id)}
                  className="glass glass-hover flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      <span className="font-mono text-violet-300">{fmtHora(c.start)}</span> ·{" "}
                      {c.cliente?.nombre}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {c.servicio?.nombre} {c.servicio?.duracion_min ? `· ${c.servicio.duracion_min} min` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONO_ESTADO[c.estado] ?? TONO_ESTADO.confirmada}`}
                  >
                    {c.estado === "no_show" ? "No asistió" : c.estado}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>

      {/* ---- Calendario mensual ---- */}
      <Tarjeta className="p-4 sm:p-6 animate-fade-up [animation-delay:100ms]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold capitalize text-white">{tituloMes}</h2>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> Citas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" /> Bloqueos
            </span>
          </div>
        </div>

        {cargando ? (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-4" />
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-20 sm:h-28" />
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-7 bg-white/[0.03] text-center">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-white/[0.06]">
              {grid.map((d) => {
                const { citas: delDia, bloqueos: bloqueosDia, esHoy, fueraMes } = eventosDelDia(d);
                const extra = delDia.length + bloqueosDia.length;
                return (
                  <div
                    key={d.toISOString()}
                    className={`flex min-h-[64px] flex-col gap-1 bg-[#0b0817]/80 p-1.5 transition-colors duration-200 hover:bg-white/[0.04] sm:min-h-[92px] ${
                      fueraMes ? "bg-transparent" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                          esHoy
                            ? "bg-gradient-to-br from-violet-500 to-fuchsia-400 text-white"
                            : fueraMes
                              ? "text-zinc-600"
                              : "text-zinc-300"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {extra > 0 && (
                        <span className="flex gap-1">
                          {delDia.length > 0 && <span className="h-2 w-2 rounded-full bg-violet-400" />}
                          {bloqueosDia.length > 0 && <span className="h-2 w-2 rounded-full bg-rose-400/80" />}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {bloqueosDia.slice(0, 1).map((b) => (
                        <div
                          key={b.id}
                          className="truncate rounded-md border border-rose-300/20 bg-rose-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-rose-200"
                          title={`Bloqueo ${fmtHora(b.start)}–${fmtHora(b.end)}${b.motivo ? " · " + b.motivo : ""}`}
                        >
                          🔒 {fmtHora(b.start)}
                        </div>
                      ))}
                      {delDia.slice(0, 2).map((c) => (
                        <div
                          key={c.id}
                          onClick={() => setSelId(selId === c.id ? null : c.id)}
                          title={`${c.cliente?.nombre} · ${fmtHora(c.start)} – ${fmtHora(c.end)} · ${c.estado}`}
                          className={`cursor-pointer truncate rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium transition-all duration-200 ${
                            COLOR_CHIP[c.estado] ?? COLOR_CHIP.confirmada
                          }`}
                        >
                          {fmtHora(c.start)} · {c.servicio?.nombre}
                        </div>
                      ))}
                      {delDia.length > 2 && (
                        <div className="px-1.5 font-mono text-[10px] font-semibold text-zinc-500">
                          +{delDia.length - 2} más
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Tarjeta>

      <Tarjeta className="p-5 animate-fade-up [animation-delay:200ms]">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-400/15 text-sm">🔒</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Crear bloqueo</h2>
        </div>
        <form onSubmit={crearBloqueo} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Campo
            label="Fecha"
            type="date"
            value={bloqueoForm.fecha}
            onChange={(e) => setBloqueoForm({ ...bloqueoForm, fecha: e.target.value })}
          />
          <Campo
            label="Inicio"
            type="time"
            value={bloqueoForm.inicio}
            onChange={(e) => setBloqueoForm({ ...bloqueoForm, inicio: e.target.value })}
          />
          <Campo
            label="Fin"
            type="time"
            value={bloqueoForm.fin}
            onChange={(e) => setBloqueoForm({ ...bloqueoForm, fin: e.target.value })}
          />
          <Campo
            label="Motivo"
            placeholder="Almuerzo, vacaciones…"
            value={bloqueoForm.motivo}
            onChange={(e) => setBloqueoForm({ ...bloqueoForm, motivo: e.target.value })}
          />
          <div className="flex items-end">
            <Boton type="submit" variante="primario" className="w-full">
              Crear
            </Boton>
          </div>
        </form>
      </Tarjeta>

      <Copiloto onRecargar={cargar} />

      {/* ---- Reprogramar ---- */}
      {reproId && (() => {
        const cita = citas.find((c) => c.id === reproId);
        if (!cita) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
            <div className="glass-strong w-full max-w-md rounded-3xl p-5 text-zinc-100 shadow-2xl animate-scale-in">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-white">Reprogramar cita</h3>
                  <p className="text-sm text-zinc-400">
                    {cita.cliente?.nombre} · {cita.servicio?.nombre}
                  </p>
                </div>
                <button
                  onClick={() => setReproId(null)}
                  className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {reproDias.map((d) => (
                  <button
                    key={d}
                    onClick={() => cargarSlots(d)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      reproDia === d
                        ? "border-violet-400 bg-violet-500/30 text-white"
                        : "border-white/10 bg-white/[0.05] text-zinc-300 hover:border-violet-400/50"
                    }`}
                  >
                    {fmtPill(d, TZ)}
                  </button>
                ))}
              </div>

              {reproCargando ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : reproSlots.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {reproSlots.map((s) => (
                      <button
                        key={s.start}
                        onClick={() => setReproSlot(s)}
                        className={`rounded-xl border px-3 py-2 font-mono text-sm font-semibold transition ${
                          reproSlot?.start === s.start
                            ? "border-violet-400 bg-violet-500/30 text-white"
                            : "border-white/10 bg-white/[0.05] text-zinc-200 hover:border-violet-400/50"
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
                    <Boton
                      variante="primario"
                      onClick={confirmarReprogramar}
                      disabled={!reproSlot}
                      className="flex-1"
                    >
                      {reproOcupado ? "Reintentar" : "Confirmar cambio"}
                    </Boton>
                    <Boton variante="claro" onClick={() => setReproId(null)}>
                      Cancelar
                    </Boton>
                  </div>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-zinc-400">
                  No hay horarios disponibles ese día. Prueba con otro.
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ---- Detalle de cita ---- */}
      {selId && (() => {
        const cita = citas.find((c) => c.id === selId);
        if (!cita) return null;
        const botones: { estado?: string; texto: string; tono: string; confirmar?: boolean }[] = [];
        if (cita.estado === "confirmada") {
          botones.push({ estado: "completada", texto: "✓ Completar", tono: "primario" });
          botones.push({ estado: "no_show", texto: "No asistió", tono: "oscuro" });
          botones.push({ texto: "Reprogramar", tono: "claro", confirmar: true });
          botones.push({ estado: "cancelada", texto: "Cancelar", tono: "peligro" });
        } else if (cita.estado === "pendiente") {
          botones.push({ estado: "confirmada", texto: "Confirmar ahora", tono: "primario" });
          botones.push({ texto: "Reprogramar", tono: "claro", confirmar: true });
          botones.push({ estado: "cancelada", texto: "Cancelar", tono: "peligro" });
        } else {
          botones.push({ estado: "confirmada", texto: "Restaurar", tono: "claro" });
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
            <div className="glass-strong w-full max-w-lg rounded-3xl p-5 text-zinc-100 shadow-2xl animate-scale-in">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-white">
                    {cita.cliente?.nombre ?? "Cliente"}
                  </h3>
                  <p className="text-sm text-zinc-400">
                    <span className="font-mono text-violet-300">{fmtHora(cita.start)}</span> – {fmtHora(cita.end)} ·{" "}
                    {cita.servicio?.nombre}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONO_ESTADO[cita.estado] ?? TONO_ESTADO.confirmada}`}
                  >
                    {cita.estado === "no_show" ? "No asistió" : cita.estado}
                    {cita.estado === "pendiente" && cita.confirmacion_pendiente ? " · sin confirmar" : ""}
                  </span>
                </div>
                <button
                  onClick={() => setSelId(null)}
                  className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-zinc-300">
                {cita.cliente?.email && <p>📧 {cita.cliente.email}</p>}
                {cita.cliente?.telefono && <p>📱 {cita.cliente.telefono}</p>}
                <button
                  onClick={() => abrirHistorial(cita.cliente!.id)}
                  className="mt-1.5 font-semibold text-violet-300 hover:text-violet-200 hover:underline"
                >
                  Ver historial del cliente →
                </button>
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold text-zinc-400">Notas</label>
                <textarea
                  value={notasDraft}
                  onChange={(e) => setNotasDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-zinc-100 outline-none backdrop-blur transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/25"
                  placeholder="Anota observaciones, seguimiento, intereses del cliente…"
                />
                <button
                  onClick={guardarNotas}
                  className="mt-1 text-xs font-semibold text-violet-300 hover:text-violet-200 hover:underline"
                >
                  💾 Guardar notas
                </button>
              </div>

              {detalleMsg && (
                <p className="mb-3 text-sm font-semibold text-violet-300">{detalleMsg}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {botones.map((b) => (
                  <Boton
                    key={b.texto}
                    variante={
                      b.tono === "primario"
                        ? "primario"
                        : b.tono === "peligro"
                          ? "peligro"
                          : b.tono === "oscuro"
                            ? "secundario"
                            : "claro"
                    }
                    onClick={() => (b.confirmar ? abrirReprogramar(cita.id) : cambiarEstado(b.estado!))}
                  >
                    {b.texto}
                  </Boton>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ---- Historial del cliente ---- */}
      {(historial || historialCargando) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="glass-strong max-h-[80vh] w-full max-w-lg overflow-auto rounded-3xl p-5 text-zinc-100 shadow-2xl animate-scale-in">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Historial de {historial?.cliente?.nombre ?? "…"}
                </h3>
                {historial?.cliente?.email && (
                  <p className="text-sm text-zinc-400">{historial.cliente.email}</p>
                )}
              </div>
              <button
                onClick={() => setHistorial(null)}
                className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            {historialCargando ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : historial!.citas.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">
                Este cliente no tiene citas registradas.
              </p>
            ) : (
              <div className="space-y-2">
                {historial!.citas.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm animate-card-in"
                  >
                    <div>
                      <p className="font-semibold text-zinc-100">{h.servicio?.nombre}</p>
                      <p className="font-mono text-xs text-zinc-400">
                        {new Intl.DateTimeFormat("es", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: TZ,
                        }).format(new Date(h.start))}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${TONO_ESTADO[h.estado] ?? TONO_ESTADO.confirmada}`}
                    >
                      {h.estado === "no_show" ? "No asistió" : h.estado}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {historial?.cliente && (
              <div className="mt-4">
                <ChatIA clienteId={historial.cliente.id} titulo="Resumen del cliente" />
              </div>
            )}
          </div>
        </div>
      )}

      {nuevaCita && (
        <NuevaCita
          onCerrar={() => setNuevaCita(false)}
          onCreada={() => {
            setNuevaCita(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}