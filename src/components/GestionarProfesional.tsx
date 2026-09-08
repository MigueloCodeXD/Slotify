"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Boton, Spinner, Tarjeta } from "@/components/ui";
import { PanelCalendario } from "@/components/PanelCalendario";
import { useToast } from "@/components/Toast";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion, getRolProfesional } from "@/lib/sesion";
import { serviciosPublicos } from "@/lib/supabaseClient";
import type { ServicioPublico } from "@/types";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface DiaDisponibilidad {
  dia_semana: number;
  activo: boolean;
  hora_inicio: string;
  hora_fin: string;
  pausa_inicio: string;
  pausa_fin: string;
}

const DIA_VACIO: Omit<DiaDisponibilidad, "dia_semana"> = {
  activo: false,
  hora_inicio: "09:00",
  hora_fin: "17:00",
  pausa_inicio: "",
  pausa_fin: "",
};

interface ProfGestion {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  cargo: string | null;
  foto_url: string | null;
}

export function GestionarProfesional() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { notificar } = useToast();
  const id = params.id;

  const [prof, setProf] = useState<ProfGestion | null>(null);
  const [rol, setRol] = useState<"admin" | "profesional" | null>(null);
  const [pestana, setPestana] = useState<"calendario" | "config">("calendario");

  const [disponibilidad, setDisponibilidad] = useState<DiaDisponibilidad[]>(() =>
    DIAS.map((_, i) => ({ dia_semana: i, ...DIA_VACIO }))
  );
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
        llamarEdge<{ dias: DiaDisponibilidad[] }>("configuracion-profesional", { accion: "listar_disponibilidad", profesional_id: id }, token),
        llamarEdge<{ servicio_ids: string[] }>("configuracion-profesional", { accion: "listar_mis_servicios", profesional_id: id }, token),
        serviciosPublicos(),
      ]);
      const filas = (rango.dias ?? []).map((d) => ({ ...d, dia_semana: Number(d.dia_semana) }));
      const dias: DiaDisponibilidad[] = DIAS.map((_, i) => ({ dia_semana: i, ...DIA_VACIO }));
      const porDia: Record<number, typeof filas> = {};
      for (const f of filas) (porDia[f.dia_semana] ??= []).push(f);
      for (const i of DIAS.keys()) {
        const lista = (porDia[i] ?? []).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
        if (lista.length === 0) continue;
        const primera = lista[0];
        const ultima = lista[lista.length - 1];
        dias[i] = {
          dia_semana: i,
          activo: true,
          hora_inicio: primera.hora_inicio,
          hora_fin: ultima.hora_fin,
          pausa_inicio: lista.length === 2 ? primera.hora_fin : (primera.pausa_inicio ?? ""),
          pausa_fin: lista.length === 2 ? ultima.hora_inicio : (primera.pausa_fin ?? ""),
        };
      }
      setDisponibilidad(dias);
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
      .filter((d) => d.activo)
      .map((d) => {
        const ini = d.hora_inicio.slice(0, 5);
        const fin = d.hora_fin.slice(0, 5);
        const pi = d.pausa_inicio.slice(0, 5);
        const pf = d.pausa_fin.slice(0, 5);
        if (fin <= ini) {
          notificar(`En ${DIAS[d.dia_semana]} la hora final debe ser posterior a la inicial.`, "error");
          return null;
        }
        if (pi && pf && pf <= pi) {
          notificar(`En ${DIAS[d.dia_semana]} la pausa debe terminar después de empezar.`, "error");
          return null;
        }
        if ((pi && !pf) || (!pi && pf)) {
          notificar(`En ${DIAS[d.dia_semana]} completa ambos campos de la pausa o ninguno.`, "error");
          return null;
        }
        return {
          dia_semana: d.dia_semana,
          hora_inicio: ini,
          hora_fin: fin,
          ...(pi && pf ? { pausa_inicio: pi, pausa_fin: pf } : {}),
        };
      });
    if (dias.some((x) => x === null)) return;
    if (dias.length === 0) return notificar("Activa al menos un día.", "error");
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge(
        "configuracion-profesional",
        { accion: "guardar_disponibilidad", profesional_id: id, dias: dias.filter(Boolean) },
        token
      );
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

  function alternarDia(idx: number) {
    setDisponibilidad((prev) => prev.map((d, i) => (i === idx ? { ...d, activo: !d.activo } : d)));
  }

  function cambiarDia(idx: number, campo: keyof DiaDisponibilidad, valor: string | boolean) {
    setDisponibilidad((prev) => prev.map((d, i) => (i === idx ? { ...d, [campo]: valor } : d)));
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (rol !== "admin" || !prof) return null;

  const serviciosVisibles = servicios.filter((s) => !s.cargo_requerido || s.cargo_requerido === prof.cargo);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {prof.foto_url ? (
            <Image
              src={prof.foto_url}
              alt={prof.nombre}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-600)] text-lg font-bold text-white">
              {prof.nombre.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="font-display text-3xl font-semibold text-zinc-900 animate-fade-up">
              {prof.nombre}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {prof.email}
              {prof.cargo ? ` · ${prof.cargo}` : ""} ·{" "}
              <span className="font-semibold capitalize">{prof.rol}</span>
              {prof.activo ? " · activo" : " · inactivo"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPestana("calendario")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              pestana === "calendario" ? "bg-[var(--primary-600)] text-white" : "text-zinc-600 hover:bg-[var(--primary-50)]"
            }`}
          >
            Calendario
          </button>
          <button
            onClick={() => setPestana("config")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              pestana === "config" ? "bg-[var(--primary-600)] text-white" : "text-zinc-600 hover:bg-[var(--primary-50)]"
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
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">🧰</span>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">Servicios que ofrece</h2>
              {prof.cargo && (
                <span className="rounded-full bg-[var(--primary-50)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary-700)]">
                  Cargo: {prof.cargo}
                </span>
              )}
            </div>
            {serviciosVisibles.length === 0 && (
              <p className="text-sm text-zinc-500">
                No hay servicios compatibles con el cargo de este profesional.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {serviciosVisibles.map((s) => {
                const activo = misServicios.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleServicio(s.id)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      activo
                        ? "border-[var(--primary-600)] bg-[var(--primary-600)] text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-[var(--primary-400)]"
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
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">🗓</span>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">Disponibilidad semanal</h2>
            </div>
            <div className="space-y-2">
              {disponibilidad.map((d, idx) => (
                <div
                  key={d.dia_semana}
                  className={`rounded-xl border p-3 transition ${
                    d.activo ? "border-[var(--primary-200)] bg-[var(--primary-50)]/40" : "border-zinc-200 bg-white opacity-70"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => alternarDia(idx)}
                      className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                        d.activo
                          ? "bg-[var(--primary-600)] text-white"
                          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${d.activo ? "bg-white" : "bg-zinc-400"}`} />
                      {DIAS[d.dia_semana]}
                    </button>
                    {d.activo && (
                      <>
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold text-zinc-400">Desde</span>
                          <input
                            type="time"
                            value={d.hora_inicio}
                            onChange={(e) => cambiarDia(idx, "hora_inicio", e.target.value)}
                            className="w-32 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          />
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold text-zinc-400">Hasta</span>
                          <input
                            type="time"
                            value={d.hora_fin}
                            onChange={(e) => cambiarDia(idx, "hora_fin", e.target.value)}
                            className="w-32 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div>
                            <span className="mb-1 block text-[10px] font-semibold text-zinc-400">Pausa desde (opcional)</span>
                            <input
                              type="time"
                              value={d.pausa_inicio}
                              onChange={(e) => cambiarDia(idx, "pausa_inicio", e.target.value)}
                              className="w-32 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[10px] font-semibold text-zinc-400">Reanuda (opcional)</span>
                            <input
                              type="time"
                              value={d.pausa_fin}
                              onChange={(e) => cambiarDia(idx, "pausa_fin", e.target.value)}
                              className="w-32 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
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