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
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: "", precio: "", duracion: "", descripcion: "", buffer: "", categoria: "" });
  const [categorias, setCategorias] = useState<{ id: string; nombre: string; en_uso?: boolean }[]>([]);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [editandoServicio, setEditandoServicio] = useState<ServicioPublico | null>(null);
  const [formServicio, setFormServicio] = useState({
    id: "",
    nombre: "",
    precio: "",
    duracion: "",
    buffer: "",
    descripcion: "",
    categoria: "",
    activo: true,
  });
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<{ nombre: string; email: string; telefono: string; cedula: string; cargo: string; rol: string }>({
    nombre: "",
    email: "",
    telefono: "",
    cedula: "",
    cargo: "",
    rol: "",
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
      const [mis, r, perfilRes, cats] = await Promise.all([
        llamarEdge<{ servicio_ids: string[] }>("configuracion-profesional", { accion: "listar_mis_servicios" }, token),
        getRolProfesional(),
        llamarEdge<{ profesional: { nombre: string; email: string; telefono: string | null; cedula: string | null; cargo: string | null; rol: string } }>("mi-perfil", {}, token),
        llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token),
      ]);
      setMisServicios(mis.servicio_ids ?? []);
      setRol(r);
      setCategorias(cats.categorias ?? []);
      setPerfil({
        nombre: perfilRes.profesional?.nombre ?? "",
        email: perfilRes.profesional?.email ?? "",
        telefono: perfilRes.profesional?.telefono ?? "",
        cedula: perfilRes.profesional?.cedula ?? "",
        cargo: perfilRes.profesional?.cargo ?? "",
        rol: perfilRes.profesional?.rol ?? "",
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
          descripcion: config.descripcion ?? "",
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
    if (nuevoServicio.nombre.trim().length < 2) {
      notificar("El nombre es obligatorio.", "error");
      return;
    }
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "editar-catalogo",
        {
          nombre: nuevoServicio.nombre,
          precio: Number(nuevoServicio.precio),
          duracion_min: Number(nuevoServicio.duracion),
          descripcion: nuevoServicio.descripcion || null,
          buffer_min: nuevoServicio.buffer ? Number(nuevoServicio.buffer) : 0,
          categoria: nuevoServicio.categoria || null,
        },
        token
      );
      setNuevoServicio({ nombre: "", precio: "", duracion: "", descripcion: "", buffer: "", categoria: "" });
      notificar("Servicio creado.", "exito");
      await refrescarServicios();
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function refrescarServicios() {
    const s = await serviciosPublicos();
    setServicios((s.data as ServicioPublico[]) ?? []);
  }

  async function crearCategoriaDesdeForm(valor: string): Promise<string | null> {
    const nombre = valor.trim();
    if (!nombre) return null;
    const existente = categorias.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (existente) return existente.nombre;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-categorias", { accion: "crear", nombre }, token);
      const cats = await llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token);
      setCategorias(cats.categorias ?? []);
      return nombre;
    } catch (e) {
      notificar((e as Error).message, "error");
      return null;
    }
  }

  async function guardarCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (nuevaCategoria.trim().length < 1) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-categorias", { accion: "crear", nombre: nuevaCategoria.trim() }, token);
      setNuevaCategoria("");
      notificar("Categoría creada.", "exito");
      const cats = await llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token);
      setCategorias(cats.categorias ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function renombrarCategoria(id: string, nombre: string) {
    const nuevo = window.prompt("Nuevo nombre de la categoría", nombre);
    if (!nuevo || nuevo.trim() === nombre) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-categorias", { accion: "renombrar", id, nombre: nuevo.trim() }, token);
      notificar("Categoría renombrada.", "exito");
      const cats = await llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token);
      setCategorias(cats.categorias ?? []);
      await refrescarServicios();
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  async function eliminarCategoria(c: { id: string; nombre: string; en_uso?: boolean }) {
    if (c.en_uso) {
      notificar("No se puede eliminar: hay servicios con esta categoría.", "error");
      return;
    }
    if (!window.confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-categorias", { accion: "eliminar", id: c.id }, token);
      notificar("Categoría eliminada.", "exito");
      const cats = await llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token);
      setCategorias(cats.categorias ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    }
  }

  function abrirEditarServicio(s: ServicioPublico) {
    setEditandoServicio(s);
    setFormServicio({
      id: s.id,
      nombre: s.nombre,
      precio: String(s.precio),
      duracion: String(s.duracion_min),
      buffer: String(s.buffer_min ?? 0),
      descripcion: s.descripcion ?? "",
      categoria: s.categoria ?? "",
      activo: s.activo,
    });
  }

  async function guardarEdicionServicio(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoServicio) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "editar-catalogo",
        {
          servicio_id: editandoServicio.id,
          nombre: formServicio.nombre,
          precio: Number(formServicio.precio),
          duracion_min: Number(formServicio.duracion),
          buffer_min: formServicio.buffer ? Number(formServicio.buffer) : 0,
          descripcion: formServicio.descripcion || null,
          categoria: formServicio.categoria || null,
          activo: formServicio.activo,
        },
        token
      );
      notificar("Servicio actualizado.", "exito");
      setEditandoServicio(null);
      await refrescarServicios();
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
      await refrescarServicios();
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
        { nombre: perfil.nombre, telefono: perfil.telefono || null, cedula: perfil.cedula || null, cargo: perfil.cargo || null },
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
            label="Correo"
            value={perfil.email}
            readOnly
            className="border-white/10 bg-white/[0.06] text-zinc-500"
          />
          <Campo
            label="Teléfono"
            value={perfil.telefono}
            onChange={(e) => setPerfil({ ...perfil, telefono: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <Campo
            label="Cédula"
            value={perfil.cedula}
            onChange={(e) => setPerfil({ ...perfil, cedula: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <Campo
            label="Rol"
            value={perfil.rol}
            readOnly
            className="border-white/10 bg-white/[0.06] text-zinc-500"
          />
          <Campo
            label="Cargo"
            value={perfil.cargo}
            onChange={(e) => setPerfil({ ...perfil, cargo: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <div className="sm:col-span-2">
            <Boton type="submit" variante="primario">
              Guardar perfil
            </Boton>
          </div>
        </form>
      </Tarjeta>

      {rol === "admin" && (
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
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Descripción del negocio</span>
              <textarea
                value={config.descripcion ?? ""}
                onChange={(e) => setConfig({ ...config, descripcion: e.target.value })}
                rows={3}
                className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
                placeholder="Describe tu negocio..."
              />
            </div>
            <div className="sm:col-span-2">
              <Boton type="submit" variante="primario">
                Guardar configuración
              </Boton>
            </div>
          </form>
        )}
      </Tarjeta>
      )}

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
                {rol === "admin" && (
                <button
                  onClick={() => abrirEditarServicio(s)}
                  title="Editar servicio"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm text-zinc-300 transition hover:border-violet-400"
                >
                  ✏️
                </button>
                )}
                {rol === "admin" && (
                <button
                  onClick={() => eliminarServicio(s)}
                  title="Eliminar servicio del catálogo"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/30 bg-white/[0.04] text-sm text-rose-300 transition hover:bg-rose-500/10"
                >
                  ✕
                </button>
                )}
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

      {rol === "admin" && (
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
          <Campo
            label="Buffer (min)"
            type="number"
            value={nuevoServicio.buffer}
            onChange={(e) => setNuevoServicio({ ...nuevoServicio, buffer: e.target.value })}
            className="border-white/10 bg-white/[0.06] text-zinc-100"
          />
          <div className="sm:col-span-4">
            <span className="mb-1 block text-xs font-semibold text-zinc-400">Categoría</span>
            <div className="flex gap-2">
              <select
                value={nuevoServicio.categoria}
                onChange={(e) => {
                  if (e.target.value === "__nueva__") {
                    const nombre = window.prompt("Nueva categoría");
                    if (nombre && nombre.trim()) void crearCategoriaDesdeForm(nombre).then((creada) => {
                      if (creada) setNuevoServicio((p) => ({ ...p, categoria: creada }));
                    });
                    else e.target.value = "";
                    return;
                  }
                  setNuevoServicio({ ...nuevoServicio, categoria: e.target.value });
                }}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
                <option value="__nueva__">+ Nueva categoría…</option>
              </select>
            </div>
          </div>
          <div className="sm:col-span-4">
            <span className="mb-1 block text-xs font-semibold text-zinc-400">Descripción</span>
            <textarea
              value={nuevoServicio.descripcion}
              onChange={(e) => setNuevoServicio({ ...nuevoServicio, descripcion: e.target.value })}
              rows={2}
              className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
              placeholder="Descripción del servicio (opcional)..."
            />
          </div>
          <div className="sm:col-span-4">
            <Boton type="submit" variante="primario" className="w-full">
              Crear
            </Boton>
          </div>
        </form>
      </Tarjeta>
      )}

      {rol === "admin" && (
      <Tarjeta className="p-5 animate-fade-up [animation-delay:300ms]">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">🏷</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
            Categorías
          </h2>
        </div>
        <form onSubmit={guardarCategoria} className="flex gap-2">
          <input
            value={nuevaCategoria}
            onChange={(e) => setNuevaCategoria(e.target.value)}
            placeholder="Nueva categoría"
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/25"
          />
          <div className="flex items-end">
            <Boton type="submit" variante="primario">
              Añadir
            </Boton>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {categorias.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm text-zinc-200"
            >
              {c.nombre}
              <button
                onClick={() => renombrarCategoria(c.id, c.nombre)}
                title="Renombrar"
                className="text-zinc-400 transition hover:text-violet-300"
              >
                ✏️
              </button>
              <button
                onClick={() => eliminarCategoria(c)}
                title={c.en_uso ? "En uso" : "Eliminar"}
                className="text-zinc-400 transition hover:text-rose-300"
              >
                ✕
              </button>
            </span>
          ))}
          {categorias.length === 0 && (
            <p className="text-sm text-zinc-500">Aún no hay categorías.</p>
          )}
        </div>
      </Tarjeta>
      )}

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

      {editandoServicio && (
        <ModalServicio onCerrar={() => setEditandoServicio(null)}>
          <h3 className="font-display text-lg font-semibold text-white">Editar servicio</h3>
          <form onSubmit={guardarEdicionServicio} className="mt-4 grid gap-3">
            <Campo
              label="Nombre"
              value={formServicio.nombre}
              onChange={(e) => setFormServicio({ ...formServicio, nombre: e.target.value })}
              className="border-white/10 bg-white/[0.06] text-zinc-100"
            />
            <div className="grid grid-cols-2 gap-3">
              <Campo
                label="Precio ($)"
                type="number"
                value={formServicio.precio}
                onChange={(e) => setFormServicio({ ...formServicio, precio: e.target.value })}
                className="border-white/10 bg-white/[0.06] text-zinc-100"
              />
              <Campo
                label="Duración (min)"
                type="number"
                value={formServicio.duracion}
                onChange={(e) => setFormServicio({ ...formServicio, duracion: e.target.value })}
                className="border-white/10 bg-white/[0.06] text-zinc-100"
              />
              <Campo
                label="Buffer (min)"
                type="number"
                value={formServicio.buffer}
                onChange={(e) => setFormServicio({ ...formServicio, buffer: e.target.value })}
                className="border-white/10 bg-white/[0.06] text-zinc-100"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Categoría</span>
              <select
                value={formServicio.categoria}
                onChange={(e) => {
                  if (e.target.value === "__nueva__") {
                    const nombre = window.prompt("Nueva categoría");
                    if (nombre && nombre.trim()) {
                      void crearCategoriaDesdeForm(nombre).then((creada) => {
                        if (creada) setFormServicio((p) => ({ ...p, categoria: creada }));
                      });
                    }
                    return;
                  }
                  setFormServicio({ ...formServicio, categoria: e.target.value });
                }}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
                <option value="__nueva__">+ Nueva categoría…</option>
              </select>
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Descripción</span>
              <textarea
                value={formServicio.descripcion}
                onChange={(e) => setFormServicio({ ...formServicio, descripcion: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-400"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={formServicio.activo}
                onChange={(e) => setFormServicio({ ...formServicio, activo: e.target.checked })}
                className="h-4 w-4 accent-violet-500"
              />
              Activo (aparece en la página pública)
            </label>
            <div className="mt-2 flex gap-2">
              <Boton type="submit" variante="primario" className="flex-1">
                Guardar
              </Boton>
              <Boton variante="claro" onClick={() => setEditandoServicio(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </ModalServicio>
      )}
    </div>
  );
}

function ModalServicio({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="glass-strong w-full max-w-md rounded-3xl p-5 text-zinc-100 shadow-2xl animate-scale-in">
        <button
          onClick={onCerrar}
          className="float-right rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10"
          aria-label="Cerrar"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}