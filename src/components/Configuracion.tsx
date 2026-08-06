"use client";

import { useCallback, useEffect, useState } from "react";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion, getRolProfesional } from "@/lib/sesion";
import { configPublica, serviciosPublicos } from "@/lib/supabaseClient";
import { useToast } from "@/components/Toast";
import { ChatIA } from "@/components/ChatIA";
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
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<{ nombre: string; telefono: string; foto_url: string }>({
    nombre: "",
    telefono: "",
    foto_url: "",
  });

  const { notificar } = useToast();

  const cargarTodo = useCallback(async () => {
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
      setDisponibilidad((rango.dias ?? []).map((d) => ({ ...d, dia_semana: Number(d.dia_semana) })));

      const token = (await getTokenSesion()) ?? undefined;
      const [mis, r, perfilRes] = await Promise.all([
        llamarEdge<{ servicio_ids: string[] }>("configuracion-profesional", { accion: "listar_mis_servicios" }, token),
        getRolProfesional(),
        llamarEdge<{ profesional: { nombre: string; telefono: string | null; foto_url: string | null } }>("mi-perfil", {}, token),
      ]);
      setMisServicios(mis.servicio_ids ?? []);
      setRol(r);
      setPerfil({
        nombre: perfilRes.profesional?.nombre ?? "",
        telefono: perfilRes.profesional?.telefono ?? "",
        foto_url: perfilRes.profesional?.foto_url ?? "",
      });
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function guardarDisponibilidad() {
    const token = (await getTokenSesion()) ?? undefined;
    const dias = disponibilidad
      .filter((d) => d.hora_inicio && d.hora_fin)
      .map((d) => ({ dia_semana: Number(d.dia_semana), hora_inicio: d.hora_inicio.slice(0, 5), hora_fin: d.hora_fin.slice(0, 5) }));
    for (const d of dias) {
      if (d.hora_fin <= d.hora_inicio) return notificar("Hay un rango con hora de fin anterior a la de inicio.", "error");
    }
    if (dias.length === 0) return notificar("Añade al menos un rango de disponibilidad.", "error");
    try {
      await llamarEdge("configuracion-profesional", { accion: "guardar_disponibilidad", dias }, token);
      notificar("Disponibilidad guardada.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function toggleServicio(id: string) {
    const nuevo = misServicios.includes(id) ? misServicios.filter((x) => x !== id) : [...misServicios, id];
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("configuracion-profesional", { accion: "asignar_servicios", servicio_ids: nuevo }, token);
      setMisServicios(nuevo);
      notificar("Servicios actualizados.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function actualizarConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
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
      notificar("Configuración guardada.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
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
      notificar("Servicio creado.", "exito");
      const s = await serviciosPublicos();
      setServicios((s.data as ServicioPublico[]) ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function eliminarServicio(s: ServicioPublico) {
    if (!window.confirm(`¿Eliminar el servicio "${s.nombre}" del catálogo?`)) return;
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("editar-catalogo", { servicio_id: s.id, eliminar: true }, token);
      notificar("Servicio eliminado.", "exito");
      const sv = await serviciosPublicos();
      setServicios((sv.data as ServicioPublico[]) ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function invitarProfesional(e: React.FormEvent) {
    e.preventDefault();
    const token = (await getTokenSesion()) ?? undefined;
    try {
      const res = await llamarEdge<{ mensaje: string }>("invitar-profesional", invitar, token);
      setInvitar({ nombre: "", email: "" });
      notificar(res.mensaje, "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function guardarPerfil(e: React.FormEvent) {
    e.preventDefault();
    if (perfil.nombre.trim().length < 2) {
      notificar("El nombre es obligatorio.", "error");
      return;
    }
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "actualizar-perfil",
        { nombre: perfil.nombre, telefono: perfil.telefono || null, foto_url: perfil.foto_url || null },
        token
      );
      notificar("Perfil actualizado.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  function actualizarRango(idx: number, campo: keyof RangoSemanal, valor: string | number) {
    setDisponibilidad((prev) =>
      prev.map((d, i) =>
        i === idx && campo === "dia_semana" ? { ...d, dia_semana: Number(valor) } : i === idx ? { ...d, [campo]: valor } : d
      )
    );
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white animate-fade-up">Configuración</h1>

      <ChatIA onAccion={cargarTodo} storageKey="configuracion" clase="animate-fade-up" />

      <Tarjeta className="p-5 animate-fade-up">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">👤</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Mi perfil</h2>
        </div>
        <form onSubmit={guardarPerfil} className="grid gap-3 sm:grid-cols-2">
          <Campo
            label="Nombre"
            value={perfil.nombre}
            onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <Campo
            label="Teléfono"
            value={perfil.telefono}
            onChange={(e) => setPerfil({ ...perfil, telefono: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <Campo
            label="Foto (URL)"
            placeholder="https://…"
            value={perfil.foto_url}
            onChange={(e) => setPerfil({ ...perfil, foto_url: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100 sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Boton type="submit" variante="primario">
              Guardar perfil
            </Boton>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta className="p-5 animate-fade-up">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">🏪</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
            Negocio
          </h2>
        </div>
        {config && (
          <form onSubmit={actualizarConfig} className="grid gap-3 sm:grid-cols-2">
            <Campo
              label="Nombre del negocio"
              value={config.nombre_negocio}
              onChange={(e) => setConfig({ ...config, nombre_negocio: e.target.value })}
              className="border-white/10 bg-white/[0.06] text-zinc-100"
            />
            <Campo
              label="Dirección"
              value={config.direccion ?? ""}
              onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
              className="border-white/10 bg-white/[0.06] text-zinc-100"
            />
            <Campo
              label="Margen de anticipación (horas)"
              type="number"
              value={config.margen_anticipacion_horas}
              onChange={(e) => setConfig({ ...config, margen_anticipacion_horas: Number(e.target.value) })}
              className="border-white/10 bg-white/[0.06] text-zinc-100"
            />
            <Campo
              label="Límite para cancelar (horas)"
              type="number"
              value={config.horas_limite_cancelacion}
              onChange={(e) => setConfig({ ...config, horas_limite_cancelacion: Number(e.target.value) })}
              className="border-white/10 bg-white/[0.06] text-zinc-100"
            />
            <div className="sm:col-span-2">
              <Boton type="submit" variante="primario">
                Guardar configuración
              </Boton>
            </div>
          </form>
        )}
      </Tarjeta>

      <Tarjeta className="p-5 animate-fade-up [animation-delay:80ms]">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">🧰</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
            Servicios que ofrezco
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {servicios.map((s) => {
            const activo = misServicios.includes(s.id);
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => toggleServicio(s.id)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    activo
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-white/10 bg-white/[0.06] text-zinc-300 hover:border-violet-400"
                  }`}
                >
                  {s.nombre}
                </button>
                <button
                  onClick={() => eliminarServicio(s)}
                  title="Eliminar servicio del catálogo"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/30 bg-white/[0.04] text-sm text-rose-300 transition hover:bg-rose-500/10"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </Tarjeta>

      <Tarjeta className="p-5 animate-fade-up [animation-delay:160ms]">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">🗓</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
            Mi disponibilidad semanal
          </h2>
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

      <Tarjeta className="p-5 animate-fade-up [animation-delay:240ms]">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">➕</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
            Nuevo servicio
          </h2>
        </div>
        <form onSubmit={crearServicio} className="grid gap-3 sm:grid-cols-4">
          <Campo
            label="Nombre"
            value={nuevoServicio.nombre}
            onChange={(e) => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <Campo
            label="Precio ($)"
            type="number"
            value={nuevoServicio.precio}
            onChange={(e) => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <Campo
            label="Duración (min)"
            type="number"
            value={nuevoServicio.duracion}
            onChange={(e) => setNuevoServicio({ ...nuevoServicio, duracion: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <div className="flex items-end">
            <Boton type="submit" variante="primario" className="w-full">
              Crear
            </Boton>
          </div>
        </form>
      </Tarjeta>

      {rol === "admin" && (
        <Tarjeta className="p-5 animate-fade-up [animation-delay:320ms]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">👤</span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
              Invitar profesional
            </h2>
          </div>
          <form onSubmit={invitarProfesional} className="grid gap-3 sm:grid-cols-3">
            <Campo
              label="Nombre"
              value={invitar.nombre}
              onChange={(e) => setInvitar({ ...invitar, nombre: e.target.value })}
              className="border-white/10 bg-white/[0.06] text-zinc-100"
            />
            <Campo
              label="Email"
              type="email"
              value={invitar.email}
              onChange={(e) => setInvitar({ ...invitar, email: e.target.value })}
              className="border-white/10 bg-white/[0.06] text-zinc-100"
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