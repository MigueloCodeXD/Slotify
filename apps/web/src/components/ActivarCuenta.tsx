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
    <div className="flex min-h-screen items-center justify-center px-4">
      <Tarjeta className="w-full max-w-sm p-8">
        <h1 className="text-center text-2xl font-bold text-slate-800">
          Activa tu cuenta
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Define tu contraseña para empezar a trabajar
        </p>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}
        {ok && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
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
              className="border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:ring-violet-300"
            />
            <Campo
              label="Repite la contraseña"
              type="password"
              placeholder="••••••••"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:ring-violet-300"
            />
            <Campo
              label="Teléfono (opcional)"
              placeholder="+57 300 000 0000"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:ring-violet-300"
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