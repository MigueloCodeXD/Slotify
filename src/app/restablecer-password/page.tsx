"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";

export default function RestablecerPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") {
        setLista(true);
      } else if (evento === "SIGNED_IN") {
        setLista(true);
      }
    });
    const tipo = new URLSearchParams(window.location.hash.slice(1)).get("type");
    if (tipo === "recovery") setLista(true);
    return () => data.subscription.unsubscribe();
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.updateUser({ password });
    setCargando(false);
    if (error) {
      setError("No pudimos actualizar la contraseña. Vuelve a usar el enlace del correo.");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
      </div>
      <Link
        href="/login"
        className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-violet-100 transition hover:bg-white/10 hover:text-white"
      >
        ← Volver al inicio de sesión
      </Link>
      <Tarjeta className="w-full max-w-sm p-8 animate-scale-in">
        <h1 className="text-center text-2xl font-bold text-zinc-100">Nueva contraseña</h1>
        <p className="mt-1 text-center text-sm text-zinc-400">
          Establece una nueva contraseña para tu cuenta
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/15 px-4 py-3 text-sm text-rose-200 backdrop-blur">
            {error}
          </div>
        )}

        {!lista ? (
          <p className="mt-6 text-center text-sm text-zinc-400">
            Cargando… Si este enlace ya fue usado, solicita uno nuevo.
          </p>
        ) : (
          <form onSubmit={guardar} className="mt-6 space-y-4">
            <Campo
              label="Nueva contraseña"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
            />
            <Campo
              label="Confirmar contraseña"
              type="password"
              placeholder="••••••••"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="border-white/10 bg-white/[0.06] text-zinc-100 placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
            />
            <Boton type="submit" variante="primario" className="w-full" disabled={cargando}>
              {cargando ? <Spinner /> : "Guardar contraseña"}
            </Boton>
          </form>
        )}
      </Tarjeta>
    </div>
  );
}