"use client";

import { useEffect, useMemo, useState } from "react";
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

  const grupos = useMemo(() => {
    const map = new Map<string, ServicioPublico[]>();
    for (const s of servicios ?? []) {
      const cat = s.categoria ?? "Otros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return [...map.entries()];
  }, [servicios]);

  const logo = config?.logo_url ?? "/logo.png";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <section className="relative mb-16 text-center animate-fade-up">
          <div className="mb-7 inline-flex items-center justify-center rounded-full bg-white p-2 shadow-xl shadow-zinc-200">
            {logo?.startsWith("http") ? (
              <Image
                src={logo}
                alt={config?.nombre_negocio ?? "Logo"}
                width={132}
                height={132}
                priority
                className="h-24 w-24 rounded-full object-contain sm:h-28 sm:w-28"
              />
            ) : (
              <Image
                src={logo}
                alt="Slotify"
                width={132}
                height={132}
                priority
                className="h-24 w-24 object-contain sm:h-28 sm:w-28"
              />
            )}
          </div>
          <h1 className="anim-title text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-6xl">
            {config?.nombre_negocio ?? "Slotify"}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-zinc-600 sm:text-lg">
            Agenda tu cita en segundos. Elige tu servicio, el profesional y el
            horario que mejor te convenga.
          </p>
          {config?.descripcion && (
            <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-500 sm:text-base">
              {config.descripcion}
            </p>
          )}
          {config?.direccion && (
            <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500">
              📍 {config.direccion}
            </p>
          )}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#servicios"
              className="rounded-xl bg-[var(--primary-600)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--primary-900)]/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-700)] hover:shadow-[var(--primary-600)]/30"
            >
              Explorar servicios
            </a>
            <a
              href="/agendar"
              className="rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-[var(--primary-700)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-50)]"
            >
              Agendar ahora
            </a>
          </div>
        </section>

        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-600 animate-fade-in">
            {error}
          </p>
        )}

        {!servicios && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        <section id="servicios" className="relative mb-8 text-center scroll-mt-24 animate-fade-up [animation-delay:150ms]">
          <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Servicios</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            Los servicios disponibles que puedes reservar.
          </p>
        </section>

        {grupos.map(([categoria, lista], gi) => (
          <div key={categoria} className="mx-auto mb-12 max-w-5xl animate-fade-up">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900">
              <span className="h-6 w-1.5 rounded-full bg-[var(--primary-600)]" />
              {categoria}
              <span className="text-sm font-normal text-zinc-400">({lista.length})</span>
            </h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((s, i) => {
                const ofrecidos = profesionales.filter((p) => s.profesionales_ids.includes(p.id));
                return (
                  <Tarjeta
                    key={s.id}
                    className="group flex flex-col overflow-hidden p-0 animate-fade-up hover:-translate-y-1.5"
                    style={{ animationDelay: `${Math.min(gi, 2) * 150 + i * 80}ms` }}
                  >
                    {s.imagen_url && (
                      <div className="relative h-40 w-full shrink-0 overflow-hidden bg-zinc-100">
                        <Image src={s.imagen_url} alt={s.nombre} fill className="object-cover transition duration-300 group-hover:scale-105" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <h3 className="text-lg font-bold text-zinc-900">{s.nombre}</h3>
                        <span className="rounded-full bg-[var(--primary-50)] px-2.5 py-1 text-sm font-bold text-[var(--primary-700)]">
                          {formatter.format(s.precio)}
                        </span>
                      </div>
                      {s.cargo_requerido && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-600)]">
                          Requiere {s.cargo_requerido}
                        </p>
                      )}
                      {s.descripcion && (
                        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                          {s.descripcion}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                        <span className="rounded-lg bg-zinc-100 px-2 py-1">
                          {s.duracion_min} min
                        </span>
                        {s.buffer_min > 0 && (
                          <span className="rounded-lg bg-zinc-100 px-2 py-1">
                            +{s.buffer_min} min de margen
                          </span>
                        )}
                      </div>
                      {ofrecidos.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {ofrecidos.map((p) => (
                            <span
                              key={p.id}
                              title={p.cargo ?? ""}
                              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600"
                            >
                              {p.foto_url ? (
                                <Image
                                  src={p.foto_url}
                                  alt={p.nombre}
                                  width={20}
                                  height={20}
                                  className="h-5 w-5 rounded-full object-cover"
                                />
                              ) : (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary-600)] text-[10px] font-bold text-white">
                                  {p.nombre.charAt(0).toUpperCase()}
                                </span>
                              )}
                              {p.nombre}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-auto pt-5">
                        <Link
                          href={`/agendar?servicio=${s.id}`}
                          className="block w-full rounded-xl bg-[var(--primary-600)] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[var(--primary-700)]"
                        >
                          Reservar
                        </Link>
                      </div>
                    </div>
                  </Tarjeta>
                );
              })}
            </div>
          </div>
        ))}

        {servicios && servicios.length === 0 && (
          <p className="py-16 text-center text-zinc-500">
            Aún no hay servicios publicados.
          </p>
        )}
      </main>
      <AsistenteIA />
    </div>
  );
}