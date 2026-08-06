"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { serviciosPublicos } from "@/lib/supabaseClient";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import { diasProximos, fmtPill } from "@/lib/fechas";
import { Boton, Campo, Spinner } from "@/components/ui";
import type { ServicioPublico, Slot } from "@/types";

const TZ = "America/Bogota";

export default function NuevaCita({
  profesionalId,
  onCerrar,
  onCreada,
}: {
  profesionalId?: string | null;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [servicio, setServicio] = useState<ServicioPublico | null>(null);
  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [dia, setDia] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<string | null>(null);
  const [profId, setProfId] = useState<string | null>(profesionalId ?? null);

  useEffect(() => {
    (async () => {
      const token = (await getTokenSesion()) ?? undefined;
      let id = profesionalId ?? null;
      if (!id) {
        const perfil = await llamarEdge<{ profesional: { id: string } }>("mi-perfil", {}, token).catch(() => null);
        id = perfil?.profesional?.id ?? null;
      }
      setProfId(id);
      const s = await serviciosPublicos();
      const lista = (s.data as ServicioPublico[]) ?? [];
      setServicios(id ? lista.filter((x) => x.activo && x.profesionales_ids.includes(id)) : lista.filter((x) => x.activo));
    })();
  }, [profesionalId]);

  const dias = useMemo(() => diasProximos(14, TZ), []);

  const cargarSlots = useCallback(
    async (d: string) => {
      if (!servicio) return;
      setCargandoSlots(true);
      setError(null);
      setDia(d);
      setSlot(null);
      try {
        const token = (await getTokenSesion()) ?? undefined;
        const res = await llamarEdge<{ slots: Slot[] }>(
          "consultar-disponibilidad",
          { servicio_id: servicio.id, profesional_id: profId, fecha: d, dias: 1 },
          token
        );
        setSlots(res.slots.sort((a, b) => a.start.localeCompare(b.start)));
      } catch (e) {
        setError((e as Error).message);
        setSlots([]);
      } finally {
        setCargandoSlots(false);
      }
    },
    [servicio, profId]
  );

  async function confirmar() {
    if (!servicio || !slot) return;
    if (!email.trim() || !nombre.trim()) {
      setError("Indica el nombre y el email del cliente.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge(
        "crear-cita-profesional",
        {
          servicio_id: servicio.id,
          start: slot.start,
          profesional_id: profId ?? undefined,
          email_cliente: email.trim(),
          nombre_cliente: nombre.trim(),
          telefono_cliente: telefono.trim() || null,
          notas: notas.trim() || null,
        },
        token
      );
      setCreada("Cita creada como ·pendiente·. Se envió un correo al cliente para confirmarla.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="glass-strong w-full max-w-lg max-h-[85vh] overflow-auto rounded-3xl p-5 shadow-2xl animate-scale-in">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Nueva cita</h3>
            <p className="text-sm text-zinc-400">
              La cita quedará <b>pendiente</b> hasta que el cliente confirme por correo.
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-lg px-2 py-1 text-zinc-500 transition hover:bg-white/[0.06]"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {creada ? (
          <div className="py-6 text-center">
            <p className="mb-4 text-emerald-600 font-semibold">{creada}</p>
            <Boton variante="primario" onClick={onCreada}>
              Listo
            </Boton>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Servicio</label>
              <div className="flex flex-wrap gap-2">
                {servicios
                  .filter((s) => s.activo)
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setServicio(s);
                        setDia("");
                        setSlot(null);
                        setSlots([]);
                      }}
                      className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                        servicio?.id === s.id
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-white/10 bg-white/[0.06] text-zinc-200 hover:border-violet-400"
                      }`}
                    >
                      {s.nombre}
                    </button>
                  ))}
              </div>
            </div>

            {servicio && (
              <>
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {dias.map((d) => (
                    <button
                      key={d}
                      onClick={() => cargarSlots(d)}
                      className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        dia === d
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-white/10 bg-white/[0.06] text-zinc-300 hover:border-violet-400"
                      }`}
                    >
                      {fmtPill(d, TZ)}
                    </button>
                  ))}
                </div>

                {cargandoSlots ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : slots.length > 0 ? (
                  <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <button
                        key={s.start}
                        onClick={() => setSlot(s)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          slot?.start === s.start
                            ? "border-violet-600 bg-violet-600 text-white"
                            : "border-white/10 bg-white/[0.06] text-zinc-200 hover:border-violet-400"
                        }`}
                      >
                        {new Intl.DateTimeFormat("es", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: TZ,
                        }).format(new Date(s.start))}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mb-4 py-4 text-center text-sm text-zinc-400">
                    {dia ? "No hay horarios disponibles ese día." : "Elige un día para ver horarios."}
                  </p>
                )}
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Email del cliente" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Campo label="Nombre del cliente" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <Campo
                label="Teléfono (opcional)"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="sm:col-span-2"
              />
              <Campo
                label="Notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="sm:col-span-2"
              />
            </div>

            {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}

            <div className="mt-4 flex gap-3">
              <Boton variante="primario" onClick={confirmar} disabled={!servicio || !slot || guardando} className="flex-1">
                {guardando ? "Creando…" : "Crear cita"}
              </Boton>
              <Boton variante="claro" onClick={onCerrar}>
                Cancelar
              </Boton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}