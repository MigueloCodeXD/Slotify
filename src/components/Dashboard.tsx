"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boton, Contador, Skeleton, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import { ChatIA } from "@/components/ChatIA";
import { useToast } from "@/components/Toast";
import { configPublica } from "@/lib/supabaseClient";
import { TZ, actualizarTZ } from "@/lib/zonaHoraria";
import type { Bloqueo } from "@/types";

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

function fmtMoneda(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return "$" + (Number.isFinite(n) ? n : 0).toFixed(2);
}

interface CitaDash {
  id: string;
  estado: string;
  start: string;
  end: string;
  precio_servicio?: number | null;
  anticipo?: number | null;
  estado_pago?: string | null;
  servicio: { id: string; nombre: string; precio: number; duracion_min: number };
  cliente: { nombre: string; email: string };
  motivo?: string | null;
}

interface FilaCita {
  id: string;
  start: string;
  end: string;
  cliente: string;
  email_cliente: string;
  servicio: string;
  estado: string;
  precio: number;
  anticipo: number;
  estado_pago: string;
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
  mes: {
    mes: string;
    cuenta: Record<string, number>;
    ingresos: number;
    pagos_recibidos: number;
    total: number;
    desglose_servicios: { servicio_id: string; servicio: string; cantidad: number; ingresos: number }[];
    desglose_profesionales: { profesional_id: string; profesional: string; cantidad: number; ingresos: number }[];
    filas: FilaCita[];
  };
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

const PAGO_CHIP: Record<string, string> = {
  pendiente: "border-zinc-300/20 bg-white/5 text-zinc-300",
  parcial: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  pagado: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
};

function descargar(contenido: string, nombre: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export function Dashboard() {
  const { notificar } = useToast();
  const [datos, setDatos] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [pagoCita, setPagoCita] = useState<CitaDash | null>(null);
  const [enviandoPago, setEnviandoPago] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const res = await llamarEdge<Dash>("dashboard-profesional", {}, token);
      const { data: cfg } = await configPublica();
      actualizarTZ((cfg as { zona_horaria?: string } | null)?.zona_horaria);
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

  async function cambiarEstado(c: CitaDash, estado: string) {
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("actualizar-cita-profesional", { id: c.id, estado }, token);
      notificar(`Cita marcada como ${ETIQUETAS[estado] ?? estado}.`, "exito");
      await cargar();
    } catch (e) {
      notificar((e as Error).message, "error");
      await cargar();
    }
  }

  async function registrarPago(c: CitaDash, monto: number, metodo: string, otro?: string) {
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

  function exportarCSV() {
    if (!datos) return;
    const cabecera = "Fecha,Hora,Cliente,Email,Servicio,Estado,Precio,Anticipo,Pago\n";
    const filas = datos.mes.filas
      .map((f) =>
        [
          new Intl.DateTimeFormat("es", { dateStyle: "short", timeZone: TZ }).format(new Date(f.start)),
          new Intl.DateTimeFormat("es", { timeStyle: "short", timeZone: TZ }).format(new Date(f.start)),
          `"${f.cliente}"`,
          f.email_cliente,
          `"${f.servicio}"`,
          f.estado,
          f.precio,
          f.anticipo,
          f.estado_pago,
        ].join(",")
      )
      .join("\n");
    descargar("\uFEFF" + cabecera + filas, `citas-${datos.mes.mes}.csv`, "text/csv;charset=utf-8");
  }

  function exportarICS() {
    if (!datos) return;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const cabecera = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Slotify//ES\nCALSCALE:GREGORIAN\n";
    const cuerpos = datos.mes.filas
      .map((f) => {
        const [startWat, endWat] = [f.start.replace(/[-:]/g, ""), f.end.replace(/[-:]/g, "")];
        return (
          "BEGIN:VEVENT\n" +
          `UID:${f.id}@slotify\n` +
          `DTSTAMP:${stamp}\n` +
          `DTSTART:${startWat}\n` +
          `DTEND:${endWat}\n` +
          `SUMMARY:${f.estado === "cancelada" ? "[Cancelada] " : ""}${f.servicio} - ${f.cliente}\n` +
          "END:VEVENT"
        );
      })
      .join("\n");
    descargar(cabecera + cuerpos + "\nEND:VCALENDAR\n", `calendario-${datos.mes.mes}.ics`, "text/calendar");
  }

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
          <p className="mt-1 text-xs text-zinc-400">
            En {miMes} · <span className="text-emerald-300/90">pagado {fmtMoneda(datos.mes.pagos_recibidos)}</span>
          </p>
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
                  className="rounded-xl px-1 py-1.5 animate-card-in"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">
                        <span className="font-mono text-violet-300">{fmtHora(c.start)}</span> ·{" "}
                        {c.cliente.nombre}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {c.servicio.nombre} ({c.servicio.duracion_min} min)
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          PAGO_CHIP[c.estado_pago ?? "pendiente"] ?? "bg-white/5 text-zinc-300"
                        }`}
                      >
                        {c.estado_pago ?? "pendiente"}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${COLORES[c.estado] ?? "bg-white/10 text-zinc-300"}`}
                      >
                        {ETIQUETAS[c.estado] ?? c.estado}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Boton
                      variante="primario"
                      className="px-2.5 py-1 text-[11px]"
                      disabled={c.estado_pago === "pagado"}
                      onClick={() => setPagoCita(c)}
                    >
                      {c.estado_pago === "pagado" ? "Pagado" : "Registrar pago"}
                    </Boton>
                    {(c.estado === "confirmada" || c.estado === "pendiente") && (
                      <>
                        <Boton
                          variante="claro"
                          className="px-2.5 py-1 text-[11px]"
                          disabled={cambiando === c.id}
                          onClick={() => {
                            setCambiando(c.id);
                            cambiarEstado(c, "completada").finally(() => setCambiando(null));
                          }}
                        >
                          Completar
                        </Boton>
                        <Boton
                          variante="peligro"
                          className="px-2.5 py-1 text-[11px]"
                          disabled={cambiando === c.id}
                          onClick={() => {
                            setCambiando(c.id);
                            cambiarEstado(c, "no_show").finally(() => setCambiando(null));
                          }}
                        >
                          No asistió
                        </Boton>
                      </>
                    )}
                  </div>
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
                    {c.servicio.nombre} ·{" "}
                    <span className="font-mono">
                      {Number(c.precio_servicio ?? c.servicio.precio).toFixed(2)}
                    </span>
                  </p>
                  {c.estado_pago !== "pagado" && (
                    <Boton
                      variante="primario"
                      className="mt-2 px-2.5 py-1 text-[11px]"
                      onClick={() => setPagoCita(c)}
                    >
                      Registrar pago
                    </Boton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <Tarjeta className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Mensajes</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Conversaciones con tus clientes sobre sus citas.
            </p>
          </div>
          <Link
            href="/panel/mensajes"
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400/100"
          >
            Ver y responder mensajes
          </Link>
        </div>
      </Tarjeta>

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
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-300">Por servicio</h2>
          {datos.mes.desglose_servicios.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin actividad en el mes.</p>
          ) : (
            <ul className="space-y-1.5">
              {datos.mes.desglose_servicios.map((d) => (
                <li key={d.servicio_id || d.servicio} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">
                    {d.servicio} <span className="text-zinc-500">({d.cantidad})</span>
                  </span>
                  <span className="font-mono text-zinc-100">{fmtMoneda(d.ingresos)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-300">Exportar del mes</h2>
          <p className="mb-3 text-xs text-zinc-400">
            {datos.mes.total} citas en {miMes}.
          </p>
          <div className="grid gap-2">
            <Boton variante="primario" className="w-full" onClick={exportarCSV}>
              Descargar CSV
            </Boton>
            <Boton variante="claro" className="w-full" onClick={exportarICS}>
              Descargar calendario (.ics)
            </Boton>
          </div>
        </Tarjeta>
      </div>

      {datos.mes.desglose_profesionales.length > 1 && (
        <Tarjeta className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-300">Por profesional</h2>
          <ul className="space-y-1.5">
            {datos.mes.desglose_profesionales.map((d) => (
              <li key={d.profesional_id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">
                  {d.profesional} <span className="text-zinc-500">({d.cantidad})</span>
                </span>
                <span className="font-mono text-zinc-100">{fmtMoneda(d.ingresos)}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {pagoCita && (
        <ModalPago
          cita={pagoCita}
          enviando={enviandoPago}
          onCancel={() => setPagoCita(null)}
          onConfirm={(monto, metodo, otro) => registrarPago(pagoCita, monto, metodo, otro)}
        />
      )}
    </div>
  );
}

function ModalPago({
  cita,
  enviando,
  onCancel,
  onConfirm,
}: {
  cita: CitaDash;
  enviando: boolean;
  onCancel: () => void;
  onConfirm: (monto: number, metodo: string, otro?: string) => void;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [otro, setOtro] = useState("");
  const [error, setError] = useState<string | null>(null);

  const precio = Number(cita.precio_servicio ?? cita.servicio?.precio ?? 0);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="glass-strong w-full max-w-md rounded-3xl p-5 text-zinc-100 shadow-2xl animate-scale-in">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-white">Registrar pago</h3>
          <button
            onClick={onCancel}
            className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-violet-200/70">
          {cita.cliente.nombre} · {cita.servicio.nombre}
        </p>
        <div className="mt-2 rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-zinc-300">
          Precio <span className="font-mono text-violet-200">{fmtMoneda(precio)}</span>
          <span className="mx-2 text-zinc-500">·</span>
          Pagado <span className="font-mono text-emerald-200">{fmtMoneda(anticipo)}</span>
          <span className="mx-2 text-zinc-500">·</span>
          Resta <span className="font-mono text-amber-200">{fmtMoneda(pendiente)}</span>
        </div>

        <label className="mt-4 block text-xs font-semibold text-zinc-400">Monto</label>
        <input
          type="number"
          autoFocus
          value={monto}
          min={0.01}
          max={pendiente}
          step="0.01"
          onChange={(e) => setMonto(e.target.value)}
          placeholder={`Monto (máx. ${fmtMoneda(Math.max(0, precio - anticipo))})`}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
        />

        <label className="mt-3 block text-xs font-semibold text-zinc-400">Método</label>
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
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
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
          />
        )}

        {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Boton variante="primario" className="flex-1" disabled={enviando} onClick={enviar}>
            {enviando ? "Registrando…" : "Registrar pago"}
          </Boton>
          <Boton variante="claro" onClick={onCancel} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </div>
    </div>
  );
}
