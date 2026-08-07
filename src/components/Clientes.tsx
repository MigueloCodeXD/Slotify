"use client";

import { useEffect, useState } from "react";
import { Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import { useToast } from "@/components/Toast";
import { TZ } from "@/lib/zonaHoraria";


interface UltimaCita {
  rango_tiempo: string;
  estado: string;
  servicio: string | null;
  profesional: string | null;
}

interface ClienteLibreta {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  total: number;
  conteo: Record<string, number>;
  gasto: number;
  ultima_cita: UltimaCita | null;
  ultimas: UltimaCita[];
}

const ESTADOS: Record<string, string> = {
  confirmada: "bg-teal-400/10 text-teal-300 border-teal-300/25",
  completada: "bg-sky-400/10 text-sky-300 border-sky-300/25",
  cancelada: "bg-rose-400/10 text-rose-300/80 border-rose-400/25",
  no_show: "bg-amber-400/10 text-amber-300/85 border-amber-300/25",
  pendiente: "bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-300/25",
};

const ETIQUETAS: Record<string, string> = {
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_show: "No asistió",
  pendiente: "Pendiente",
};

function parseInicio(rango: string): Date {
  const clean = String(rango).replace(/[\[\]\(\)"]/g, "").split(",")[0] ?? "";
  const norm = clean.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
  const t = Date.parse(norm);
  return Number.isNaN(t) ? new Date(0) : new Date(t);
}

function fmtFecha(iso: Date): string {
  if (iso.getTime() === 0) return "";
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: TZ }).format(iso);
}

function fmtHora(iso: Date): string {
  if (iso.getTime() === 0) return "";
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(iso);
}

export function Clientes() {
  const { notificar } = useToast();
  const [clientes, setClientes] = useState<ClienteLibreta[]>([]);
  const [total, setTotal] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

  async function cargar(q = "") {
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const res = await llamarEdge<{ clientes: ClienteLibreta[]; total: number }>(
        "libreta-clientes",
        { busqueda: q || undefined },
        token
      );
      setClientes(res.clientes ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  const formatter = new Intl.NumberFormat("es", { style: "currency", currency: "USD" });

  async function eliminarCliente(c: ClienteLibreta) {
    const citas = c.total === 1 ? "1 cita" : `${c.total} citas`;
    if (!window.confirm(`¿Eliminar a "${c.nombre}"? Se borrarán sus ${citas} e historial de forma definitiva.`)) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("libreta-clientes", { accion: "eliminar", id: c.id }, token);
      notificar("Cliente eliminado.", "exito");
      if (abierto === c.id) setAbierto(null);
      await cargar(busqueda);
    } catch (err) {
      notificar((err as Error).message, "error");
    }
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white animate-fade-up">Clientes</h1>
          <p className="mt-1 text-sm text-violet-200/60">{total} clientes en el negocio</p>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o email…"
          className="w-full max-w-xs rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none backdrop-blur transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/25"
        />
      </div>

      <Tarjeta className="overflow-hidden animate-fade-up">
        {clientes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-400">
            {busqueda ? "No hay clientes que coincidan." : "Aún no hay clientes."}
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {clientes.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{c.nombre}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {[c.email, c.telefono].filter(Boolean).join(" · ") || "Sin contacto"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 font-semibold text-zinc-200">
                      {c.total} citas
                    </span>
                    <span className="font-mono font-semibold text-violet-300">{formatter.format(c.gasto)}</span>
                    {c.ultima_cita && (
                      <span className="hidden font-mono text-zinc-500 sm:inline">
                        {fmtFecha(parseInicio(c.ultima_cita.rango_tiempo))} {fmtHora(parseInicio(c.ultima_cita.rango_tiempo))}
                      </span>
                    )}
                    <span className="text-zinc-500">{abierto === c.id ? "▾" : "▸"}</span>
                  </div>
                </button>

                {abierto === c.id && (
                  <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-4">
                    {c.ultimas.length === 0 ? (
                      <p className="text-sm text-zinc-400">Sin citas registradas.</p>
                    ) : (
                      <ul className="space-y-2">
                        {c.ultimas.map((u, i) => {
                          const d = parseInicio(u.rango_tiempo);
                          return (
                            <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="font-mono text-zinc-300">
                                {fmtFecha(d)} · {fmtHora(d)}
                              </span>
                              <span className="text-zinc-400">
                                {u.servicio ?? "—"} {u.profesional ? `· ${u.profesional}` : ""}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  ESTADOS[u.estado] ?? "bg-white/10 text-zinc-300"
                                }`}
                              >
                                {ETIQUETAS[u.estado] ?? u.estado}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button
                      onClick={() => eliminarCliente(c)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                    >
                      Eliminar cliente
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}