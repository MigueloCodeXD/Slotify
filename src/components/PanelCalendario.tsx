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
  confirmada: "bg-teal-500",
  pendiente: "bg-fuchsia-500",
  completada: "bg-sky-500",
  no_show: "bg-amber-500",
  cancelada: "bg-rose-400",
};

const COLOR_CHIP: Record<string, string> = {
  confirmada: "border-teal-200 bg-teal-50 text-teal-700",
  pendiente: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  completada: "border-sky-200 bg-sky-50 text-sky-700",
  no_show: "border-amber-200 bg-amber-50 text-amber-700",
  cancelada: "border-rose-200 bg-rose-50 text-rose-400 line-through",
};

const TONO_ESTADO: Record<string, string> = {
  confirmada: "bg-teal-50 text-teal-700 border-teal-200",
  pendiente: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  completada: "bg-sky-50 text-sky-700 border-sky-200",
  no_show: "bg-amber-50 text-amber-700 border-amber-200",
  cancelada: "bg-rose-50 text-rose-400 border-rose-200",
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
  const [pagoCita, setPagoCita] = useState<CitaProfesional | null>(null);
  const [enviandoPago, setEnviandoPago] = useState(false);

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

  async function registrarPago(c: CitaProfesional, monto: number, metodo: string, otro?: string) {
    const token = (await getTokenSesion()) ?? undefined;
    setEnviandoPago(true);
    try {
      await llamarEdge("registrar-pago", { cita_id: c.id, monto, metodo, otro }, token);
      notificar("Pago registrado.", "exito");
      setPagoCita(null);
      await cargar();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviandoPago(false);
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
          <h1 className="font-display text-3xl font-semibold text-zinc-900 animate-fade-up">Calendario</h1>
          <p className="mt-1 text-sm text-zinc-500">Gestiona tus citas del {vista === "semana" ? "día a día" : "mes"}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 flex overflow-hidden rounded-xl border border-zinc-200 bg-white text-xs font-semibold">
            <button
              onClick={() => setVista("mes")}
              className={`px-3 py-2 transition ${vista === "mes" ? "bg-[var(--primary-600)] text-white" : "bg-transparent text-zinc-500 hover:text-[var(--primary-700)]"}`}
            >
              Mes
            </button>
            <button
              onClick={() => setVista("semana")}
              className={`px-3 py-2 transition ${vista === "semana" ? "bg-[var(--primary-600)] text-white" : "bg-transparent text-zinc-500 hover:text-[var(--primary-700)]"}`}
            >
              Semana
            </button>
          </div>
          <button
            onClick={() => navegar(-1)}
            className="glass glass-hover flex h-9 w-9 items-center justify-center rounded-xl text-zinc-700"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            onClick={volverHoy}
            className="glass glass-hover rounded-xl px-3 py-1.5 text-sm text-zinc-700"
          >
            Hoy
          </button>
          <button
            onClick={() => setNuevaCita(true)}
            className="rounded-xl bg-[var(--primary-600)] px-3 py-1.5 text-sm font-semibold text-white shadow-lg shadow-[var(--primary-900)]/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-700)] active:scale-95"
          >
            + Nueva cita
          </button>
          <button
            onClick={() => navegar(1)}
            className="glass glass-hover flex h-9 w-9 items-center justify-center rounded-xl text-zinc-700"
            aria-label="Siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {/* ---- Citas de hoy: línea de tiempo vertical ---- */}
      <Tarjeta className="p-4 sm:p-5 animate-fade-up">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">Agenda de hoy</h2>
          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold capitalize text-zinc-600">
            {new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date())}
          </span>
        </div>
        {citasHoy.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes citas confirmadas para hoy.</p>
        ) : (
          <div className="relative space-y-3">
            <span className="absolute top-1 bottom-1 left-[7px] w-px bg-zinc-200" aria-hidden />
            {citasHoy.map((c, i) => (
              <div
                key={c.id}
                className="relative flex items-center gap-3 rounded-xl pl-1 animate-card-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span
                  className={`relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm ${COLOR_DOT[c.estado] ?? "bg-teal-500"}`}
                />
                <button
                  onClick={() => setSelId(selId === c.id ? null : c.id)}
                  className="glass glass-hover flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      <span className="font-mono text-[var(--primary-700)]">{fmtHora(c.start)}</span> ·{" "}
                      {c.cliente?.nombre}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
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
          <h2 className="font-display text-lg font-semibold capitalize text-zinc-900">{tituloPeriodo}</h2>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary-600)]" /> Citas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Bloqueos
            </span>
          </div>
        </div>

        {vista === "semana" && (
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <div className="grid grid-cols-7 gap-px bg-zinc-100">
              {diasSemana.map((d) => {
                const { citas: delDia, bloqueos: bloqueosDia, esHoy } = eventosDelDia(d);
                const extraSemana = delDia.length + bloqueosDia.length;
                return (
                  <div
                    key={d.toISOString()}
                    onClick={() => extraSemana > 0 && setDiaAbierto(keyDia(d))}
                    title={extraSemana > 0 ? "Ver citas del día" : undefined}
                    className={`min-h-[140px] bg-white p-1.5 ${extraSemana > 0 ? "cursor-pointer" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-0.5 border-b border-zinc-100 pb-1.5 text-center">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                          esHoy ? "bg-[var(--primary-600)] text-white" : "text-zinc-700"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        {DIAS_SEMANA[(d.getDay() + 6) % 7]}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {bloqueosDia.map((b) => (
                        <div
                          key={b.id}
                          className="truncate rounded-md border border-rose-200 bg-rose-50 px-1 py-0.5 font-mono text-[10px] text-rose-700"
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
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <div className="grid grid-cols-7 bg-zinc-100/60 text-center">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-zinc-100">
              {grid.map((d) => {
                const { citas: delDia, bloqueos: bloqueosDia, esHoy, fueraMes } = eventosDelDia(d);
                const extra = delDia.length + bloqueosDia.length;
                return (
                  <div
                    key={d.toISOString()}
                    onClick={() => extra > 0 && setDiaAbierto(keyDia(d))}
                    title={extra > 0 ? "Ver citas del día" : undefined}
                    className={`flex min-h-[64px] flex-col gap-1 bg-white p-1.5 transition-colors duration-200 hover:bg-[var(--primary-50)]/50 sm:min-h-[92px] ${
                      fueraMes ? "bg-zinc-50/50" : ""
                    } ${extra > 0 ? "cursor-pointer" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                          esHoy
                            ? "bg-[var(--primary-600)] text-white"
                            : fueraMes
                              ? "text-zinc-400"
                              : "text-zinc-700"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {extra > 0 && (
                        <span className="flex gap-1">
                          {delDia.length > 0 && <span className="h-2 w-2 rounded-full bg-[var(--primary-600)]" />}
                          {bloqueosDia.length > 0 && <span className="h-2 w-2 rounded-full bg-rose-400" />}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {bloqueosDia.slice(0, 1).map((b) => (
                        <div
                          key={b.id}
                          className="truncate rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-rose-700"
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
                        <div className="px-1.5 font-mono text-[10px] font-semibold text-[var(--primary-700)]">
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
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-sm">🔒</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
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
          <p className="mt-2 text-xs font-semibold text-rose-600">
            Este bloqueo solapa una cita existente. Ajusta el rango.
          </p>
        )}
        {bloqueoEditId && (
          <button
            onClick={cancelarEditarBloqueo}
            className="mt-2 text-xs font-semibold text-zinc-500 underline-offset-2 transition hover:text-zinc-700 hover:underline"
          >
            Cancelar edición
          </button>
        )}

        {bloqueos.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Mis bloqueos</h3>
            <ul className="flex flex-col gap-2">
              {bloqueos.map((b) => (
                <li
                  key={b.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                    bloqueoEditId === b.id
                      ? "border-rose-200 bg-rose-50"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-rose-600">
                      {fmtPill(fechaLocal(b.start), TZ)} · {fmtHora(b.start)}–{fmtHora(b.end)}
                      {fechaLocal(b.end) !== fechaLocal(b.start) && (
                        <span className="text-zinc-400"> hasta {fmtPill(fechaLocal(b.end), TZ)}</span>
                      )}
                    </p>
                    {b.motivo && <p className="truncate text-xs text-zinc-500">{b.motivo}</p>}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="glass-strong w-full max-w-md rounded-3xl p-5 text-zinc-900 shadow-2xl animate-scale-in">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-zinc-900">Reprogramar cita</h3>
                  <p className="text-sm text-zinc-500">
                    {cita.cliente?.nombre} · {cita.servicio?.nombre}
                  </p>
                </div>
                <button
                  onClick={() => setReproId(null)}
                  className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-zinc-100"
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
                        ? "border-[var(--primary-600)] bg-[var(--primary-600)] text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-[var(--primary-400)]"
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
                            ? "border-[var(--primary-600)] bg-[var(--primary-600)] text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-[var(--primary-400)]"
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
                <p className="py-6 text-center text-sm text-zinc-500">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="glass-strong max-h-[85vh] w-full max-w-lg overflow-auto rounded-3xl p-5 text-zinc-900 shadow-2xl animate-scale-in">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold capitalize text-zinc-900">
                    {new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(diaAbierto))}
                  </h3>
                  <p className="text-sm text-zinc-500">
                    {delDia.length} cita{delDia.length === 1 ? "" : "s"}
                    {bloqueosDia.length > 0 && ` · ${bloqueosDia.length} bloqueo${bloqueosDia.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <button
                  onClick={() => setDiaAbierto(null)}
                  className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-zinc-100"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {delDia.length === 0 && bloqueosDia.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">Este día no tiene citas ni bloqueos.</p>
              ) : (
                <ul className="space-y-2">
                  {bloqueosDia.map((b) => (
                    <li
                      key={`b-${b.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-rose-700">
                        🔒 {fmtHora(b.start)}–{fmtHora(b.end)}
                      </span>
                      {b.motivo && <span className="text-xs text-rose-500">{b.motivo}</span>}
                    </li>
                  ))}
                  {delDia.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => {
                          setDiaAbierto(null);
                          setSelId(c.id);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition hover:bg-[var(--primary-50)]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900">
                            <span className="font-mono text-[var(--primary-700)]">{fmtHora(c.start)}</span> · {c.cliente?.nombre}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="glass-strong w-full max-w-lg rounded-3xl p-5 text-zinc-900 shadow-2xl animate-scale-in">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-zinc-900">
                    {cita.cliente?.nombre ?? "Cliente"}
                  </h3>
                  <p className="text-sm text-zinc-500">
                    <span className="font-mono text-[var(--primary-700)]">{fmtHora(cita.start)}</span> – {fmtHora(cita.end)} ·{" "}
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
                  className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-zinc-100"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-600">
                {cita.cliente?.email && <p>📧 {cita.cliente.email}</p>}
                {cita.cliente?.telefono && <p>📱 {cita.cliente.telefono}</p>}
                {cita.estado !== "cancelada" && (
                  <p>💲 Precio: <span className="font-mono font-semibold text-zinc-900">{fmtMoneda(cita.precio_servicio)}</span></p>
                )}
                {cita.estado_pago && cita.estado_pago !== "pendiente" && (
                  <p>
                    {cita.estado_pago === "pagado" ? "✅" : "🟡"} Pago:{" "}
                    <span className="font-mono font-semibold text-zinc-900">{cita.estado_pago === "pagado" ? "Pagado" : "Parcial"}</span>
                    {cita.anticipo != null && cita.anticipo > 0 && (
                      <span className="text-zinc-500"> · {fmtMoneda(cita.anticipo)}</span>
                    )}
                  </p>
                )}
                {cita.estado_pago !== "pagado" && cita.estado !== "cancelada" && (
                  <Boton
                    variante="primario"
                    className="mt-2 w-full"
                    onClick={() => setPagoCita(cita)}
                  >
                    💳 Registrar pago
                  </Boton>
                )}
                <button
                  onClick={() => abrirHistorial(cita.cliente!.id)}
                  className="mt-1.5 font-semibold text-[var(--primary-700)] hover:text-[var(--primary-800)] hover:underline"
                >
                  Ver historial del cliente →
                </button>
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold text-zinc-500">Notas</label>
                <textarea
                  value={notasDraft}
                  onChange={(e) => setNotasDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/25"
                  placeholder="Anota observaciones, seguimiento, intereses del cliente…"
                />
                <button
                  onClick={guardarNotas}
                  className="mt-1 text-xs font-semibold text-[var(--primary-700)] hover:text-[var(--primary-800)] hover:underline"
                >
                  💾 Guardar notas
                </button>
              </div>

              {detalleMsg && (
                <p className="mb-3 text-sm font-semibold text-[var(--primary-700)]">{detalleMsg}</p>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="glass-strong max-h-[80vh] w-full max-w-lg overflow-auto rounded-3xl p-5 text-zinc-900 shadow-2xl animate-scale-in">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-zinc-900">
                  Historial de {historial?.cliente?.nombre ?? "…"}
                </h3>
                {historial?.cliente?.email && (
                  <p className="text-sm text-zinc-500">{historial.cliente.email}</p>
                )}
              </div>
              <button
                onClick={() => setHistorial(null)}
                className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-zinc-100"
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
              <p className="py-6 text-center text-sm text-zinc-500">
                Este cliente no tiene citas registradas.
              </p>
            ) : (
              <div className="space-y-2">
                {historial!.citas.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm animate-card-in"
                  >
                    <div>
                      <p className="font-semibold text-zinc-900">{h.servicio?.nombre}</p>
                      <p className="font-mono text-xs text-zinc-500">
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

      {pagoCita && <ModalPago cita={pagoCita} enviando={enviandoPago} onCancel={() => setPagoCita(null)} onConfirm={(m, metodo, otro) => registrarPago(pagoCita, m, metodo, otro)} />}
    </div>
  );
}

function ModalPago({
  cita,
  enviando,
  onCancel,
  onConfirm,
}: {
  cita: CitaProfesional;
  enviando: boolean;
  onCancel: () => void;
  onConfirm: (monto: number, metodo: string, otro?: string) => void;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [otro, setOtro] = useState("");
  const [error, setError] = useState<string | null>(null);

  const precio = Number(cita.precio_servicio ?? 0);
  const anticipo = Number(cita.anticipo ?? 0);
  const pendiente = Math.max(0, precio - anticipo);

  function enviar() {
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) {
      setError("Ingresa un monto válido.");
      return;
    }
    if (m > pendiente) {
      setError(`No puedes pagar más de lo pendiente (${fmtMoneda(pendiente)}).`);
      return;
    }
    if (metodo === "otro" && !otro.trim()) {
      setError("Describe el método de pago.");
      return;
    }
    setError(null);
    onConfirm(m, metodo, otro.trim() || undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="glass-strong w-full max-w-md rounded-3xl p-5 text-zinc-900 shadow-2xl animate-scale-in">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-zinc-900">Registrar pago</h3>
          <button
            onClick={onCancel}
            className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          {cita.cliente?.nombre} · {cita.servicio?.nombre}
        </p>
        <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Precio <span className="font-mono text-[var(--primary-700)]">{fmtMoneda(precio)}</span>
          <span className="mx-2 text-zinc-400">·</span>
          Pagado <span className="font-mono text-emerald-600">{fmtMoneda(anticipo)}</span>
          <span className="mx-2 text-zinc-400">·</span>
          Resta <span className="font-mono text-amber-600">{fmtMoneda(pendiente)}</span>
        </div>

        <label className="mt-4 block text-xs font-semibold text-zinc-500">Monto</label>
        <input
          type="number"
          autoFocus
          value={monto}
          min={0.01}
          max={pendiente}
          step="0.01"
          onChange={(e) => setMonto(e.target.value)}
          placeholder={`Monto (máx. ${fmtMoneda(pendiente)})`}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
        />

        <label className="mt-3 block text-xs font-semibold text-zinc-500">Método</label>
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta (débito/crédito)</option>
          <option value="transferencia">Transferencia / Nequi</option>
          <option value="otro">Otro (escribir)</option>
        </select>

        {metodo === "otro" && (
          <input
            value={otro}
            onChange={(e) => setOtro(e.target.value)}
            placeholder="Ej: bonificación, convenio…"
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
          />
        )}

        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Boton variante="secundario" className="flex-1" disabled={enviando} onClick={onCancel}>
            Cancelar
          </Boton>
          <Boton variante="primario" className="flex-1" disabled={enviando} onClick={enviar}>
            {enviando ? "Guardando…" : "Guardar pago"}
          </Boton>
        </div>
      </div>
    </div>
  );
}