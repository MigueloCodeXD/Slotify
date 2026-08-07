"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { Navbar } from "@/components/Navbar";
import { configPublica, profesionalesPublicos, serviciosPublicos } from "@/lib/supabaseClient";
import { llamarEdge } from "@/lib/api";
import { googleCalendarLink, icsLink } from "@/lib/calendarLink";
import { TZ, actualizarTZ } from "@/lib/zonaHoraria";
import { useToast } from "@/components/Toast";
import type { Config, ProfesionalPublico, ServicioPublico } from "@/types";

type Paso = "servicio" | "profesional" | "horario" | "datos" | "confirmacion";

interface Slot {
  profesional_id: string;
  start: string;
  end: string;
}

function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function fmtDia(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  }).format(new Date(iso));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDia(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export function Agendar() {
  const router = useRouter();
  const params = useSearchParams();
  const servicioPreseleccionado = params.get("servicio");

  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [profesionales, setProfesionales] = useState<ProfesionalPublico[]>([]);
  const [config, setConfig] = useState<Config | null>(null);

  const { notificar } = useToast();

  const [paso, setPaso] = useState<Paso>("servicio");
  const [servicio, setServicio] = useState<ServicioPublico | null>(null);
  const [profesionalId, setProfesionalId] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string>("");
  const [slot, setSlot] = useState<Slot | null>(null);

  const [datos, setDatos] = useState({ nombre: "", email: "", telefono: "", website: "" });
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [ocupados, setOcupados] = useState<Slot[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<{ nombre?: string; email?: string; telefono?: string }>({});

  const [citaFinal, setCitaFinal] = useState<{
    id: string;
    start: string;
    end: string;
    servicio: string;
    profesional: string;
    link_gestion: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([configPublica(), serviciosPublicos(), profesionalesPublicos()]).then(
      ([c, s, p]) => {
        const cfg = c.data as Config | null;
        actualizarTZ(cfg?.zona_horaria);
        setConfig(cfg);
        const sv = (s.data as ServicioPublico[]) ?? [];
        setServicios(sv);
        setProfesionales((p.data as ProfesionalPublico[]) ?? []);
        if (servicioPreseleccionado) {
          const found = sv.find((x) => x.id === servicioPreseleccionado);
          if (found) {
            setServicio(found);
            setPaso("profesional");
          }
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profesionalesDelServicio = useMemo(() => {
    if (!servicio) return [];
    return profesionales.filter((p) => servicio.profesionales_ids.includes(p.id));
  }, [servicio, profesionales]);

  const [mes, setMes] = useState(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), 1);
  });

  const hoyInicio = useMemo(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
  }, []);

  const celdas = useMemo(() => {
    const y = mes.getFullYear();
    const m = mes.getMonth();
    const nDias = new Date(y, m + 1, 0).getDate();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const dias = new Array<{ iso: string; num: number; pasado: boolean }>();
    for (let i = 0; i < offset; i++) dias.push({ iso: "", num: 0, pasado: false });
    for (let d = 1; d <= nDias; d++) {
      const iso = isoDia(y, m, d);
      dias.push({ iso, num: d, pasado: new Date(y, m, d).getTime() < hoyInicio });
    }
    return dias;
  }, [mes, hoyInicio]);

  const etiquetaMes = new Intl.DateTimeFormat("es", {
    month: "long",
    year: "numeric",
  }).format(new Date(mes.getFullYear(), mes.getMonth(), 1));

  async function cargarSlots(dia: string) {
    if (!servicio) return;
    setCargandoSlots(true);
    setSlot(null);
    try {
      const res = await llamarEdge<{ slots: Slot[]; ocupados: Slot[] }>("consultar-disponibilidad", {
        servicio_id: servicio.id,
        profesional_id: profesionalId,
        fecha: dia,
        dias: 1,
      });
      setSlots(res.slots.sort((a, b) => a.start.localeCompare(b.start)));
      setOcupados((res.ocupados ?? []).sort((a, b) => a.start.localeCompare(b.start)));
      setFecha(dia);
    } catch (e) {
      notificar((e as Error).message, "error");
      setSlots([]);
    } finally {
      setCargandoSlots(false);
    }
  }

  async function confirmar() {
    if (!servicio || !slot) return;
    if (enviando) return;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim());
    const telefonoOk = datos.telefono.trim() === "" || /^[+\d][\d\s()-]{6,}$/.test(datos.telefono.trim());
    const nuevosErrores = {
      nombre: datos.nombre.trim().length < 2 ? "Ingresa tu nombre." : undefined,
      email: !emailOk ? "Ingresa un email válido." : undefined,
      telefono: !telefonoOk ? "Ingresa un teléfono válido." : undefined,
    };
    setErrores(nuevosErrores);
    if (nuevosErrores.nombre || nuevosErrores.email || nuevosErrores.telefono) return;
    setEnviando(true);
    try {
      const res = await llamarEdge<{
        ok: boolean;
        cita: { id: string; start: string; end: string };
        link_gestion: string;
      }>("crear-cita", {
        servicio_id: servicio.id,
        profesional_id: slot.profesional_id,
        start: slot.start,
        nombre_cliente: datos.nombre,
        email_cliente: datos.email,
        telefono_cliente: datos.telefono || null,
        website: datos.website,
      });
      const profesional = profesionales.find((p) => p.id === slot.profesional_id);
      setCitaFinal({
        id: res.cita.id,
        start: res.cita.start,
        end: res.cita.end,
        servicio: servicio.nombre,
        profesional: profesional?.nombre ?? "",
        link_gestion: res.link_gestion,
      });
      setPaso("confirmacion");
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const steps: { key: Paso; label: string }[] = [
    { key: "servicio", label: "Servicio" },
    { key: "profesional", label: "Profesional" },
    { key: "horario", label: "Horario" },
    { key: "datos", label: "Tus datos" },
  ];

  const horarios = [...slots, ...ocupados].sort((a, b) => a.start.localeCompare(b.start));
  const ocupadoSet = new Set(ocupados.map((o) => o.start));

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="mb-6 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  paso === s.key
                    ? "bg-white text-violet-300"
                    : "bg-white/15 text-white"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  paso === s.key ? "text-white" : "text-violet-200"
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="text-white/30">·</span>}
            </div>
          ))}
        </div>

        {paso === "servicio" && (
          <section className="grid gap-4 sm:grid-cols-2">
            {servicios.map((s) => (
              <Tarjeta key={s.id} className="p-5">
                <h3 className="font-bold text-zinc-100">{s.nombre}</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {s.duracion_min} min · ${s.precio}
                </p>
                <div className="mt-4">
                  <Boton
                    variante="primario"
                    onClick={() => {
                      setServicio(s);
                      setPaso("profesional");
                    }}
                  >
                    Elegir
                  </Boton>
                </div>
              </Tarjeta>
            ))}
          </section>
        )}

        {paso === "profesional" && servicio && (
          <section className="space-y-3">
            <Boton variante="secundario" onClick={() => setPaso("servicio")}>
              ← Volver
            </Boton>
            <Tarjeta className="p-4">
              <button
                className="flex w-full items-center gap-3 text-left"
                onClick={() => {
                  setProfesionalId(null);
                  setPaso("horario");
                }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-200 text-sm font-bold text-violet-300">
                  ✨
                </span>
                <div>
                  <p className="font-semibold text-zinc-100">
                    Cualquier profesional disponible
                  </p>
                  <p className="text-sm text-zinc-400">
                    Asignamos el primero con disponibilidad
                  </p>
                </div>
              </button>
            </Tarjeta>
            {profesionalesDelServicio.map((p) => (
              <Tarjeta key={p.id} className="p-4">
                <button
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => {
                    setProfesionalId(p.id);
                    setPaso("horario");
                  }}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-200 text-sm font-bold text-violet-300">
                    {p.nombre.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold text-zinc-100">{p.nombre}</p>
                    <p className="text-sm text-zinc-400">
                      Profesional de {servicio.nombre}
                    </p>
                  </div>
                </button>
              </Tarjeta>
            ))}
          </section>
        )}

        {paso === "horario" && servicio && (
          <section>
            <Boton variante="secundario" onClick={() => setPaso("profesional")}>
              ← Volver
            </Boton>
            <h2 className="mb-3 mt-4 text-lg font-bold text-white">
              Elige el día
            </h2>
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="mb-2 flex items-center justify-between">
                <button
                  onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white transition hover:bg-white/10"
                  aria-label="Mes anterior"
                >
                  ‹
                </button>
                <span className="text-sm font-bold capitalize text-white">{etiquetaMes}</span>
                <button
                  onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white transition hover:bg-white/10"
                  aria-label="Mes siguiente"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {DIAS_SEMANA.map((d) => (
                  <span key={d} className="pb-1 text-[11px] font-semibold uppercase text-zinc-500">
                    {d}
                  </span>
                ))}
                {celdas.map((c, i) =>
                  c.iso === "" ? (
                    <span key={i} />
                  ) : (
                    <button
                      key={c.iso}
                      disabled={c.pasado}
                      onClick={() => cargarSlots(c.iso)}
                      className={`aspect-square rounded-lg text-sm font-semibold transition ${
                        fecha === c.iso
                          ? "bg-white text-violet-300"
                          : c.pasado
                            ? "cursor-not-allowed bg-white/[0.02] text-white/25"
                            : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      {c.num}
                    </button>
                  )
                )}
              </div>
            </div>

            {cargandoSlots && (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}

            {!cargandoSlots && horarios.length > 0 && (
              <>
                <h3 className="mb-2 text-sm font-semibold text-violet-100">
                  Horarios del dia
                </h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {horarios.map((s) => {
                    const ocupado = ocupadoSet.has(s.start);
                    return (
                      <button
                        key={s.start}
                        disabled={ocupado}
                        title={ocupado ? "Horario no disponible" : "Horario disponible"}
                        onClick={() => setSlot(s)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          slot?.start === s.start
                            ? "border-white bg-white text-violet-300"
                            : ocupado
                              ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40 line-through decoration-rose-400/60"
                              : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                        }`}
                      >
                        {fmtHora(s.start)}
                      </button>
                    );
                  })}
                </div>
                {slot && (
                  <div className="mt-5">
                    <Boton
                      variante="primario"
                      onClick={() => setPaso("datos")}
                      className="w-full sm:w-auto"
                    >
                      Continuar →
                    </Boton>
                  </div>
                )}
              </>
            )}

            {!cargandoSlots && fecha && horarios.length === 0 && (
              <p className="py-8 text-center text-violet-100">
                No hay horarios disponibles para este día.
              </p>
            )}
          </section>
        )}

        {paso === "datos" && slot && servicio && (
          <section>
            <Boton variante="secundario" onClick={() => setPaso("horario")}>
              ← Volver
            </Boton>
            <Tarjeta className="mx-auto mt-4 w-full max-w-lg p-6">
              <div className="mb-4 rounded-xl bg-violet-400/10 px-4 py-3 text-sm text-violet-200">
                {servicio.nombre} · {fmtDia(slot.start)} a las {fmtHora(slot.start)}
              </div>
              <div className="space-y-4">
                <Campo
                    label="Nombre"
                    placeholder="Tu nombre"
                    value={datos.nombre}
                    onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
                  />
                  {errores.nombre && (
                    <p className="text-sm text-rose-300">{errores.nombre}</p>
                  )}
                  <Campo
                    label="Email"
                    type="email"
                    placeholder="tucorreo@ejemplo.com"
                    value={datos.email}
                    onChange={(e) => setDatos({ ...datos, email: e.target.value })}
                  />
                  {errores.email && (
                    <p className="text-sm text-rose-300">{errores.email}</p>
                  )}
                  <Campo
                    label="Teléfono (opcional)"
                    placeholder="+57 300 000 0000"
                    value={datos.telefono}
                    onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
                  />
                  {errores.telefono && (
                    <p className="text-sm text-rose-300">{errores.telefono}</p>
                  )}
                <input
                  type="text"
                  value={datos.website}
                  onChange={(e) => setDatos({ ...datos, website: e.target.value })}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />
                <Boton
                  variante="primario"
                  onClick={confirmar}
                  className="w-full"
                  disabled={enviando || !datos.nombre || !datos.email.includes("@")}
                >
                  {enviando ? "Confirmando…" : "Confirmar cita"}
                </Boton>
              </div>
            </Tarjeta>
          </section>
        )}

        {paso === "confirmacion" && citaFinal && (
          <Tarjeta className="mx-auto w-full max-w-lg p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">¡Cita confirmada!</h2>
            <p className="mt-2 text-zinc-400">
              Te enviamos un correo con el resumen y un enlace para gestionarla.
            </p>
            <div className="mx-auto mt-6 max-w-sm rounded-xl bg-violet-400/10 px-5 py-4 text-left text-sm text-violet-200">
              <p>
                <strong>{citaFinal.servicio}</strong>
              </p>
              <p className="mt-1">
                {fmtDia(citaFinal.start)} · {fmtHora(citaFinal.start)} –{" "}
                {fmtHora(citaFinal.end)}
              </p>
              <p className="mt-1">{citaFinal.profesional}</p>
            </div>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={googleCalendarLink({
                  start: citaFinal.start,
                  end: citaFinal.end,
                  titulo: `${citaFinal.servicio} · ${citaFinal.profesional}`,
                  ubicacion: config?.direccion ?? "",
                })}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400/100"
              >
                Añadir a Google Calendar
              </a>
              <a
                href={icsLink({
                  start: citaFinal.start,
                  end: citaFinal.end,
                  titulo: `${citaFinal.servicio} · ${citaFinal.profesional}`,
                  uid: citaFinal.id,
                  ubicacion: config?.direccion ?? "",
                })}
                download="cita.ics"
                className="rounded-xl border border-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-300 transition hover:bg-violet-400/10"
              >
                Descargar .ics
              </a>
            </div>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Boton variante="secundario" onClick={() => router.push("/")}>
                Volver al inicio
              </Boton>
            </div>
          </Tarjeta>
        )}
      </main>
    </div>
  );
}