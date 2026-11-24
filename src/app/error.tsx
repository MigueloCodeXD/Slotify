"use client";

import { useEffect } from "react";
import { Boton, Tarjeta } from "@/components/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Tarjeta className="w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Algo salió mal</h1>
        <p className="mt-2 text-sm text-zinc-500">Ocurrió un error inesperado. Puedes intentar de nuevo.</p>
        <Boton variante="primario" className="mt-6" onClick={reset}>
          Reintentar
        </Boton>
      </Tarjeta>
    </main>
  );
}
