"use client";

import { useEffect, useState } from "react";
import { Boton, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";

type EstadoEmail = "chequeando" | "ok" | "pendiente" | "error";

export function EmailGate({ children }: { children: React.ReactNode }) {
  const [estadoEmail, setEstadoEmail] = useState<EstadoEmail>("chequeando");
  const [pendienteMsg, setPendienteMsg] = useState("");

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await llamarEdge<{ ok: boolean; pendiente?: boolean; mensaje?: string }>(
          "confirmar-email-profesional",
          {}
        );
        if (!activo) return;
        if (res.ok) setEstadoEmail("ok");
        else if (res.pendiente) {
          setEstadoEmail("pendiente");
          setPendienteMsg(res.mensaje ?? "Confirma tu nuevo email.");
        } else setEstadoEmail("error");
      } catch (e) {
        if (!activo) return;
        if ((e as Error).message === "No autorizado.") setEstadoEmail("ok");
        else setEstadoEmail("error");
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  if (estadoEmail === "chequeando") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (estadoEmail === "pendiente") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Tarjeta className="w-full max-w-sm p-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Confirmá tu nuevo email</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Tu dirección de correo se actualizó. Para seguir operando, confirmalo desde el
            enlace que te enviamos a tu nuevo email.
          </p>
          <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {pendienteMsg}
          </p>
          <Boton
            variante="primario"
            className="mt-6 w-full"
            onClick={() => {
              setEstadoEmail("chequeando");
              window.location.reload();
            }}
          >
            Ya lo confirmé
          </Boton>
        </Tarjeta>
      </div>
    );
  }

  return <>{children}</>;
}
