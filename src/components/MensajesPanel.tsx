"use client";

import { useEffect, useState } from "react";
import { Boton, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import { useToast } from "@/components/Toast";
import { TZ } from "@/lib/zonaHoraria";

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

interface ConvMensaje {
  id: string;
  mensaje: string;
  emisor: "cliente" | "profesional";
  created_at: string;
}

interface Conversacion {
  cita_id: string;
  cita: {
    id: string;
    estado: string;
    rango_tiempo: string;
    servicio: { nombre: string } | null;
    cliente: { nombre: string } | null;
  } | null;
  mensajes: ConvMensaje[];
}

function fechaCita(rango: string): string {
  const clean = rango.replace(/[\[\]\(\)"]/g, "").trim();
  const inicio = clean.split(",")[0]?.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
  if (!inicio) return "—";
  const d = new Date(inicio);
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d);
}

export function MensajesPanel() {
  const { notificar } = useToast();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [activaId, setActivaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const res = await llamarEdge<{ conversaciones: Conversacion[] }>("consultar-mensajes", {}, token);
      setConversaciones(res.conversaciones ?? []);
      setActivaId((prev) => {
        if (prev) return prev;
        return res.conversaciones.length > 0 ? res.conversaciones[0].cita_id : null;
      });
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }

  async function responder() {
    if (!activaId || texto.trim().length < 1 || enviando) return;
    setEnviando(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("enviar-aviso", { cita_id: activaId, mensaje: texto, es_publico_cliente: true }, token);
      setTexto("");
      notificar("Respuesta enviada al cliente.", "exito");
      await cargar();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activa = conversaciones.find((c) => c.cita_id === activaId) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Mensajes</h1>
        <Boton variante="claro" onClick={cargar} disabled={cargando}>
          {cargando ? "Cargando…" : "Actualizar"}
        </Boton>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-300">Conversaciones</h2>
          {cargando && conversaciones.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">Cargando…</p>
          ) : conversaciones.length === 0 ? (
            <p className="py-6 text-sm text-zinc-400">
              Aún no hay mensajes de clientes. Cuando un cliente escriba, aparecerá aquí.
            </p>
          ) : (
            <ul className="space-y-2">
              {conversaciones.map((c) => {
                const nuevas = c.mensajes.filter((m) => m.emisor === "cliente").length;
                const ultimo = c.mensajes[c.mensajes.length - 1];
                return (
                  <li key={c.cita_id}>
                    <button
                      onClick={() => setActivaId(c.cita_id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        activaId === c.cita_id
                          ? "border-violet-400/50 bg-violet-400/10"
                          : "border-white/10 bg-white/[0.04] hover:border-violet-400/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-100">
                          {c.cita?.cliente?.nombre ?? "Cliente"}
                        </span>
                        {nuevas > 0 && (
                          <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            {nuevas}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-zinc-400">
                        {c.cita?.servicio?.nombre ?? "Servicio"} ·{" "}
                        {c.cita ? fechaCita(c.cita.rango_tiempo) : ""}
                      </p>
                      {ultimo && (
                        <p className="truncate text-xs text-zinc-500">
                          {ultimo.emisor === "cliente" ? "Cliente: " : "Tú: "}
                          {ultimo.mensaje}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-300">Hilo</h2>
          {!activa ? (
            <p className="py-6 text-sm text-zinc-400">Selecciona una conversación.</p>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-100">
                  {activa.cita?.cliente?.nombre ?? "Cliente"}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    COLORES[activa.cita?.estado ?? ""] ?? "bg-white/10 text-zinc-300"
                  }`}
                >
                  {ETIQUETAS[activa.cita?.estado ?? ""] ?? activa.cita?.estado}
                </span>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {activa.mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.emisor === "cliente" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        m.emisor === "cliente"
                          ? "rounded-bl-sm bg-white/10 text-zinc-100"
                          : "rounded-br-sm bg-violet-600/90 text-white"
                      }`}
                    >
                      {m.mensaje}
                      <div className="mt-1 text-right text-[10px] opacity-60">
                        {new Intl.DateTimeFormat("es", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: TZ,
                        }).format(new Date(m.created_at))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={2}
                  placeholder="Escribe tu respuesta al cliente…"
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] p-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-400 outline-none"
                />
                <Boton variante="primario" onClick={responder} disabled={enviando || texto.trim().length < 1}>
                  {enviando ? "Enviando…" : "Responder"}
                </Boton>
              </div>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}