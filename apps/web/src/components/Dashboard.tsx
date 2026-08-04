"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boton, Contador, Skeleton, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import { ChatIA } from "@/components/ChatIA";
import type { Bloqueo } from "@/types";

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota";

function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function fmtFecha(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone: TZ,
  }).format(new Date(iso));
}

interface CitaDash {
  id: string;
  estado: string;
  start: string;
  end: string;
  servicio: { id: string; nombre: string; precio: number; duracion_min: number };
  cliente: { nombre: string; email: string };
  motivo?: string | null;
}

interface Dash {
  hoy: {
    fecha: string;
    citas: CitaDash[];
    total_confirmadas: number;
    canceladas: number;
  };
  proximas: CitaDash[];
  bloqueos_hoy: Bloqueo[];
  mes: { mes: string; cuenta: Record<string, number>; ingresos: number; total: number };
}

const ETIQUETAS: Record<string, string> = {
  confirmada: "Confirmadas",
  completada: "Completadas",
  cancelada: "Canceladas",
  no_show: "No asistió",
};

const COLORES: Record<string, string> = {
  confirmada: "bg-teal-400/10 text-teal-300 border-teal-300/25",
  completada: "bg-sky-400/10 text-sky-300 border-sky-300/25",
  cancelada: "bg-rose-400/10 text-rose-300/80 border-rose-400/25",
  no_show: "bg-amber-400/10 text-amber-300/85 border-amber-300/25",
};

const DOT: Record<string, string> = {
  confirmada: "bg-teal-400",
  completada: "bg-sky-400",
  cancelada: "bg-rose-400/80",
  no_show: "bg-amber-400",
};

export function Dashboard() {
  const [datos, setDatos] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const res = await llamarEdge<Dash>("dashboard-profesional", {}, token);
      setDatos(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const router = useRouter();

  if (cargando) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <div className="skeleton h-8 w-48" />
          <div className="skeleton mt-2 h-4 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur">
        {error}
      </div>
    );
  }

  if (!datos) return null;

  const miMes = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(
    new Date(`${datos.mes.mes}-01T12:00:00Z`)
  );

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-semibold text-white">Resumen</h1>
        <p className="mt-1 text-sm text-violet-200/60">Tu panorama del día y del mes</p>
      </div>

      <ChatIA soloInfo storageKey="resumen" clase="animate-fade-up" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Tarjeta className="p-5 animate-fade-up">
          <p className="text-sm font-semibold text-violet-300">Ingresos del mes</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            <Contador valor={datos.mes.ingresos} moneda />
          </p>
          <p className="mt-1 text-xs text-zinc-400">En {miMes}</p>
        </Tarjeta>
        <Tarjeta className="p-5 animate-fade-up [animation-delay:80ms]">
          <p className="text-sm font-semibold text-violet-300">Citas hoy</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            <Contador valor={datos.hoy.total_confirmadas} />
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            confirmadas · <span className="text-rose-300/80">{datos.hoy.canceladas}</span> canceladas
          </p>
        </Tarjeta>
        <Tarjeta className="p-5 animate-fade-up [animation-delay:160ms]">
          <p className="text-sm font-semibold text-violet-300">Próximas (7 días)</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            <Contador valor={datos.proximas.length} />
          </p>
          <p className="mt-1 text-xs text-zinc-400">citas confirmadas</p>
        </Tarjeta>
      </div>

      {datos.bloqueos_hoy.length > 0 && (
        <Tarjeta className="p-5 animate-fade-up">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-rose-300/80">
            Bloqueos de hoy
          </h2>
          <ul className="space-y-2">
            {datos.bloqueos_hoy.map((b, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                <span className="font-mono text-zinc-400">
                  {fmtHora(b.start)}–{fmtHora(b.end)}
                </span>{" "}
                {b.motivo ? `· ${b.motivo}` : ""}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Citas de hoy</h2>
            <span className="font-mono text-xs text-zinc-500">
              {new Intl.DateTimeFormat("es", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: TZ,
              }).format(new Date())}
            </span>
          </div>
          {datos.hoy.citas.length === 0 ? (
            <p className="text-sm text-zinc-400">No tienes citas confirmadas hoy.</p>
          ) : (
            <ul className="space-y-2">
              {datos.hoy.citas.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-1 py-1.5 animate-card-in"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      <span className="font-mono text-violet-300">{fmtHora(c.start)}</span> ·{" "}
                      {c.cliente.nombre}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {c.servicio.nombre} ({c.servicio.duracion_min} min)
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${COLORES[c.estado] ?? "bg-white/10 text-zinc-300"}`}
                  >
                    {ETIQUETAS[c.estado] ?? c.estado}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Próximas citas</h2>
            <Link href="/panel" className="text-xs font-semibold text-violet-300 hover:text-violet-200 hover:underline">
              Ver calendario
            </Link>
          </div>
          {datos.proximas.length === 0 ? (
            <p className="text-sm text-zinc-400">No hay citas confirmadas en los próximos 7 días.</p>
          ) : (
            <ul className="space-y-2">
              {datos.proximas.slice(0, 6).map((c) => (
                <li key={c.id} className="glass rounded-xl px-3 py-2 animate-card-in">
                  <p className="text-sm font-semibold text-zinc-100">
                    <span className="font-mono text-violet-300">{fmtFecha(c.start)}</span> ·{" "}
                    {fmtHora(c.start)} · {c.cliente.nombre}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {c.servicio.nombre} · <span className="font-mono">{Number(c.servicio.precio).toFixed(2)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-300">Estadísticas del mes</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(ETIQUETAS).map(([k, v]) => (
              <div key={k} className="glass rounded-xl px-4 py-3">
                <p className="text-xs text-zinc-400">{v}</p>
                <p className="mt-1 text-xl font-semibold text-white">
                  <Contador valor={datos.mes.cuenta[k] ?? 0} />
                </p>
                <span className={`mt-2 block h-1 w-6 rounded-full ${DOT[k]}`} />
              </div>
            ))}
          </div>
        </Tarjeta>

        <Tarjeta className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-300">Acciones rápidas</h2>
          <div className="grid gap-2">
            <Boton variante="primario" className="w-full" onClick={() => router.push("/panel")}>
              Ver calendario
            </Boton>
            <Boton variante="claro" className="w-full" onClick={() => router.push("/panel/configuracion")}>
              Configurar disponibilidad
            </Boton>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}