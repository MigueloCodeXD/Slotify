"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";

interface Msg {
  role: "user" | "bot";
  text: string;
}

export function Copiloto({ onRecargar }: { onRecargar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem("slotify-chat:calendario") ?? "[]") as Msg[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("slotify-chat:calendario", JSON.stringify(mensajes));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [mensajes]);

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [mensajes]);

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
        { mensaje: texto },
        token
      );
      if (res.fallback) {
        setMensajes((m) => [
          ...m,
          {
            role: "bot",
            text: "El copiloto está temporalmente saturado. Usa los controles del calendario para esta acción.",
          },
        ]);
      } else {
        setMensajes((m) => [...m, { role: "bot", text: res.respuesta }]);
        onRecargar();
      }
    } catch (e) {
      setMensajes((m) => [...m, { role: "bot", text: (e as Error).message }]);
    } finally {
      setCargando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl text-white shadow-2xl shadow-violet-900/40 transition-all duration-200 hover:scale-110 hover:rotate-6 hover:shadow-fuchsia-500/40 active:scale-95"
        aria-label="Abrir copiloto"
      >
        ✦
      </button>
    );
  }

  return (
    <div className="fixed right-5 bottom-5 z-50 flex h-[540px] w-[min(400px,92vw)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b0817]/90 shadow-2xl backdrop-blur-xl animate-scale-in">
      <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-white">
        <div>
          <p className="font-bold">Copiloto Slotify</p>
          <p className="text-xs text-white/80">
            «bloquea de 2 a 4pm», «¿qué tengo hoy?»
          </p>
        </div>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-lg px-2 py-1 transition hover:bg-white/20"
        >
          ✕
        </button>
      </div>

      <div ref={listaRef} className="flex-1 space-y-2 overflow-y-auto bg-black/40 p-4">
        {mensajes.length === 0 && (
          <div className="rounded-xl bg-violet-400/10 p-3 text-sm text-violet-200">
            ¡Hola! Soy tu copiloto. Pídeme gestionar tu agenda con lenguaje
            natural: ver citas, crear bloqueos, cancelar o avisar a un cliente.
          </div>
        )}
        {mensajes.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-violet-600 text-white"
                : "bg-white/10 text-zinc-100"
            }`}
          >
            {m.text}
          </div>
        ))}
        {cargando && (
          <div className="w-fit rounded-xl bg-white/10 px-3 py-2 text-sm text-zinc-400 shadow-sm">
            Pensando…
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="flex gap-2 border-t border-white/10 bg-white/[0.04] p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Escribe un comando…"
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
        />
        <Boton variante="primario" onClick={enviar} disabled={cargando || !input.trim()}>
          <span className="group-hover:translate-x-0.5 transition-transform">→</span> Enviar
        </Boton>
      </div>
    </div>
  );
}