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
  const [recuperar, setRecuperar] = useState(false);
  const [emailRec, setEmailRec] = useState("");
  const [recuperado, setRecuperado] = useState(false);

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

  async function solicitarRecuperacion(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(emailRec, {
      redirectTo: `${window.location.origin}/restablecer-password`,
    });
    setCargando(false);
    if (error) {
      setError("No pudimos enviar el enlace. Verifica el email.");
      return;
    }
    setRecuperado(true);
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

        {recuperado ? (
          <div className="mt-6 rounded-xl border border-teal-400/25 bg-teal-500/15 px-4 py-3 text-sm text-teal-200 backdrop-blur">
            Si el correo está registrado, enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de
            entrada.
          </div>
        ) : recuperar ? (
          <form onSubmit={solicitarRecuperacion} className="mt-6 space-y-4">
            <p className="text-sm text-zinc-400">
              Te enviaremos un enlace a tu correo para crear una nueva contraseña.
            </p>
            <Campo
              label="Email"
              type="email"
              placeholder="tucorreo@negocio.com"
              value={emailRec}
              onChange={(e) => setEmailRec(e.target.value)}
              className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
            />
            <Boton type="submit" variante="primario" className="w-full" disabled={cargando}>
              {cargando ? <Spinner /> : "Enviar enlace"}
            </Boton>
            <button
              type="button"
              onClick={() => {
                setRecuperar(false);
                setError(null);
              }}
              className="w-full text-center text-xs font-semibold text-violet-300 hover:text-violet-200 hover:underline"
            >
              Volver al inicio de sesión
            </button>
          </form>
        ) : (
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
            <button
              type="button"
              onClick={() => {
                setRecuperar(true);
                setError(null);
              }}
              className="w-full text-center text-xs font-semibold text-violet-300 hover:text-violet-200 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}
      </Tarjeta>
    </div>
  );
}