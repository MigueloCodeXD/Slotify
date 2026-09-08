"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { configPublica } from "@/lib/supabaseClient";
import { aplicarTema } from "@/lib/theme";
import type { Config } from "@/types";

export function Navbar() {
  const pathname = usePathname();
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    configPublica().then((c) => {
      const cfg = c.data as Config | null;
      setConfig(cfg);
      if (cfg?.color_principal) aplicarTema(cfg.color_principal);
    });
  }, []);

  const logo = config?.logo_url || "/logo.png";
  const nombre = config?.nombre_negocio || "Slotify";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/85 backdrop-blur-lg animate-fade-in">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src={logo}
            alt={nombre}
            width={40}
            height={40}
            className="h-9 w-9 rounded-xl object-contain"
          />
          <span className="text-lg font-bold tracking-tight text-zinc-900">
            {nombre}
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2 text-sm font-medium">
          <Link
            href="/"
            className={`rounded-lg px-2 py-2 sm:px-3 transition ${
              pathname === "/"
                ? "bg-[var(--primary-50)] text-[var(--primary-700)]"
                : "text-zinc-600 hover:bg-[var(--primary-50)] hover:text-[var(--primary-700)]"
            }`}
          >
            Servicios
          </Link>
          <Link
            href="/mis-citas"
            className={`rounded-lg px-2 py-2 transition sm:px-3 ${
              pathname.startsWith("/mis-citas")
                ? "bg-[var(--primary-50)] text-[var(--primary-700)]"
                : "text-zinc-600 hover:bg-[var(--primary-50)] hover:text-[var(--primary-700)]"
            }`}
          >
            Mis citas
          </Link>
          <Link
            href="/agendar"
            className="rounded-lg bg-[var(--primary-600)] px-3 py-2 font-semibold text-white shadow-md shadow-[var(--primary-900)]/20 transition hover:bg-[var(--primary-700)]"
          >
            Agendar
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-700 transition hover:border-[var(--primary-300)] hover:text-[var(--primary-700)]"
          >
            Profesionales
          </Link>
        </nav>
      </div>
    </header>
  );
}