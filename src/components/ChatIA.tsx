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
      className={`flex flex-col rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl ${clase ?? ""}`}
    >
      <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-2 text-white">
        <p className="text-sm font-bold">{titulo ?? "Copiloto Slotify"}</p>
        <span className="text-xs text-white/80">✦ IA</span>
      </div>

      <div ref={listaRef} className="flex max-h-64 min-h-28 flex-1 flex-col gap-2 overflow-y-auto bg-black/20 p-3">
        {mensajes.length === 0 && (
          <div className="rounded-xl bg-violet-400/10 p-2.5 text-xs text-violet-200">{pista}</div>
        )}
        {mensajes.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-2.5 py-1.5 text-sm ${
              m.role === "user" ? "ml-auto bg-violet-600 text-white" : "bg-white/10 text-zinc-100"
            }`}
          >
            {m.text}
          </div>
        ))}
        {cargando && (
          <div className="w-fit rounded-xl bg-white/10 px-2.5 py-1.5 text-sm text-zinc-400 shadow-sm">
            Pensando…
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="flex gap-2 border-t border-white/10 bg-white/[0.04] p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
        />
        <Boton variante="primario" onClick={enviar} disabled={cargando || !input.trim()}>
          ↑
        </Boton>
      </div>
    </div>
  );
}
