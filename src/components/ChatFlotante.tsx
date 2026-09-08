"use client";

import { useState } from "react";
import { ChatIA } from "@/components/ChatIA";

export function ChatFlotante({
  titulo,
  storageKey,
  onAccion,
  soloInfo = false,
}: {
  titulo?: string;
  storageKey?: string;
  onAccion?: () => void;
  soloInfo?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {abierto && (
        <div className="fixed bottom-24 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] animate-scale-in">
          <ChatIA titulo={titulo} storageKey={storageKey} onAccion={onAccion} soloInfo={soloInfo} />
        </div>
      )}
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-label={abierto ? "Cerrar copiloto" : "Abrir copiloto"}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-600)] text-white shadow-xl shadow-[var(--primary-900)]/30 transition hover:bg-[var(--primary-700)] hover:scale-105 active:scale-95"
      >
        {abierto ? "✕" : "✦"}
      </button>
    </>
  );
}