"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export function Navbar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/20 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Slotify"
            width={40}
            height={40}
            className="h-9 w-9 object-contain drop-shadow-lg"
          />
          <span className="text-lg font-bold tracking-tight text-white">
            Slotify
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm font-medium">
          <Link
            href="/"
            className={`rounded-lg px-3 py-2 transition ${
              pathname === "/"
                ? "bg-white/15 text-white"
                : "text-violet-100 hover:bg-white/10 hover:text-white"
            }`}
          >
            Servicios
          </Link>
          <Link
            href="/mis-citas"
            className={`rounded-lg px-3 py-2 transition ${
              pathname.startsWith("/mis-citas")
                ? "bg-white/15 text-white"
                : "text-violet-100 hover:bg-white/10 hover:text-white"
            }`}
          >
            Mis citas
          </Link>
          <Link
            href="/agendar"
            className="rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 px-3 py-2 font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-400 hover:to-fuchsia-400"
          >
            Agendar
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-white/10 px-3 py-2 text-white transition hover:bg-white/20"
          >
            Profesionales
          </Link>
        </nav>
      </div>
    </header>
  );
}