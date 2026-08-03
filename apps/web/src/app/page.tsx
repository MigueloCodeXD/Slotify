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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <section className="mb-16 text-center">
          <div className="mb-6 inline-flex rounded-3xl bg-white/95 p-4 shadow-2xl shadow-violet-900/40 ring-1 ring-white/40">
            <Image
              src="/logo.png"
              alt="Slotify"
              width={120}
              height={120}
              priority
              className="h-24 w-24 object-contain sm:h-28 sm:w-28"
            />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            {config?.nombre_negocio ?? "Slotify"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-violet-100 sm:text-base">
            Agenda tu cita en segundos. Elige tu servicio, el profesional y el
            horario que mejor te convenga.
          </p>
        </section>

        {error && (
          <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-center text-sm text-rose-200">
            {error}
          </p>
        )}

        {!servicios && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        <section className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Servicios</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-violet-100">
            Los servicios disponibles que puedes reservar.
          </p>
        </section>

        <section className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(servicios ?? []).map((s) => {
            const ofrecidos = profesionales.filter((p) => s.profesionales_ids.includes(p.id));
            return (
              <Tarjeta key={s.id} className="flex flex-col p-6">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold text-slate-800">{s.nombre}</h3>
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-sm font-bold text-violet-700">
                    {formatter.format(s.precio)}
                  </span>
                </div>
                {s.categoria && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
                    {s.categoria}
                  </p>
                )}
                {s.descripcion && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {s.descripcion}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-lg bg-slate-100 px-2 py-1">
                    {s.duracion_min} min
                  </span>
                  {s.buffer_min > 0 && (
                    <span className="rounded-lg bg-slate-100 px-2 py-1">
                      +{s.buffer_min} min de margen
                    </span>
                  )}
                </div>
                {ofrecidos.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {ofrecidos.map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs text-violet-700"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-700">
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
                    className="block w-full rounded-xl bg-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-violet-500"
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