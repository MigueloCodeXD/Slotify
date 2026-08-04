"use client";

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";

type Tono = "exito" | "error" | "info";

interface ToastItem {
  id: number;
  tono: Tono;
  mensaje: string;
}

interface ToastCtx {
  notificar: (mensaje: string, tono?: Tono) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const notificar = useCallback((mensaje: string, tono: Tono = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, tono, mensaje }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  return (
    <Ctx.Provider value={{ notificar }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur ${
              t.tono === "exito"
                ? "border-emerald-300/40 bg-emerald-600/95 text-white"
                : t.tono === "error"
                  ? "border-rose-300/40 bg-rose-600/95 text-white"
                  : "border-violet-300/40 bg-violet-700/95 text-white"
            }`}
          >
            {t.mensaje}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}