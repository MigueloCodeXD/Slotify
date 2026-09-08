"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui";
import { llamarEdge } from "@/lib/api";

interface Msg {
  role: "user" | "bot";
  text: string;
}

export function AsistenteIA() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || cargando) return;
    setMensajes((m) => [...m, { role: "user", text: texto }]);
    setInput("");
    setCargando(true);
    try {
      const res = await llamarEdge<{ respuesta: string; fallback: boolean }>("asistente-cliente", {
        mensaje: texto,
        historial: mensajes.slice(-20).map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text })),
      });
      if (res.fallback) {
        setMensajes((m) => [
          ...m,
          {
            role: "bot",
            text: "El asistente está temporalmente saturado. Puedes usar el formulario de reserva para agendar sin esperas.",
          },
        ]);
      } else {
        setMensajes((m) => [...m, { role: "bot", text: res.respuesta }]);
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
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-600)] text-2xl text-white shadow-2xl transition hover:scale-105 hover:bg-[var(--primary-700)]"
        aria-label="Abrir asistente"
      >
        ✦
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[520px] w-[min(400px,92vw)] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[var(--primary-600)] px-4 py-3 text-white">
        <div>
          <p className="font-bold">Asistente Slotify</p>
          <p className="text-xs text-white/80">Agenda y gestiona citas</p>
        </div>
        <button onClick={() => setAbierto(false)} className="rounded-lg px-2 py-1 hover:bg-white/20">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-zinc-50 p-4">
        {mensajes.length === 0 && (
          <div className="rounded-xl bg-[var(--primary-50)] p-3 text-sm text-[var(--primary-700)]">
            ¡Hola! Puedo ayudarte a elegir tu servicio, ver disponibilidad y
            agendar tu cita. También puedes usar el formulario en botones.
          </div>
        )}
        {mensajes.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-[var(--primary-600)] text-white"
                : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {m.text}
          </div>
        ))}
        {cargando && (
          <div className="w-fit rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-500 shadow-sm">
            Escribiendo…
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="flex gap-2 border-t border-zinc-200 bg-white p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Escribe tu mensaje…"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
        />
        <Boton variante="primario" onClick={enviar} disabled={cargando || !input.trim()}>
          ↑
        </Boton>
      </div>
    </div>
  );
}