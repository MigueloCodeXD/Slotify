"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { Copiloto } from "@/components/Copiloto";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import type { CitaProfesional, Bloqueo } from "@/types";

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function keyDia(d: Date): string {
  return d.toISOString().slice(0, 10);
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

function keyHoy(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function PanelCalendario() {
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [citas, setCitas] = useState<CitaProfesional[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);

  const [bloqueoForm, setBloqueoForm] = useState({ fecha: "", inicio: "", fin: "", motivo: "" });

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
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cancelarCita(id: string) {
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("cancelar-cita-profesional", { cita_id: id }, token);
      setSelId(null);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
      setError((err as Error).message);
    }
  }

  const eventosDelDia = (d: Date) => {
    const k = keyDia(d);
    const hoy = keyHoy(new Date());
    const citasDia = citas
      .filter((c) => c.start.slice(0, 10) === k)
      .sort((a, b) => a.start.localeCompare(b.start));
    const bloqueosDia = bloqueos.filter((b) => b.start.slice(0, 10) === k);
    return { citas: citasDia, bloqueos: bloqueosDia, esHoy: k === hoy, fueraMes: d.getMonth() !== mes.getMonth() };
  };

  const tituloMes = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(mes);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendario</h1>
          <p className="text-sm text-violet-200/70">Gestiona tus citas del mes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <button
            onClick={() => {
              setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
              cargar();
            }}
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20"
          >
            Hoy
          </button>
          <button
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <Tarjeta className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold capitalize text-slate-800">{tituloMes}</h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Citas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Bloqueos
            </span>
          </div>
        </div>

        {cargando ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-7 bg-slate-100 text-center">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-slate-200">
              {grid.map((d) => {
                const { citas: delDia, bloqueos: bloqueosDia, esHoy, fueraMes } = eventosDelDia(d);
                const extra = delDia.length + bloqueosDia.length;
                return (
                  <div
                    key={d.toISOString()}
                    className={`flex min-h-[92px] flex-col gap-1 bg-white p-1.5 transition ${
                      fueraMes ? "bg-slate-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          esHoy
                            ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"
                            : fueraMes
                              ? "text-slate-400"
                              : "text-slate-700"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {extra > 0 && (
                        <span className="flex gap-1">
                          {delDia.length > 0 && (
                            <span className="h-2 w-2 rounded-full bg-violet-500" />
                          )}
                          {bloqueosDia.length > 0 && (
                            <span className="h-2 w-2 rounded-full bg-rose-400" />
                          )}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {bloqueosDia.slice(0, 1).map((b) => (
                        <div
                          key={b.id}
                          className="truncate rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600"
                          title={`Bloqueo ${fmtHora(b.start)}–${fmtHora(b.end)}${b.motivo ? " · " + b.motivo : ""}`}
                        >
                          🔒 {fmtHora(b.start)}
                        </div>
                      ))}
                      {delDia.slice(0, 2).map((c) => (
                        <div
                          key={c.id}
                          onClick={() => setSelId(selId === c.id ? null : c.id)}
                          className={`cursor-pointer truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium transition ${
                            c.estado === "cancelada"
                              ? "bg-slate-100 text-slate-400 line-through"
                              : "bg-violet-100 text-violet-800 hover:bg-violet-200"
                          }`}
                        >
                          {fmtHora(c.start)} · {c.servicio?.nombre}
                        </div>
                      ))}
                      {delDia.length > 3 && (
                        <div className="px-1.5 text-[10px] font-semibold text-slate-400">
                          +{delDia.length - 3} más
                        </div>
                      )}
                    </div>

                    {selId && delDia.some((c) => c.id === selId) && (
                      <div className="mt-1 rounded-md bg-slate-100 px-1.5 py-1 text-[10px] text-slate-600">
                        <p className="truncate">{delDia.find((c) => c.id === selId)?.cliente?.nombre}</p>
                        <button
                          onClick={() => cancelarCita(selId!)}
                          className="mt-0.5 font-semibold text-rose-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Tarjeta>

      <Tarjeta className="p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-500">
          Crear bloqueo
        </h2>
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
    </div>
  );
}