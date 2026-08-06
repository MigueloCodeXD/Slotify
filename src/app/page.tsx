"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/Navbar";
import { Spinner, Tarjeta } from "@/components/ui";
import { configPublica, profesionalesPublicos, serviciosPublicos } from "@/lib/supabaseClient";
import type { Config, ProfesionalPublico, ServicioPublico } from "@/types";
import { AsistenteIA } from "@/components/AsistenteIA";

export default function Home() {
  const [servicios, setServicios] = useState<ServicioPublico[] | null>(null);
  const [profesionales, setProfesionales] = useState<ProfesionalPublico[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([configPublica(), serviciosPublicos(), profesionalesPublicos()])
      .then(([c, s, p]) => {
        setConfig(c.data as Config | null);
        setServicios((s.data as ServicioPublico[]) ?? []);
        setProfesionales((p.data as ProfesionalPublico[]) ?? []);
      })
      .catch(() => setError("No pudimos cargar el catálogo."));
  }, []);

  const formatter = new Intl.NumberFormat("es", {
    style: "currency",
    currency: "USD",
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl animate-blob" />
          <div className="absolute top-10 right-1/5 h-80 w-80 rounded-full bg-violet-400/25 blur-3xl animate-blob [animation-delay:-6s]" />
          <div className="absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl animate-blob [animation-delay:-11s]" />
        </div>

        <section className="relative mb-16 text-center animate-fade-up">
          <div className="mb-7 inline-flex items-center justify-center logo-glow">
            <Image
              src="/logo.png"
              alt="Slotify"
              width={132}
              height={132}
              priority
              className="h-28 w-28 object-contain sm:h-32 sm:w-32"
            />
          </div>
          <h1 className="anim-title text-4xl font-extrabold tracking-tight sm:text-6xl">
            {config?.nombre_negocio ?? "Slotify"}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-violet-100 sm:text-lg">
            Agenda tu cita en segundos. Elige tu servicio, el profesional y el
            horario que mejor te convenga.
          </p>
          {config?.descripcion && (
            <p className="mx-auto mt-3 max-w-2xl text-sm text-violet-200/70 sm:text-base">
              {config.descripcion}
            </p>
          )}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#servicios"
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-violet-500/40"
            >
              Explorar servicios
            </a>
            <a
              href="/agendar"
              className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20"
            >
              Agendar ahora
            </a>
          </div>
        </section>

        {error && (
          <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-center text-sm text-rose-200 animate-fade-in">
            {error}
          </p>
        )}

        {!servicios && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        <section id="servicios" className="relative mb-8 text-center scroll-mt-24 animate-fade-up [animation-delay:150ms]">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Servicios</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-violet-100">
            Los servicios disponibles que puedes reservar.
          </p>
        </section>

        <section className="relative mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(servicios ?? []).map((s, i) => {
            const ofrecidos = profesionales.filter((p) => s.profesionales_ids.includes(p.id));
            return (
              <Tarjeta
                key={s.id}
                className="group flex flex-col p-6 animate-fade-up hover:-translate-y-1.5"
                style={{ animationDelay: `${100 + i * 80}ms` }}
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold text-zinc-100">{s.nombre}</h3>
                  <span className="rounded-full bg-violet-400/15 px-2.5 py-1 text-sm font-bold text-violet-300">
                    {formatter.format(s.precio)}
                  </span>
                </div>
                {s.categoria && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
                    {s.categoria}
                  </p>
                )}
                {s.descripcion && (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {s.descripcion}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                    {s.duracion_min} min
                  </span>
                  {s.buffer_min > 0 && (
                    <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                      +{s.buffer_min} min de margen
                    </span>
                  )}
                </div>
                {ofrecidos.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {ofrecidos.map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-white/[0.04] px-2.5 py-1 text-xs text-violet-300"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                          {p.nombre.charAt(0).toUpperCase()}
                        </span>
                        {p.nombre}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-5">
                  <Link
                    href={`/agendar?servicio=${s.id}`}
                    className="block w-full rounded-xl bg-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-violet-400/100"
                  >
                    Reservar
                  </Link>
                </div>
              </Tarjeta>
            );
          })}
        </section>

        {servicios && servicios.length === 0 && (
          <p className="py-16 text-center text-violet-100">
            Aún no hay servicios publicados.
          </p>
        )}
      </main>
      <AsistenteIA />
    </div>
  );
}