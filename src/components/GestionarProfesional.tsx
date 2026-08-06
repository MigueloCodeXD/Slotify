"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Boton, Spinner, Tarjeta } from "@/components/ui";
import { PanelCalendario } from "@/components/PanelCalendario";
import { useToast } from "@/components/Toast";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion, getRolProfesional } from "@/lib/sesion";
import { serviciosPublicos } from "@/lib/supabaseClient";
import type { ServicioPublico } from "@/types";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface RangoSemanal {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

interface ProfGestion {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
}

export function GestionarProfesional() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { notificar } = useToast();
  const id = params.id;

  const [prof, setProf] = useState<ProfGestion | null>(null);
  const [rol, setRol] = useState<"admin" | "profesional" | null>(null);
  const [pestana, setPestana] = useState<"calendario" | "config">("calendario");

  const [disponibilidad, setDisponibilidad] = useState<RangoSemanal[]>([]);
  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [misServicios, setMisServicios] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoConfig, setCargandoConfig] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await getRolProfesional();
        setRol(r);
        if (r !== "admin") {
          notificar("No autorizado.", "error");
          router.replace("/panel");
          return;
        }
        const token = (await getTokenSesion()) ?? undefined;
        const res = await llamarEdge<{ profesionales: ProfGestion[] }>("gestionar-profesionales", { accion: "listar" }, token);
        const encontrado = (res.profesionales ?? []).find((p) => p.id === id);
        if (!encontrado) {
          notificar("Profesional no encontrado.", "error");
          router.replace("/panel/profesionales");
          return;
        }
        setProf(encontrado);
      } catch (e) {
        notificar((e as Error).message, "error");
      } finally {
        setCargando(false);
      }
    })();
  }, [id, notificar, router]);

  async function cargarConfig() {
    setCargandoConfig(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const [rango, mis, s] = await Promise.all([
        llamarEdge<{ dias: RangoSemanal[] }>("configuracion-profesional", { accion: "listar_disponibilidad", profesional_id: id }, token),
        llamarEdge<{ servicio_ids: string[] }>("configuracion-profesional", { accion: "listar_mis_servicios", profesional_id: id }, token),
        serviciosPublicos(),
      ]);
      setDisponibilidad((rango.dias ?? []).map((d) => ({ ...d, dia_semana: Number(d.dia_semana) })));
      setMisServicios(mis.servicio_ids ?? []);
      setServicios((s.data as ServicioPublico[]) ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setCargandoConfig(false);
    }
  }

  useEffect(() => {
    if (pestana === "config") void cargarConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestana]);

  async function guardarDisponibilidad() {
    const dias = disponibilidad
      .filter((d) => d.hora_inicio && d.hora_fin)
      .map((d) => ({ dia_semana: Number(d.dia_semana), hora_inicio: d.hora_inicio.slice(0, 5), hora_fin: d.hora_fin.slice(0, 5) }));
    for (const d of dias) {
      if (d.hora_fin <= d.hora_inicio) return notificar("Hay un rango con hora de fin anterior a la de inicio.", "error");
    }
    if (dias.length === 0) return notificar("Añade al menos un rango de disponibilidad.", "error");
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("configuracion-profesional", { accion: "guardar_disponibilidad", profesional_id: id, dias }, token);
      notificar("Disponibilidad guardada.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function toggleServicio(servicioId: string) {
    const nuevo = misServicios.includes(servicioId)
      ? misServicios.filter((x) => x !== servicioId)
      : [...misServicios, servicioId];
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("configuracion-profesional", { accion: "asignar_servicios", profesional_id: id, servicio_ids: nuevo }, token);
      setMisServicios(nuevo);
      notificar("Servicios actualizados.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  function actualizarRango(idx: number, campo: keyof RangoSemanal, valor: string | number) {
    setDisponibilidad((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, [campo]: campo === "dia_semana" ? Number(valor) : valor } : d))
    );
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (rol !== "admin" || !prof) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white animate-fade-up">
            {prof.nombre}
          </h1>
          <p className="mt-1 text-sm text-violet-200/60">
            {prof.email} ·{" "}
            <span className="font-semibold capitalize">{prof.rol}</span>
            {prof.activo ? " · activo" : " · inactivo"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPestana("calendario")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              pestana === "calendario" ? "bg-white/15 text-white" : "text-violet-100/80 hover:bg-white/10"
            }`}
          >
            Calendario
          </button>
          <button
            onClick={() => setPestana("config")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              pestana === "config" ? "bg-white/15 text-white" : "text-violet-100/80 hover:bg-white/10"
            }`}
          >
            Disponibilidad y servicios
          </button>
          <Boton variante="claro" onClick={() => router.push("/panel/profesionales")}>
            ← Volver
          </Boton>
        </div>
      </div>

      {pestana === "calendario" ? (
        <PanelCalendario profesionalIdTarget={id} />
      ) : cargandoConfig ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <Tarjeta className="p-5 animate-fade-up">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">🧰</span>
              <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Servicios que ofrece</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {servicios.map((s) => {
                const activo = misServicios.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleServicio(s.id)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      activo
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-white/10 bg-white/[0.06] text-zinc-300 hover:border-violet-400"
                    }`}
                  >
                    {s.nombre}
                  </button>
                );
              })}
            </div>
          </Tarjeta>

          <Tarjeta className="p-5 animate-fade-up [animation-delay:80ms]">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">🗓</span>
              <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Disponibilidad semanal</h2>
            </div>
            <div className="space-y-2">
              {disponibilidad.map((d, idx) => (
                <div key={idx} className="grid grid-cols-3 items-center gap-2 sm:grid-cols-4">
                  <select
                    value={d.dia_semana}
                    onChange={(e) => actualizarRango(idx, "dia_semana", e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-2 text-sm text-zinc-100"
                  >
                    {DIAS.map((nombre, i) => (
                      <option key={i} value={i}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={d.hora_inicio}
                    onChange={(e) => actualizarRango(idx, "hora_inicio", e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-2 text-sm text-zinc-100"
                  />
                  <input
                    type="time"
                    value={d.hora_fin}
                    onChange={(e) => actualizarRango(idx, "hora_fin", e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-2 text-sm text-zinc-100"
                  />
                  <button
                    onClick={() => setDisponibilidad((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-lg border border-rose-300/30 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/10"
                  >
                    ✕ Quitar
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Boton
                variante="claro"
                onClick={() => setDisponibilidad((prev) => [...prev, { dia_semana: 1, hora_inicio: "09:00", hora_fin: "17:00" }])}
              >
                + Añadir rango
              </Boton>
              <Boton variante="primario" onClick={guardarDisponibilidad}>
                Guardar disponibilidad
              </Boton>
            </div>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}