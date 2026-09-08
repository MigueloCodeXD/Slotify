"use client";

import { useEffect, useState } from "react";
import { ModalConfirmar, Spinner, Tarjeta } from "@/components/ui";
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
  confirmada: "bg-teal-50 text-teal-700 border-teal-200",
  completada: "bg-sky-50 text-sky-700 border-sky-200",
  cancelada: "bg-rose-50 text-rose-600 border-rose-200",
  no_show: "bg-amber-50 text-amber-700 border-amber-200",
  pendiente: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
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
  const [eliminando, setEliminando] = useState<ClienteLibreta | null>(null);
  const [eliminandoEnProgreso, setEliminandoEnProgreso] = useState(false);

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

  function eliminarCliente(c: ClienteLibreta) {
    setEliminando(c);
  }

  async function confirmarEliminarCliente() {
    const c = eliminando;
    if (!c) return;
    if (eliminandoEnProgreso) return;
    setEliminandoEnProgreso(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("libreta-clientes", { accion: "eliminar", id: c.id }, token);
      notificar("Cliente eliminado.", "exito");
      setEliminando(null);
      if (abierto === c.id) setAbierto(null);
      await cargar(busqueda);
    } catch (err) {
      notificar((err as Error).message, "error");
    } finally {
      setEliminandoEnProgreso(false);
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
          <h1 className="text-2xl font-bold text-zinc-900 animate-fade-up">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">{total} clientes en el negocio</p>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o email…"
          className="w-full max-w-xs rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
        />
      </div>

      <Tarjeta className="overflow-hidden animate-fade-up">
        {clientes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">
            {busqueda ? "No hay clientes que coincidan." : "Aún no hay clientes."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {clientes.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-[var(--primary-50)]/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900">{c.nombre}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {[c.email, c.telefono].filter(Boolean).join(" · ") || "Sin contacto"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">
                      {c.total} citas
                    </span>
                    <span className="font-mono font-semibold text-[var(--primary-700)]">{formatter.format(c.gasto)}</span>
                    {c.ultima_cita && (
                      <span className="hidden font-mono text-zinc-500 sm:inline">
                        {fmtFecha(parseInicio(c.ultima_cita.rango_tiempo))} {fmtHora(parseInicio(c.ultima_cita.rango_tiempo))}
                      </span>
                    )}
                    <span className="text-zinc-400">{abierto === c.id ? "▾" : "▸"}</span>
                  </div>
                </button>

                {abierto === c.id && (
                  <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 py-4">
                    {c.ultimas.length === 0 ? (
                      <p className="text-sm text-zinc-500">Sin citas registradas.</p>
                    ) : (
                      <ul className="space-y-2">
                        {c.ultimas.map((u, i) => {
                          const d = parseInicio(u.rango_tiempo);
                          return (
                            <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="font-mono text-zinc-700">
                                {fmtFecha(d)} · {fmtHora(d)}
                              </span>
                              <span className="text-zinc-500">
                                {u.servicio ?? "—"} {u.profesional ? `· ${u.profesional}` : ""}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  ESTADOS[u.estado] ?? "bg-zinc-100 text-zinc-600"
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
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
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

      {eliminando && (
        <ModalConfirmar
          titulo="Eliminar cliente"
          mensaje={`¿Seguro que quieres eliminar a "${eliminando.nombre}"? Se borrarán sus ${eliminando.total === 1 ? "1 cita" : `${eliminando.total} citas`} e historial de forma definitiva.`}
          etiqueta="Eliminar cliente"
          guardando={eliminandoEnProgreso}
          onCerrar={() => {
            if (!eliminandoEnProgreso) setEliminando(null);
          }}
          onConfirmar={confirmarEliminarCliente}
        />
      )}
    </div>
  );
}