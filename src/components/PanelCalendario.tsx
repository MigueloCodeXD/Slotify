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
import { TZ } from "@/lib/zonaHoraria";
import type { CitaProfesional, Bloqueo, Profesional } from "@/types";


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

function fmtMoneda(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return "$" + (Number.isFinite(n) ? n : 0).toFixed(2);
}

function fmtInputTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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

function lunesDe(d: Date): Date {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  a.setDate(a.getDate() - ((a.getDay() + 6) % 7));
  return a;
}

export function PanelCalendario({ profesionalIdTarget }: { profesionalIdTarget?: string | null }) {
  const { notificar } = useToast();
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [vista, setVista] = useState<"mes" | "semana">("mes");
  const [semanaBase, setSemanaBase] = useState(() => lunesDe(new Date()));
  const [citas, setCitas] = useState<CitaProfesional[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);

  const [bloqueoForm, setBloqueoForm] = useState({ fecha: "", hasta: "", inicio: "", fin: "", motivo: "" });
  const [bloqueoEditId, setBloqueoEditId] = useState<string | null>(null);
  const [bloqueoOcupado, setBloqueoOcupado] = useState(false);

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
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  const reproDias = useMemo(() => diasProximos(14, TZ), []);

  const grid = useMemo(() => construirMesa(mes), [mes]);

  const diasSemana = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(semanaBase);
        d.setDate(semanaBase.getDate() + i);
        return d;
      }),
    [semanaBase]
  );

  const cargar = useCallback(async (mostrarCarga = false) => {
    if (mostrarCarga) setCargando(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      let primerDia: Date;
      let ultimoDia: Date;
      if (vista === "semana") {
        primerDia = new Date(semanaBase);
        ultimoDia = new Date(semanaBase);
        ultimoDia.setDate(semanaBase.getDate() + 6);
      } else {
        primerDia = new Date(mes.getFullYear(), mes.getMonth(), 1);
        ultimoDia = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
      }
      const desde = fechaLocal(primerDia.toISOString()).slice(0, 10);
      const hasta = fechaLocal(ultimoDia.toISOString()).slice(0, 10);
      const res = await llamarEdge<{ citas: CitaProfesional[]; bloqueos: Bloqueo[] }>(
        "consultar-agenda-dia",
        { desde, hasta, profesional_id: profesionalIdTarget ?? undefined },
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
  }, [mes, vista, semanaBase, notificar, profesionalIdTarget]);

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
    setBloqueoOcupado(false);
    const hasta = bloqueoForm.hasta || bloqueoForm.fecha;
    const start = new Date(`${bloqueoForm.fecha}T${bloqueoForm.inicio}:00-05:00`).toISOString();
    const end = new Date(`${hasta}T${bloqueoForm.fin}:00-05:00`).toISOString();
    if (new Date(end) <= new Date(start)) {
      notificar("El bloqueo debe terminar después de comenzar.", "error");
      return;
    }
    const token = (await getTokenSesion()) ?? undefined;
    try {
      if (bloqueoEditId) {
        await llamarEdge("actualizar-bloqueo", { id: bloqueoEditId, start, end, motivo: bloqueoForm.motivo, profesional_id: profesionalIdTarget ?? undefined }, token);
      } else {
        await llamarEdge("crear-bloqueo", { start, end, motivo: bloqueoForm.motivo, profesional_id: profesionalIdTarget ?? undefined }, token);
      }
      setBloqueoForm({ fecha: "", hasta: "", inicio: "", fin: "", motivo: "" });
      setBloqueoEditId(null);
      await cargar();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("solapa")) setBloqueoOcupado(true);
      notificar(msg, "error");
    }
  }

  function abrirEditarBloqueo(b: Bloqueo) {
    setBloqueoEditId(b.id);
    setBloqueoForm({
      fecha: fechaLocal(b.start),
      hasta: fechaLocal(b.end) === fechaLocal(b.start) ? "" : fechaLocal(b.end),
      inicio: fmtInputTime(b.start),
      fin: fmtInputTime(b.end),
      motivo: b.motivo ?? "",
    });
    setBloqueoOcupado(false);
  }

  function cancelarEditarBloqueo() {
    setBloqueoEditId(null);
    setBloqueoForm({ fecha: "", hasta: "", inicio: "", fin: "", motivo: "" });
    setBloqueoOcupado(false);
  }

  async function eliminarBloqueo(b: Bloqueo) {
    const token = (await getTokenSesion()) ?? undefined;
    const confirmado = window.confirm(`¿Eliminar este bloqueo${b.motivo ? ` (${b.motivo})` : ""}?`);
    if (!confirmado) return;
    try {
      await llamarEdge("eliminar-bloqueo", { id: b.id, profesional_id: profesionalIdTarget ?? undefined }, token);
      if (bloqueoEditId === b.id) cancelarEditarBloqueo();
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
          profesional_id: profesionalIdTarget ?? cita.profesional_id,
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
      await llamarEdge("reprogramar-cita-profesional", { cita_id: reproId, nuevo_start: reproSlot.start, profesional_id: profesionalIdTarget ?? undefined }, token);
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
      await llamarEdge("actualizar-cita-profesional", { cita_id: selId, estado, profesional_id: profesionalIdTarget ?? undefined }, token);
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
      await llamarEdge("actualizar-cita-profesional", { cita_id: selId, notas: notasDraft, profesional_id: profesionalIdTarget ?? undefined }, token);
      setCitas((prev) => prev.map((c) => (c.id === selId ? { ...c, notas: notasDraft } : c)));
      setDetalleMsg("Notas guardadas.");
    } catch (e) {
      setDetalleMsg((e as Error).message);
    }
  }

  async function eliminarCita(id: string) {
    setDetalleMsg(null);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("eliminar-cita-profesional", { cita_id: id, profesional_id: profesionalIdTarget ?? undefined }, token);
      setSelId(null);
      notificar("Cita eliminada.", "exito");
      await cargar();
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
        { cliente_id: clienteId, profesional_id: profesionalIdTarget ?? undefined },
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

  const hoyStr = fechaLocal(new Date().toISOString());
  const citasHoy = citas
    .filter((c) => c.estado !== "cancelada" && fechaLocal(c.start) === hoyStr)
    .sort((a, b) => a.start.localeCompare(b.start));

  function navegar(dir: number) {
    if (vista === "semana") {
      const n = new Date(semanaBase);
      n.setDate(semanaBase.getDate() + 7 * dir);
      setSemanaBase(n);
    } else {
      setMes(new Date(mes.getFullYear(), mes.getMonth() + dir, 1));
    }
  }

  function volverHoy() {
    if (vista === "semana") setSemanaBase(lunesDe(new Date()));
    else setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  }

  const tituloPeriodo =
    vista === "semana"
      ? (() => {
          const ini = diasSemana[0]!;
          const fin = diasSemana[6]!;
          const fMismoMes = ini.getMonth() === fin.getMonth();
          const fmt = (d: Date, conAño: boolean) =>
            new Intl.DateTimeFormat("es", { day: "numeric", month: fMismoMes ? (conAño ? "long" : "short") : "short", year: conAño ? "numeric" : undefined, timeZone: TZ }).format(
              new Date(d.getFullYear(), d.getMonth(), d.getDate())
            );
          return `${fmt(ini, false)} – ${fmt(fin, true)}`;
        })()
      : new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(mes);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white animate-fade-up">Calendario</h1>
          <p className="mt-1 text-sm text-violet-200/60">Gestiona tus citas del {vista === "semana" ? "día a día" : "mes"}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 flex overflow-hidden rounded-xl border border-white/10 text-xs font-semibold">
            <button
              onClick={() => setVista("mes")}
              className={`px-3 py-2 transition ${vista === "mes" ? "bg-white/15 text-white" : "bg-transparent text-zinc-400 hover:text-white"}`}
            >
              Mes
            </button>
            <button
              onClick={() => setVista("semana")}
              className={`px-3 py-2 transition ${vista === "semana" ? "bg-white/15 text-white" : "bg-transparent text-zinc-400 hover:text-white"}`}
            >
              Semana
            </button>
          </div>
          <button
            onClick={() => navegar(-1)}
            className="glass glass-hover flex h-9 w-9 items-center justify-center rounded-xl text-white"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            onClick={volverHoy}
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
            onClick={() => navegar(1)}
            className="glass glass-hover flex h-9 w-9 items-center justify-center rounded-xl text-white"
            aria-label="Siguiente"
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
                      {c.precio_servicio != null ? ` · ${fmtMoneda(c.precio_servicio)}` : ""}
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
          <h2 className="font-display text-lg font-semibold capitalize text-white">{tituloPeriodo}</h2>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> Citas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" /> Bloqueos
            </span>
          </div>
        </div>

        {vista === "semana" && (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-7 gap-px bg-white/[0.06]">
              {diasSemana.map((d) => {
                const { citas: delDia, bloqueos: bloqueosDia, esHoy } = eventosDelDia(d);
                const extraSemana = delDia.length + bloqueosDia.length;
                return (
                  <div
                    key={d.toISOString()}
                    onClick={() => extraSemana > 0 && setDiaAbierto(keyDia(d))}
                    title={extraSemana > 0 ? "Ver citas del día" : undefined}
                    className={`min-h-[140px] bg-[#0b0817]/90 p-1.5 ${extraSemana > 0 ? "cursor-pointer" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-0.5 border-b border-white/[0.06] pb-1.5 text-center">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                          esHoy ? "bg-gradient-to-br from-violet-500 to-fuchsia-400 text-white" : "text-zinc-300"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        {DIAS_SEMANA[(d.getDay() + 6) % 7]}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {bloqueosDia.map((b) => (
                        <div
                          key={b.id}
                          className="truncate rounded-md border border-rose-300/20 bg-rose-400/10 px-1 py-0.5 font-mono text-[10px] text-rose-200"
                          title={`Bloqueo ${fmtHora(b.start)}–${fmtHora(b.end)}${b.motivo ? " · " + b.motivo : ""}`}
                        >
                          🔒 {fmtHora(b.start)}
                        </div>
                      ))}
                      {delDia.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => setSelId(selId === c.id ? null : c.id)}
                          title={`${c.cliente?.nombre} · ${fmtHora(c.start)}–${fmtHora(c.end)} · ${c.estado}`}
                          className={`cursor-pointer truncate rounded-md border px-1 py-0.5 font-mono text-[10px] transition-all duration-200 ${
                            COLOR_CHIP[c.estado] ?? COLOR_CHIP.confirmada
                          }`}
                        >
                          {fmtHora(c.start)} · {c.servicio?.nombre}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {vista === "mes" && (
          cargando ? (
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
                    onClick={() => extra > 0 && setDiaAbierto(keyDia(d))}
                    title={extra > 0 ? "Ver citas del día" : undefined}
                    className={`flex min-h-[64px] flex-col gap-1 bg-[#0b0817]/80 p-1.5 transition-colors duration-200 hover:bg-white/[0.04] sm:min-h-[92px] ${
                      fueraMes ? "bg-transparent" : ""
                    } ${extra > 0 ? "cursor-pointer" : ""}`}
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
                        <div className="px-1.5 font-mono text-[10px] font-semibold text-violet-300/80">
                          +{delDia.length - 2} más…
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Tarjeta>

      <Tarjeta className="p-5 animate-fade-up [animation-delay:200ms]">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-400/15 text-sm">🔒</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
            {bloqueoEditId ? "Editar bloqueo" : "Crear bloqueo"}
          </h2>
        </div>
        <form onSubmit={crearBloqueo} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Campo
            label="Desde"
            type="date"
            value={bloqueoForm.fecha}
            onChange={(e) => setBloqueoForm({ ...bloqueoForm, fecha: e.target.value })}
          />
          <Campo
            label="Hasta"
            type="date"
            value={bloqueoForm.hasta}
            onChange={(e) => setBloqueoForm({ ...bloqueoForm, hasta: e.target.value })}
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
              {bloqueoEditId ? "Guardar" : "Crear"}
            </Boton>
          </div>
        </form>
        <p className="mt-2 text-xs text-zinc-500">
          Dejar &quot;Hasta&quot; en blanco crea un bloqueo de un solo día.
        </p>
        {bloqueoOcupado && (
          <p className="mt-2 text-xs font-semibold text-rose-300">
            Este bloqueo solapa una cita existente. Ajusta el rango.
          </p>
        )}
        {bloqueoEditId && (
          <button
            onClick={cancelarEditarBloqueo}
            className="mt-2 text-xs font-semibold text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
          >
            Cancelar edición
          </button>
        )}

        {bloqueos.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">Mis bloqueos</h3>
            <ul className="flex flex-col gap-2">
              {bloqueos.map((b) => (
                <li
                  key={b.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                    bloqueoEditId === b.id
                      ? "border-rose-400/50 bg-rose-400/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-rose-100">
                      {fmtPill(fechaLocal(b.start), TZ)} · {fmtHora(b.start)}–{fmtHora(b.end)}
                      {fechaLocal(b.end) !== fechaLocal(b.start) && (
                        <span className="text-zinc-400"> hasta {fmtPill(fechaLocal(b.end), TZ)}</span>
                      )}
                    </p>
                    {b.motivo && <p className="truncate text-xs text-zinc-400">{b.motivo}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Boton
                      variante="secundario"
                      className="h-7 px-3 text-xs"
                      onClick={() => abrirEditarBloqueo(b)}
                    >
                      Editar
                    </Boton>
                    <Boton
                      variante="peligro"
                      className="h-7 px-3 text-xs"
                      onClick={() => eliminarBloqueo(b)}
                    >
                      Eliminar
                    </Boton>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
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

      {/* ---- Detalle del día ---- */}
      {diaAbierto && (() => {
        const delDia = citas
          .filter((c) => fechaLocal(c.start) === diaAbierto)
          .sort((a, b) => a.start.localeCompare(b.start));
        const bloqueosDia = bloqueos.filter((b) => fechaLocal(b.start) === diaAbierto);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
            <div className="glass-strong max-h-[85vh] w-full max-w-lg overflow-auto rounded-3xl p-5 text-zinc-100 shadow-2xl animate-scale-in">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold capitalize text-white">
                    {new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(diaAbierto))}
                  </h3>
                  <p className="text-sm text-zinc-400">
                    {delDia.length} cita{delDia.length === 1 ? "" : "s"}
                    {bloqueosDia.length > 0 && ` · ${bloqueosDia.length} bloqueo${bloqueosDia.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <button
                  onClick={() => setDiaAbierto(null)}
                  className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {delDia.length === 0 && bloqueosDia.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-400">Este día no tiene citas ni bloqueos.</p>
              ) : (
                <ul className="space-y-2">
                  {bloqueosDia.map((b) => (
                    <li
                      key={`b-${b.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-rose-200">
                        🔒 {fmtHora(b.start)}–{fmtHora(b.end)}
                      </span>
                      {b.motivo && <span className="text-xs text-rose-200/70">{b.motivo}</span>}
                    </li>
                  ))}
                  {delDia.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => {
                          setDiaAbierto(null);
                          setSelId(c.id);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm transition hover:bg-white/[0.08]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-100">
                            <span className="font-mono text-violet-300">{fmtHora(c.start)}</span> · {c.cliente?.nombre}
                          </p>
                          <p className="truncate text-xs text-zinc-400">
                            {c.servicio?.nombre}
                            {c.precio_servicio != null ? ` · ${fmtMoneda(c.precio_servicio)}` : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${TONO_ESTADO[c.estado] ?? TONO_ESTADO.confirmada}`}
                        >
                          {c.estado === "no_show" ? "No asistió" : c.estado}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
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
                {cita.estado !== "cancelada" && (
                  <p>💲 Precio: <span className="font-mono font-semibold text-zinc-100">{fmtMoneda(cita.precio_servicio)}</span></p>
                )}
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
                <Boton variante="peligro" onClick={() => eliminarCita(cita.id)}>
                  🗑 Eliminar
                </Boton>
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
          profesionalId={profesionalIdTarget}
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