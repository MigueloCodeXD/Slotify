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
      <div className="flex min-h-screen items-center justify-center text-zinc-600">Cargando…</div>
    );
  }

  const links = [
    { href: "/panel/dashboard", label: "Resumen" },
    { href: "/panel", label: "Calendario" },
    { href: "/panel/mensajes", label: "Mensajes" },
    { href: "/panel/configuracion", label: "Configuración" },
    ...(rol === "admin"
      ? [
          { href: "/panel/profesionales", label: "Profesionales" },
          { href: "/panel/clientes", label: "Clientes" },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Slotify"
              width={40}
              height={40}
              className="h-9 w-9 object-contain"
            />
            <div>
              <p className="font-bold text-zinc-900">Slotify</p>
              <p className="text-xs text-zinc-500">{email}</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${
                  pathname === l.href
                    ? "bg-[var(--primary-600)] text-white shadow-sm"
                    : "text-zinc-600 hover:bg-[var(--primary-50)] hover:text-[var(--primary-700)]"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {rol === "admin" && (
              <span className="ml-1 hidden rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600 sm:inline">
                Admin
              </span>
            )}
            <button
              onClick={salir}
              className="rounded-xl px-4 py-2 text-sm font-medium text-rose-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-50 hover:text-rose-700 active:scale-95"
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