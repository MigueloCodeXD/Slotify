"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";

interface Msg {
  role: "user" | "bot";
  text: string;
}

export function ChatIA({
  clienteId,
  titulo,
  clase,
  onAccion,
  soloInfo = false,
  storageKey,
}: {
  clienteId?: string;
  titulo?: string;
  clase?: string;
  onAccion?: () => void;
  soloInfo?: boolean;
  storageKey?: string;
}) {
  const clave = storageKey ?? (clienteId ? `slotify-chat:cliente:${clienteId}` : "slotify-chat:general");

  const [mensajes, setMensajes] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(clave) ?? "[]") as Msg[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [mensajes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(clave, JSON.stringify(mensajes));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [clave, mensajes]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || cargando) return;
    setMensajes((m) => [...m, { role: "user", text: texto }]);
    setInput("");
    setCargando(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const res = await llamarEdge<{ respuesta: string; fallback: boolean }>(
        "copiloto-profesional",
        {
          mensaje: texto,
          ...(clienteId ? { cliente_id: clienteId } : {}),
          modo: soloInfo ? "info" : "gestion",
          historial: mensajes.slice(-20).map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text })),
        },
        token
      );
      if (res.fallback) {
        setMensajes((m) => [
          ...m,
          {
            role: "bot",
            text: "El copiloto está temporalmente saturado o la IA no está configurada. Usa los controles de la pantalla.",
          },
        ]);
      } else {
        setMensajes((m) => [...m, { role: "bot", text: res.respuesta }]);
      }
      if (!soloInfo) onAccion?.();
    } catch (e) {
      setMensajes((m) => [...m, { role: "bot", text: (e as Error).message }]);
    } finally {
      setCargando(false);
    }
  }

  const pista = soloInfo
    ? "Pregúntame sobre tu negocio o tus citas: solo te daré información, no haré cambios."
    : clienteId
      ? "Pídele un resumen sobre este cliente, su historial o recomendaciones."
      : "Pídeme gestionar tu negocio con lenguaje natural.";

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/60 ${clase ?? ""}`}
    >
      <div className="flex items-center justify-between bg-[var(--primary-600)] px-3 py-2 text-white">
        <p className="text-sm font-bold">{titulo ?? "Copiloto Slotify"}</p>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">✦ IA</span>
      </div>

      <div ref={listaRef} className="flex max-h-64 min-h-28 flex-1 flex-col gap-2 overflow-y-auto bg-zinc-50 p-3">
        {mensajes.length === 0 && (
          <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs text-zinc-600 shadow-sm">
            {pista}
          </div>
        )}
        {mensajes.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--primary-600)] px-3 py-2 text-sm text-white shadow-sm"
            >
              {m.text}
            </div>
          ) : (
            <div key={i} className="flex items-end gap-1.5 self-start">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-100)] text-[10px]">
                ✦
              </span>
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm">
                {m.text}
              </div>
            </div>
          )
        )}
        {cargando && (
          <div className="flex items-center gap-1.5 self-start px-1 py-2">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary-400)] [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary-400)] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary-400)] [animation-delay:300ms]" />
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="flex gap-2 border-t border-zinc-200 bg-white p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
        />
        <Boton variante="primario" onClick={enviar} disabled={cargando || !input.trim()}>
          ↑
        </Boton>
      </div>
    </div>
  );
}