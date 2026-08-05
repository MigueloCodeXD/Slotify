"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) {
      setError("Credenciales inválidas.");
      return;
    }
    router.push("/panel");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
      </div>
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-violet-100 transition hover:bg-white/10 hover:text-white"
      >
        ← Volver al inicio
      </Link>
      <Tarjeta className="w-full max-w-sm p-8 animate-scale-in">
        <h1 className="text-center text-2xl font-bold text-zinc-100">
          Panel profesional
        </h1>
        <p className="mt-1 text-center text-sm text-zinc-400">
          Inicia sesión con tu cuenta de Slotify
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/15 px-4 py-3 text-sm text-rose-200 backdrop-blur">
            {error}
          </div>
        )}

        <form onSubmit={entrar} className="mt-6 space-y-4">
          <Campo
            label="Email"
            type="email"
            placeholder="tucorreo@negocio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
          />
          <Campo
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
          />
          <Boton type="submit" variante="primario" className="w-full" disabled={cargando}>
            {cargando ? <Spinner /> : "Entrar"}
          </Boton>
        </form>
      </Tarjeta>
    </div>
  );
}