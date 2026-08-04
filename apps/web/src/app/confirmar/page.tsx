"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Boton, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";

function Confirmar() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!token) {
      setEstado("error");
      setMensaje("Falta el enlace de confirmación.");
      return;
    }
    (async () => {
      try {
        const res = await llamarEdge<{ ok: boolean; ya_confirmada?: boolean }>("confirmar-cita", {
          token_gestion: token,
        });
        setEstado("ok");
        setMensaje(res.ya_confirmada ? "Esta cita ya estaba confirmada." : "¡Tu cita fue confirmada!");
      } catch (e) {
        setEstado("error");
        setMensaje((e as Error).message);
      }
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="relative flex flex-1 items-center justify-center px-4 py-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        </div>
        <Tarjeta className="relative w-full max-w-md p-8 text-center animate-scale-in">
          {estado === "cargando" ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="mb-3 text-5xl">{estado === "ok" ? "🎉" : "⏳"}</div>
              <h1 className="mb-2 text-xl font-bold text-zinc-100">
                {estado === "ok" ? "¡Cita confirmada!" : "No se pudo confirmar"}
              </h1>
              <p className="text-sm text-zinc-300">{mensaje}</p>
              <div className="mt-6">
                <Boton variante="primario" onClick={() => (window.location.href = "/")}>
                  Volver al inicio
                </Boton>
              </div>
            </>
          )}
        </Tarjeta>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Confirmar />
    </Suspense>
  );
}