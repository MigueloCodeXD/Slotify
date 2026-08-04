"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";

export function ActivarCuenta() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function activar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== password2) return setError("Las contraseñas no coinciden.");

    setCargando(true);
    try {
      const res = await llamarEdge<{ ok: boolean; mensaje: string }>("activar-cuenta", {
        token,
        password,
        telefono: telefono || null,
      });
      setOk(res.mensaje);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
      </div>
      <Tarjeta className="w-full max-w-sm p-8">
        <h1 className="text-center text-2xl font-bold text-zinc-100">
          Activa tu cuenta
        </h1>
        <p className="mt-1 text-center text-sm text-zinc-400">
          Define tu contraseña para empezar a trabajar
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/15 px-4 py-3 text-sm text-rose-200 backdrop-blur">
            {error}
          </div>
        )}
        {ok && (
          <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200 backdrop-blur">
            {ok}{" "}
            <Link href="/login" className="font-semibold underline">
              Ir a iniciar sesión
            </Link>
          </div>
        )}

        {!ok && (
          <form onSubmit={activar} className="mt-6 space-y-4">
            <Campo
              label="Nueva contraseña"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
            />
            <Campo
              label="Repite la contraseña"
              type="password"
              placeholder="••••••••"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
            />
            <Campo
              label="Teléfono (opcional)"
              placeholder="+57 300 000 0000"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
            />
            <Boton type="submit" variante="primario" className="w-full" disabled={cargando}>
              {cargando ? <Spinner /> : "Activar cuenta"}
            </Boton>
          </form>
        )}
      </Tarjeta>
    </div>
  );
}