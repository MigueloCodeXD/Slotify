"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion, getRolProfesional } from "@/lib/sesion";
import { configPublica, serviciosPublicos } from "@/lib/supabaseClient";
import type { Config, ServicioPublico } from "@/types";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface RangoSemanal {
  id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export function Configuracion() {
  const [config, setConfig] = useState<Config | null>(null);
  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [misServicios, setMisServicios] = useState<string[]>([]);
  const [disponibilidad, setDisponibilidad] = useState<RangoSemanal[]>([]);
  const [rol, setRol] = useState<"admin" | "profesional" | null>(null);

  const [invitar, setInvitar] = useState({ nombre: "", email: "" });
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: "", precio: "", duracion: "" });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  async function cargarTodo() {
    try {
      const [c, s, rango] = await Promise.all([
        configPublica(),
        serviciosPublicos(),
        (async () => {
          const token = (await getTokenSesion()) ?? undefined;
          return llamarEdge<{ dias: RangoSemanal[] }>("configuracion-profesional", { accion: "listar_disponibilidad" }, token);
        })(),
      ]);
      setConfig(c.data as Config | null);
      setServicios((s.data as ServicioPublico[]) ?? []);
      setDisponibilidad(rango.dias ?? []);

      const token = (await getTokenSesion()) ?? undefined;
      const [mis, r] = await Promise.all([
        llamarEdge<{ servicio_ids: string[] }>("configuracion-profesional", { accion: "listar_mis_servicios" }, token),
        getRolProfesional(),
      ]);
      setMisServicios(mis.servicio_ids ?? []);
      setRol(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function guardarDisponibilidad() {
    setError(null);
    const token = (await getTokenSesion()) ?? undefined;
    const dias = disponibilidad.filter((d) => d.hora_inicio && d.hora_fin);
    for (const d of dias) {
      if (d.hora_fin <= d.hora_inicio) return setError("Hay un rango con hora de fin anterior a la de inicio.");
    }
    try {
      await llamarEdge("configuracion-profesional", { accion: "guardar_disponibilidad", dias }, token);
      setAviso("Disponibilidad guardada.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleServicio(id: string) {
    const nuevo = misServicios.includes(id) ? misServicios.filter((x) => x !== id) : [...misServicios, id];
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("configuracion-profesional", { accion: "asignar_servicios", servicio_ids: nuevo }, token);
      setMisServicios(nuevo);
      setAviso("Servicios actualizados.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function actualizarConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setError(null);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "actualizar-config",
        {
          nombre_negocio: config.nombre_negocio,
          direccion: config.direccion ?? "",
          margen_anticipacion_horas: Number(config.margen_anticipacion_horas),
          horas_limite_cancelacion: Number(config.horas_limite_cancelacion),
        },
        token
      );
      setAviso("Configuración guardada.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function crearServicio(e: React.FormEvent) {
    e.preventDefault();
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "editar-catalogo",
        {
          nombre: nuevoServicio.nombre,
          precio: Number(nuevoServicio.precio),
          duracion_min: Number(nuevoServicio.duracion),
        },
        token
      );
      setNuevoServicio({ nombre: "", precio: "", duracion: "" });
      setAviso("Servicio creado.");
      const s = await serviciosPublicos();
      setServicios((s.data as ServicioPublico[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function invitarProfesional(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      const res = await llamarEdge<{ mensaje: string }>("invitar-profesional", invitar, token);
      setInvitar({ nombre: "", email: "" });
      setAviso(res.mensaje);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function actualizarRango(idx: number, campo: keyof RangoSemanal, valor: string) {
    setDisponibilidad((prev) => prev.map((d, i) => (i === idx ? { ...d, [campo]: valor } : d)));
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Configuración</h1>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
      {aviso && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100">
          {aviso}
        </div>
      )}

      <Tarjeta className="p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-500">
          Negocio
        </h2>
        {config && (
          <form onSubmit={actualizarConfig} className="grid gap-3 sm:grid-cols-2">
            <Campo
              label="Nombre del negocio"
              value={config.nombre_negocio}
              onChange={(e) => setConfig({ ...config, nombre_negocio: e.target.value })}
              className="border-slate-300 bg-white text-slate-800"
            />
            <Campo
              label="Dirección"
              value={config.direccion ?? ""}
              onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
              className="border-slate-300 bg-white text-slate-800"
            />
            <Campo
              label="Margen de anticipación (horas)"
              type="number"
              value={config.margen_anticipacion_horas}
              onChange={(e) => setConfig({ ...config, margen_anticipacion_horas: Number(e.target.value) })}
              className="border-slate-300 bg-white text-slate-800"
            />
            <Campo
              label="Límite para cancelar (horas)"
              type="number"
              value={config.horas_limite_cancelacion}
              onChange={(e) => setConfig({ ...config, horas_limite_cancelacion: Number(e.target.value) })}
              className="border-slate-300 bg-white text-slate-800"
            />
            <div className="sm:col-span-2">
              <Boton type="submit" variante="primario">
                Guardar configuración
              </Boton>
            </div>
          </form>
        )}
      </Tarjeta>

      <Tarjeta className="p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-500">
          Servicios que ofrezco
        </h2>
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
                    : "border-slate-300 bg-white text-slate-600 hover:border-violet-400"
                }`}
              >
                {s.nombre}
              </button>
            );
          })}
        </div>
      </Tarjeta>

      <Tarjeta className="p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-500">
          Mi disponibilidad semanal
        </h2>
        <div className="space-y-2">
          {disponibilidad.map((d, idx) => (
            <div key={idx} className="grid grid-cols-3 items-center gap-2 sm:grid-cols-4">
              <select
                value={d.dia_semana}
                onChange={(e) => actualizarRango(idx, "dia_semana", e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
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
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
              />
              <input
                type="time"
                value={d.hora_fin}
                onChange={(e) => actualizarRango(idx, "hora_fin", e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
              />
              <button
                onClick={() => setDisponibilidad((prev) => prev.filter((_, i) => i !== idx))}
                className="text-sm text-rose-500 hover:underline"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
            <Boton
              variante="claro"
              onClick={() =>
                setDisponibilidad((prev) => [...prev, { dia_semana: 1, hora_inicio: "09:00", hora_fin: "17:00" }])
              }
          >
            + Añadir rango
          </Boton>
          <Boton variante="primario" onClick={guardarDisponibilidad}>
            Guardar disponibilidad
          </Boton>
        </div>
      </Tarjeta>

      <Tarjeta className="p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-500">
          Nuevo servicio
        </h2>
        <form onSubmit={crearServicio} className="grid gap-3 sm:grid-cols-4">
          <Campo
            label="Nombre"
            value={nuevoServicio.nombre}
            onChange={(e) => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
            className="border-slate-300 bg-white text-slate-800"
          />
          <Campo
            label="Precio ($)"
            type="number"
            value={nuevoServicio.precio}
            onChange={(e) => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
            className="border-slate-300 bg-white text-slate-800"
          />
          <Campo
            label="Duración (min)"
            type="number"
            value={nuevoServicio.duracion}
            onChange={(e) => setNuevoServicio({ ...nuevoServicio, duracion: e.target.value })}
            className="border-slate-300 bg-white text-slate-800"
          />
          <div className="flex items-end">
            <Boton type="submit" variante="primario" className="w-full">
              Crear
            </Boton>
          </div>
        </form>
      </Tarjeta>

      {rol === "admin" && (
        <Tarjeta className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-500">
            Invitar profesional
          </h2>
          <form onSubmit={invitarProfesional} className="grid gap-3 sm:grid-cols-3">
            <Campo
              label="Nombre"
              value={invitar.nombre}
              onChange={(e) => setInvitar({ ...invitar, nombre: e.target.value })}
              className="border-slate-300 bg-white text-slate-800"
            />
            <Campo
              label="Email"
              type="email"
              value={invitar.email}
              onChange={(e) => setInvitar({ ...invitar, email: e.target.value })}
              className="border-slate-300 bg-white text-slate-800"
            />
            <div className="flex items-end">
              <Boton type="submit" variante="primario" className="w-full">
                Enviar invitación
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}
    </div>
  );
}