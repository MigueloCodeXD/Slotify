"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [cargando, setCargando] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sesion = data.session;
      if (!sesion) {
        router.replace("/login");
        return;
      }
      setEmail(sesion.user.email ?? null);
      setRol((sesion.user.user_metadata?.rol as string) ?? null);
      setCargando(false);
    });
  }, [router]);

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white">Cargando…</div>
    );
  }

  const links = [
    { href: "/panel", label: "Calendario" },
    { href: "/panel/configuracion", label: "Configuración" },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#130a26]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Slotify"
              width={40}
              height={40}
              className="h-9 w-9 object-contain drop-shadow-lg"
            />
            <div>
              <p className="font-bold text-white">Slotify</p>
              <p className="text-xs text-violet-200/70">{email}</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  pathname === l.href
                    ? "bg-white/15 text-white shadow-inner"
                    : "text-violet-100/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {rol === "admin" && (
              <span className="ml-1 hidden rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-200 sm:inline">
                Admin
              </span>
            )}
            <button
              onClick={salir}
              className="rounded-xl px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/15"
            >
              Cerrar sesión
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:py-8">{children}</main>
    </div>
  );
}