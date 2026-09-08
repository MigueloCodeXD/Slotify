"use client";

import { useCallback, useEffect, useState } from "react";
import { Boton, Campo, ModalConfirmar, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion, getRolProfesional } from "@/lib/sesion";
import { configPublica, serviciosPublicos } from "@/lib/supabaseClient";
import { ZONAS, actualizarTZ } from "@/lib/zonaHoraria";
import { useToast } from "@/components/Toast";
import { aplicarTema, PALETA_PREDEFINIDA } from "@/lib/theme";
import { ImageUploader } from "@/components/ImageUploader";
import { ChatFlotante } from "@/components/ChatFlotante";
import type { Config, ServicioPublico } from "@/types";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function fmtHoraCorta(h: string): string {
  if (!h) return "";
  const [hh, mm] = h.split(":").map(Number);
  const periodo = hh >= 12 ? "p. m." : "a. m.";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${periodo}`;
}

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

export function Configuracion() {
  const [config, setConfig] = useState<Config | null>(null);
  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [misServicios, setMisServicios] = useState<string[]>([]);
  const [cargos, setCargos] = useState<{ id: string; nombre: string; en_uso?: boolean }[]>([]);
  const [nuevoCargo, setNuevoCargo] = useState("");
  const [renombrandoCargo, setRenombrandoCargo] = useState<{ id: string; nombre: string } | null>(null);
  const [eliminandoCargo, setEliminandoCargo] = useState<{ id: string; nombre: string } | null>(null);
  const [eliminandoCategoria, setEliminandoCategoria] = useState<{ id: string; nombre: string } | null>(null);
  const [eliminandoServicio, setEliminandoServicio] = useState<ServicioPublico | null>(null);
  const [nuevaCategoriaModal, setNuevaCategoriaModal] = useState<"servicio" | "editar" | null>(null);
  const [renombrandoCategoria, setRenombrandoCategoria] = useState<{ id: string; nombre: string } | null>(null);
  const [disponibilidad, setDisponibilidad] = useState<DiaDisponibilidad[]>(() =>
    DIAS.map((_, i) => ({ dia_semana: i, ...DIA_VACIO }))
  );
  const [rol, setRol] = useState<"admin" | "profesional" | null>(null);

  const [invitar, setInvitar] = useState({ nombre: "", email: "", cargo: "" });
  const [nuevoServicio, setNuevoServicio] = useState({
    nombre: "",
    precio: "",
    duracion: "",
    descripcion: "",
    buffer: "",
    categoria: "",
    imagen_url: "",
    cargo_requerido: "",
  });
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
    imagen_url: "",
    cargo_requerido: "",
  });
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<{ nombre: string; email: string; telefono: string; cedula: string; cargo: string; rol: string; foto_url: string }>({
    nombre: "",
    email: "",
    telefono: "",
    cedula: "",
    cargo: "",
    rol: "",
    foto_url: "",
  });

  const [enviando, setEnviando] = useState(false);

  const { notificar } = useToast();

  const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const telefonoValido = (t: string) => /^[+\d][\d\s()-]{6,}$/.test(t);
  const nombreServicioExiste = (nombre: string, ignoreId?: string) =>
    servicios.some(
      (s) => s.id !== ignoreId && s.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()
    );

  const cargarTodo = useCallback(async () => {
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const [c, s, rango, cargosRes, mis, r, perfilRes, cats] = await Promise.all([
        configPublica(),
        serviciosPublicos(),
        llamarEdge<{ dias: DiaDisponibilidad[] }>("configuracion-profesional", { accion: "listar_disponibilidad" }, token),
        llamarEdge<{ cargos: { id: string; nombre: string; en_uso?: boolean }[] }>("gestionar-cargos", { accion: "listar" }, token),
        llamarEdge<{ servicio_ids: string[] }>("configuracion-profesional", { accion: "listar_mis_servicios" }, token),
        getRolProfesional(),
        llamarEdge<{ profesional: { nombre: string; email: string; telefono: string | null; cedula: string | null; cargo: string | null; rol: string; foto_url: string | null } }>("mi-perfil", {}, token),
        llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token),
      ]);
      setConfig(c.data as Config | null);
      actualizarTZ((c.data as Config | null)?.zona_horaria);
      if ((c.data as Config | null)?.color_principal) {
        aplicarTema((c.data as Config | null)!.color_principal!);
      }
      setServicios((s.data as ServicioPublico[]) ?? []);
      setCargos(cargosRes.cargos ?? []);
      setMisServicios(mis.servicio_ids ?? []);
      setRol(r);
      setCategorias(cats.categorias ?? []);

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

      setPerfil({
        nombre: perfilRes.profesional?.nombre ?? "",
        email: perfilRes.profesional?.email ?? "",
        telefono: perfilRes.profesional?.telefono ?? "",
        cedula: perfilRes.profesional?.cedula ?? "",
        cargo: perfilRes.profesional?.cargo ?? "",
        rol: perfilRes.profesional?.rol ?? "",
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
    if (enviando) return;
    const aMin = (h: string) => {
      const [hh, mm] = h.split(":").map(Number);
      return hh * 60 + mm;
    };
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
        if (pi && pf) {
          if (pf <= pi) {
            notificar(`En ${DIAS[d.dia_semana]} la pausa debe terminar después de empezar.`, "error");
            return null;
          }
          if (pi <= ini || pf >= fin) {
            notificar(`En ${DIAS[d.dia_semana]} la pausa debe estar dentro del horario laboral.`, "error");
            return null;
          }
        } else if (pi || pf) {
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

    // No cruces entre días activos consecutivos (defensivo).
    for (const d of dias ?? []) {
      if (!d) continue;
      const propio = (dias ?? []).filter((x) => x && x.dia_semana === d!.dia_semana);
      if (propio.length > 1) {
        let anterior = -1;
        let cruce = false;
        const lista = propio.sort((a, b) => aMin(a!.hora_inicio) - aMin(b!.hora_inicio));
        for (const p of lista) {
          if (p!.hora_inicio && aMin(p!.hora_inicio) < anterior) cruce = true;
          anterior = aMin(p!.hora_fin);
        }
        if (cruce) return notificar("Hay horarios que se cruzan el mismo día.", "error");
      }
    }

    setEnviando(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "configuracion-profesional",
        { accion: "guardar_disponibilidad", dias: dias.filter(Boolean) },
        token
      );
      notificar("Disponibilidad guardada.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  function alternarDia(idx: number) {
    setDisponibilidad((prev) => prev.map((d, i) => (i === idx ? { ...d, activo: !d.activo } : d)));
  }

  function cambiarDia(idx: number, campo: keyof DiaDisponibilidad, valor: string | boolean) {
    setDisponibilidad((prev) => prev.map((d, i) => (i === idx ? { ...d, [campo]: valor } : d)));
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
    if (enviando) return;
    setEnviando(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "actualizar-config",
        {
          nombre_negocio: config.nombre_negocio,
          direccion: config.direccion ?? "",
          descripcion: config.descripcion ?? "",
          zona_horaria: config.zona_horaria ?? "",
          margen_anticipacion_horas: Number(config.margen_anticipacion_horas),
          horas_limite_cancelacion: Number(config.horas_limite_cancelacion),
          logo_url: config.logo_url ?? null,
          color_principal: config.color_principal ?? null,
        },
        token
      );
      if (config.color_principal) aplicarTema(config.color_principal);
      notificar("Configuración guardada.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  async function crearServicio(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (nuevoServicio.nombre.trim().length < 2) {
      notificar("El nombre es obligatorio.", "error");
      return;
    }
    if (nombreServicioExiste(nuevoServicio.nombre)) {
      notificar(`Ya existe un servicio llamado "${nuevoServicio.nombre.trim()}".`, "error");
      return;
    }
    if (!nuevoServicio.precio || Number(nuevoServicio.precio) <= 0 || !nuevoServicio.duracion || Number(nuevoServicio.duracion) <= 0) {
      notificar("Indica un precio y una duración válidos.", "error");
      return;
    }
    setEnviando(true);
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
          imagen_url: nuevoServicio.imagen_url || null,
          cargo_requerido: nuevoServicio.cargo_requerido || null,
        },
        token
      );
      setNuevoServicio({ nombre: "", precio: "", duracion: "", descripcion: "", buffer: "", categoria: "", imagen_url: "", cargo_requerido: "" });
      notificar("Servicio creado.", "exito");
      await refrescarServicios();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
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
    if (enviando) return;
    if (categorias.some((c) => c.nombre.toLowerCase() === nuevaCategoria.trim().toLowerCase())) {
      notificar("Esa categoría ya existe.", "error");
      return;
    }
    setEnviando(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-categorias", { accion: "crear", nombre: nuevaCategoria.trim() }, token);
      setNuevaCategoria("");
      notificar("Categoría creada.", "exito");
      const cats = await llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token);
      setCategorias(cats.categorias ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  function renombrarCategoria(c: { id: string; nombre: string }) {
    setRenombrandoCategoria(c);
  }

  async function confirmarRenombrarCategoria(nombre: string) {
    const c = renombrandoCategoria;
    if (!c) return;
    if (enviando) return;
    if (categorias.some((x) => x.id !== c.id && x.nombre.toLowerCase() === nombre.toLowerCase())) {
      notificar("Ya existe una categoría con ese nombre.", "error");
      return;
    }
    setEnviando(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-categorias", { accion: "renombrar", id: c.id, nombre }, token);
      notificar("Categoría renombrada.", "exito");
      setRenombrandoCategoria(null);
      const cats = await llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token);
      setCategorias(cats.categorias ?? []);
      await refrescarServicios();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  function eliminarCategoria(c: { id: string; nombre: string; en_uso?: boolean }) {
    if (c.en_uso) {
      notificar("No se puede eliminar: hay servicios con esta categoría.", "error");
      return;
    }
    setEliminandoCategoria({ id: c.id, nombre: c.nombre });
  }

  async function confirmarEliminarCategoria() {
    const c = eliminandoCategoria;
    if (!c) return;
    if (enviando) return;
    setEnviando(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-categorias", { accion: "eliminar", id: c.id }, token);
      notificar("Categoría eliminada.", "exito");
      setEliminandoCategoria(null);
      const cats = await llamarEdge<{ categorias: { id: string; nombre: string }[] }>("gestionar-categorias", { accion: "listar" }, token);
      setCategorias(cats.categorias ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  async function refrescarCargos() {
    const token = (await getTokenSesion()) ?? undefined;
    const res = await llamarEdge<{ cargos: { id: string; nombre: string; en_uso?: boolean }[] }>("gestionar-cargos", { accion: "listar" }, token);
    setCargos(res.cargos ?? []);
  }

  async function guardarCargo(e: React.FormEvent) {
    e.preventDefault();
    if (nuevoCargo.trim().length < 1) return;
    if (enviando) return;
    if (cargos.some((c) => c.nombre.toLowerCase() === nuevoCargo.trim().toLowerCase())) {
      notificar("Ese cargo ya existe.", "error");
      return;
    }
    setEnviando(true);
    try {
      await llamarEdge("gestionar-cargos", { accion: "crear", nombre: nuevoCargo.trim() }, (await getTokenSesion()) ?? undefined);
      setNuevoCargo("");
      notificar("Cargo creado.", "exito");
      await refrescarCargos();
    } catch (err) {
      notificar((err as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  function renombrarCargo(c: { id: string; nombre: string }) {
    setRenombrandoCargo(c);
  }

  async function confirmarRenombrarCargo(nombre: string) {
    const c = renombrandoCargo;
    if (!c) return;
    if (enviando) return;
    if (cargos.some((x) => x.id !== c.id && x.nombre.toLowerCase() === nombre.toLowerCase())) {
      notificar("Ya existe un cargo con ese nombre.", "error");
      return;
    }
    setEnviando(true);
    try {
      await llamarEdge("gestionar-cargos", { accion: "renombrar", id: c.id, nombre }, (await getTokenSesion()) ?? undefined);
      notificar("Cargo renombrado.", "exito");
      setRenombrandoCargo(null);
      await refrescarCargos();
      await refrescarServicios();
      if (perfil.cargo === c.nombre) setPerfil((p) => ({ ...p, cargo: nombre }));
    } catch (err) {
      notificar((err as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  function eliminarCargo(c: { id: string; nombre: string; en_uso?: boolean }) {
    if (c.en_uso) {
      notificar("No se puede eliminar: hay profesionales o servicios con este cargo.", "error");
      return;
    }
    setEliminandoCargo({ id: c.id, nombre: c.nombre });
  }

  async function confirmarEliminarCargo() {
    const c = eliminandoCargo;
    if (!c) return;
    if (enviando) return;
    setEnviando(true);
    try {
      await llamarEdge("gestionar-cargos", { accion: "eliminar", id: c.id }, (await getTokenSesion()) ?? undefined);
      notificar("Cargo eliminado.", "exito");
      setEliminandoCargo(null);
      await refrescarCargos();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
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
      imagen_url: s.imagen_url ?? "",
      cargo_requerido: s.cargo_requerido ?? "",
    });
  }

  async function guardarEdicionServicio(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoServicio) return;
    if (enviando) return;
    if (formServicio.nombre.trim().length < 2) {
      notificar("El nombre es obligatorio.", "error");
      return;
    }
    if (nombreServicioExiste(formServicio.nombre, editandoServicio.id)) {
      notificar(`Ya existe un servicio llamado "${formServicio.nombre.trim()}".`, "error");
      return;
    }
    setEnviando(true);
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
          imagen_url: formServicio.imagen_url || null,
          cargo_requerido: formServicio.cargo_requerido || null,
        },
        token
      );
      notificar("Servicio actualizado.", "exito");
      setEditandoServicio(null);
      await refrescarServicios();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  function eliminarServicio(s: ServicioPublico) {
    setEliminandoServicio(s);
  }

  async function confirmarEliminarServicio() {
    const s = eliminandoServicio;
    if (!s) return;
    if (enviando) return;
    setEnviando(true);
    try {
      const token = (await getTokenSesion()) ?? undefined;
      await llamarEdge("editar-catalogo", { servicio_id: s.id, eliminar: true }, token);
      notificar("Servicio eliminado.", "exito");
      setEliminandoServicio(null);
      await refrescarServicios();
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  async function invitarProfesional(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (invitar.nombre.trim().length < 2) {
      notificar("El nombre del profesional es obligatorio.", "error");
      return;
    }
    if (!emailValido(invitar.email.trim())) {
      notificar("Ingresa un email válido.", "error");
      return;
    }
    setEnviando(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      const res = await llamarEdge<{ mensaje: string }>("invitar-profesional", { ...invitar, cargo: invitar.cargo || null }, token);
      setInvitar({ nombre: "", email: "", cargo: "" });
      notificar(res.mensaje, "exito");
    } catch (err) {
      notificar((err as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  async function guardarPerfil(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (perfil.nombre.trim().length < 2) {
      notificar("El nombre es obligatorio.", "error");
      return;
    }
    if (perfil.telefono.trim() && !telefonoValido(perfil.telefono.trim())) {
      notificar("Ingresa un teléfono válido (solo números, +, espacios, guiones).", "error");
      return;
    }
    setEnviando(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "actualizar-perfil",
        {
          nombre: perfil.nombre,
          telefono: perfil.telefono || null,
          cedula: perfil.cedula || null,
          cargo: perfil.cargo || null,
          foto_url: perfil.foto_url || null,
        },
        token
      );
      notificar("Perfil actualizado.", "exito");
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const serviciosVisibles =
    rol === "admin" ? servicios : servicios.filter((s) => !s.cargo_requerido || s.cargo_requerido === perfil.cargo);

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-zinc-900 animate-fade-up">Configuración</h1>

      <ChatFlotante storageKey="configuracion" onAccion={cargarTodo} />

      <Tarjeta className="p-5 animate-fade-up">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">👤</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">Mi perfil</h2>
        </div>
        <div className="mb-3">
          <ImageUploader
            bucket="fotos-profesionales"
            carpeta="perfil"
            actual={perfil.foto_url}
            onCambio={(url) => setPerfil((p) => ({ ...p, foto_url: url ?? "" }))}
            texto="Subir foto"
            circular
          />
        </div>
        <form onSubmit={guardarPerfil} className="grid gap-3 sm:grid-cols-2">
          <Campo
            label="Nombre"
            value={perfil.nombre}
            onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })}
          />
          <Campo
            label="Correo"
            value={perfil.email}
            readOnly
            className="text-zinc-400"
          />
          <Campo
            label="Teléfono"
            value={perfil.telefono}
            onChange={(e) => setPerfil({ ...perfil, telefono: e.target.value })}
          />
          <Campo
            label="Cédula"
            value={perfil.cedula}
            onChange={(e) => setPerfil({ ...perfil, cedula: e.target.value })}
          />
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Rol</span>
            <input
              value={perfil.rol}
              readOnly
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-400"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-zinc-500">Cargo</span>
            <select
              value={perfil.cargo}
              onChange={(e) => setPerfil({ ...perfil, cargo: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
            >
              <option value="">Sin cargo</option>
              {cargos.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-zinc-400">
              Solo podrás ofrecer servicios cuyo cargo requerido coincida con el tuyo.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Boton type="submit" variante="primario" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar perfil"}
            </Boton>
          </div>
        </form>
      </Tarjeta>

      {rol === "admin" && (
        <Tarjeta className="p-5 animate-fade-up">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">🏪</span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
              Negocio
            </h2>
          </div>
          {config && (
            <form onSubmit={actualizarConfig} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-zinc-500">Logo del negocio</span>
                <ImageUploader
                  bucket="logos-negocio"
                  carpeta="negocio"
                  actual={config.logo_url}
                  onCambio={(url) => setConfig({ ...config, logo_url: url })}
                  texto="Subir logo"
                />
              </div>
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-zinc-500">Color de la web</span>
                <div className="flex flex-wrap items-center gap-2">
                  {PALETA_PREDEFINIDA.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      title={p.nombre}
                      onClick={() => {
                        setConfig({ ...config, color_principal: p.hex });
                        aplicarTema(p.hex);
                      }}
                      className={`h-9 w-9 rounded-full border-2 transition hover:scale-110 ${
                        config.color_principal?.toLowerCase() === p.hex ? "border-zinc-800" : "border-white shadow-sm"
                      }`}
                      style={{ backgroundColor: p.hex }}
                    />
                  ))}
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 transition hover:border-[var(--primary-400)]"
                    title="Color personalizado"
                  >
                    <input
                      type="color"
                      value={config.color_principal ?? "#7C3AED"}
                      onChange={(e) => {
                        setConfig({ ...config, color_principal: e.target.value });
                        aplicarTema(e.target.value);
                      }}
                      className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                    Personalizado
                  </label>
                </div>
              </div>
              <Campo
                label="Nombre del negocio"
                value={config.nombre_negocio}
                onChange={(e) => setConfig({ ...config, nombre_negocio: e.target.value })}
              />
              <Campo
                label="Dirección"
                value={config.direccion ?? ""}
                onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
              />
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-400">Zona horaria</span>
                <select
                  value={config.zona_horaria ?? ""}
                  onChange={(e) => setConfig({ ...config, zona_horaria: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
                >
                  <option value="">Usar predeterminada</option>
                  {ZONAS.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </div>
              <Campo
                label="Margen de anticipación (horas)"
                type="number"
                value={config.margen_anticipacion_horas}
                onChange={(e) => setConfig({ ...config, margen_anticipacion_horas: Number(e.target.value) })}
              />
              <Campo
                label="Límite para cancelar (horas)"
                type="number"
                value={config.horas_limite_cancelacion}
                onChange={(e) => setConfig({ ...config, horas_limite_cancelacion: Number(e.target.value) })}
              />
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-zinc-400">Descripción del negocio</span>
                <textarea
                  value={config.descripcion ?? ""}
                  onChange={(e) => setConfig({ ...config, descripcion: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
                  placeholder="Describe tu negocio..."
                />
              </div>
              <div className="sm:col-span-2">
                <Boton type="submit" variante="primario" disabled={enviando}>
                  {enviando ? "Guardando…" : "Guardar negocio"}
                </Boton>
              </div>
            </form>
          )}
        </Tarjeta>
      )}

      <Tarjeta className="p-5 animate-fade-up [animation-delay:80ms]">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">🧰</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
            Servicios que ofrezco
          </h2>
          {rol !== "admin" && perfil.cargo && (
            <span className="rounded-full bg-[var(--primary-50)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary-700)]">
              Cargo: {perfil.cargo}
            </span>
          )}
        </div>
        {serviciosVisibles.length === 0 && (
          <p className="text-sm text-zinc-500">
            {rol === "admin"
              ? "Aún no hay servicios en el catálogo."
              : "No hay servicios compatibles con tu cargo aún."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {serviciosVisibles.map((s) => {
            const activo = misServicios.includes(s.id);
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => toggleServicio(s.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    activo
                      ? "border-[var(--primary-600)] bg-[var(--primary-600)] text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-[var(--primary-400)]"
                  }`}
                >
                  {s.nombre}
                </button>
                {rol === "admin" && (
                  <button
                    onClick={() => abrirEditarServicio(s)}
                    title="Editar servicio"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm text-zinc-500 transition hover:border-[var(--primary-400)]"
                  >
                    ✏️
                  </button>
                )}
                {rol === "admin" && (
                  <button
                    onClick={() => eliminarServicio(s)}
                    title="Eliminar servicio del catálogo"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-500 transition hover:bg-rose-100"
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
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">🗓</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
            Mi disponibilidad semanal
          </h2>
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
                  <span
                    className={`h-2 w-2 rounded-full ${d.activo ? "bg-white" : "bg-zinc-400"}`}
                  />
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
              {d.activo && d.pausa_inicio && d.pausa_fin && (
                <p className="mt-2 text-[11px] text-zinc-400">
                  Se agendará {fmtHoraCorta(d.hora_inicio)}–{fmtHoraCorta(d.pausa_inicio)} y{" "}
                  {fmtHoraCorta(d.pausa_fin)}–{fmtHoraCorta(d.hora_fin)}.
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Boton variante="primario" onClick={guardarDisponibilidad} disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar disponibilidad"}
          </Boton>
        </div>
      </Tarjeta>

      {rol === "admin" && (
        <Tarjeta className="p-5 animate-fade-up [animation-delay:240ms]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">➕</span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
              Nuevo servicio
            </h2>
          </div>
          <form onSubmit={crearServicio} className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-4">
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Imagen del servicio</span>
              <ImageUploader
                bucket="imagenes-servicios"
                carpeta="servicios"
                actual={nuevoServicio.imagen_url}
                onCambio={(url) => setNuevoServicio({ ...nuevoServicio, imagen_url: url ?? "" })}
                texto="Subir imagen"
              />
            </div>
            <Campo
              label="Nombre"
              value={nuevoServicio.nombre}
              onChange={(e) => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
              className="sm:col-span-2"
            />
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-zinc-500">Cargo requerido</span>
              <select
                value={nuevoServicio.cargo_requerido}
                onChange={(e) => setNuevoServicio({ ...nuevoServicio, cargo_requerido: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
              >
                <option value="">Cualquier profesional</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-zinc-400">
                Solo los profesionales con este cargo podrán ofrecerlo.
              </p>
            </div>
            <Campo
              label="Precio ($)"
              type="number"
              value={nuevoServicio.precio}
              onChange={(e) => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
            />
            <Campo
              label="Duración (min)"
              type="number"
              value={nuevoServicio.duracion}
              onChange={(e) => setNuevoServicio({ ...nuevoServicio, duracion: e.target.value })}
            />
            <Campo
              label="Buffer (min)"
              type="number"
              value={nuevoServicio.buffer}
              onChange={(e) => setNuevoServicio({ ...nuevoServicio, buffer: e.target.value })}
            />
            <div className="sm:col-span-4">
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Categoría</span>
              <div className="flex gap-2">
                <select
                  value={nuevoServicio.categoria}
                  onChange={(e) => {
                    if (e.target.value === "__nueva__") {
                      setNuevaCategoriaModal("servicio");
                      return;
                    }
                    setNuevoServicio({ ...nuevoServicio, categoria: e.target.value });
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
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
                className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
                placeholder="Descripción del servicio (opcional)..."
              />
            </div>
            <div className="sm:col-span-4">
              <Boton type="submit" variante="primario" className="w-full" disabled={enviando}>
                {enviando ? "Creando…" : "Crear"}
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}

      {rol === "admin" && (
        <>
        <Tarjeta className="p-5 animate-fade-up [animation-delay:300ms]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">🏷</span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
              Categorías
            </h2>
          </div>
          <form onSubmit={guardarCategoria} className="flex gap-2">
            <input
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              placeholder="Nueva categoría"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
            />
            <div className="flex items-end">
              <Boton type="submit" variante="primario" disabled={enviando}>
                {enviando ? "Añadiendo…" : "Añadir"}
              </Boton>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {categorias.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600"
              >
                {c.nombre}
                <button
                  onClick={() => renombrarCategoria(c)}
                  title="Renombrar"
                  className="text-zinc-400 transition hover:text-[var(--primary-600)]"
                >
                  ✏️
                </button>
                <button
                  onClick={() => eliminarCategoria(c)}
                  title={c.en_uso ? "En uso" : "Eliminar"}
                  className="text-zinc-400 transition hover:text-rose-500"
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
        <Tarjeta className="p-5 animate-fade-up [animation-delay:310ms]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">💼</span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
              Cargos
            </h2>
          </div>
          <form onSubmit={guardarCargo} className="flex gap-2">
            <input
              value={nuevoCargo}
              onChange={(e) => setNuevoCargo(e.target.value)}
              placeholder="Nuevo cargo (ej. Barbero)"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
            />
            <div className="flex items-end">
              <Boton type="submit" variante="primario" disabled={enviando}>
                {enviando ? "Añadiendo…" : "Añadir"}
              </Boton>
            </div>
          </form>
          {cargos.length > 0 && (
            <p className="mt-3 text-[11px] text-zinc-400">
              Los cargos determinan qué profesionales pueden ofrecer un servicio.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {cargos.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600"
              >
                {c.nombre}
                <button
                  onClick={() => renombrarCargo(c)}
                  title="Renombrar"
                  className="text-zinc-400 transition hover:text-[var(--primary-600)]"
                >
                  ✏️
                </button>
                <button
                  onClick={() => eliminarCargo(c)}
                  title={c.en_uso ? "En uso" : "Eliminar"}
                  className="text-zinc-400 transition hover:text-rose-500"
                >
                  ✕
                </button>
              </span>
            ))}
            {cargos.length === 0 && (
              <p className="text-sm text-zinc-500">Aún no hay cargos.</p>
            )}
          </div>
        </Tarjeta>
        </>
      )}

      {rol === "admin" && (
        <Tarjeta className="p-5 animate-fade-up [animation-delay:320ms]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">👤</span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">
              Invitar profesional
            </h2>
          </div>
          <form onSubmit={invitarProfesional} className="grid gap-3 sm:grid-cols-3">
            <Campo
              label="Nombre"
              value={invitar.nombre}
              onChange={(e) => setInvitar({ ...invitar, nombre: e.target.value })}
            />
            <Campo
              label="Email"
              type="email"
              value={invitar.email}
              onChange={(e) => setInvitar({ ...invitar, email: e.target.value })}
            />
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-500">Cargo</span>
              <select
                value={invitar.cargo}
                onChange={(e) => setInvitar({ ...invitar, cargo: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
              >
                <option value="">Sin cargo</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Boton type="submit" variante="primario" className="w-full" disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar invitación"}
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}

      {editandoServicio && (
        <ModalServicio onCerrar={() => setEditandoServicio(null)}>
          <h3 className="font-display text-lg font-semibold text-zinc-900">Editar servicio</h3>
          <form onSubmit={guardarEdicionServicio} className="mt-4 grid gap-3">
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-500">Imagen del servicio</span>
              <ImageUploader
                bucket="imagenes-servicios"
                carpeta="servicios"
                actual={formServicio.imagen_url}
                onCambio={(url) => setFormServicio({ ...formServicio, imagen_url: url ?? "" })}
                texto="Subir imagen"
              />
            </div>
            <Campo
              label="Nombre"
              value={formServicio.nombre}
              onChange={(e) => setFormServicio({ ...formServicio, nombre: e.target.value })}
            />
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-500">Cargo requerido</span>
              <select
                value={formServicio.cargo_requerido}
                onChange={(e) => setFormServicio({ ...formServicio, cargo_requerido: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
              >
                <option value="">Cualquier profesional</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo
                label="Precio ($)"
                type="number"
                value={formServicio.precio}
                onChange={(e) => setFormServicio({ ...formServicio, precio: e.target.value })}
              />
              <Campo
                label="Duración (min)"
                type="number"
                value={formServicio.duracion}
                onChange={(e) => setFormServicio({ ...formServicio, duracion: e.target.value })}
              />
              <Campo
                label="Buffer (min)"
                type="number"
                value={formServicio.buffer}
                onChange={(e) => setFormServicio({ ...formServicio, buffer: e.target.value })}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Categoría</span>
              <select
                value={formServicio.categoria}
                onChange={(e) => {
                  if (e.target.value === "__nueva__") {
                    setNuevaCategoriaModal("editar");
                    return;
                  }
                  setFormServicio({ ...formServicio, categoria: e.target.value });
                }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
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
                className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={formServicio.activo}
                onChange={(e) => setFormServicio({ ...formServicio, activo: e.target.checked })}
                className="h-4 w-4 accent-[var(--primary-600)]"
              />
              Activo (aparece en la página pública)
            </label>
            <div className="mt-2 flex gap-2">
              <Boton type="submit" variante="primario" className="flex-1" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar"}
              </Boton>
              <Boton variante="claro" onClick={() => setEditandoServicio(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </ModalServicio>
      )}

      {renombrandoCargo && (
        <ModalRenombrar
          titulo="Renombrar cargo"
          valorInicial={renombrandoCargo.nombre}
          onCerrar={() => setRenombrandoCargo(null)}
          onConfirmar={confirmarRenombrarCargo}
        />
      )}

      {renombrandoCategoria && (
        <ModalRenombrar
          titulo="Renombrar categoría"
          valorInicial={renombrandoCategoria.nombre}
          onCerrar={() => setRenombrandoCategoria(null)}
          onConfirmar={confirmarRenombrarCategoria}
        />
      )}

      {eliminandoCargo && (
        <ModalConfirmar
          titulo="Eliminar cargo"
          mensaje={`¿Seguro que quieres eliminar el cargo "${eliminandoCargo.nombre}"? Esta acción no se puede deshacer.`}
          etiqueta="Eliminar cargo"
          guardando={enviando}
          onCerrar={() => {
            if (!enviando) setEliminandoCargo(null);
          }}
          onConfirmar={confirmarEliminarCargo}
        />
      )}

      {eliminandoCategoria && (
        <ModalConfirmar
          titulo="Eliminar categoría"
          mensaje={`¿Seguro que quieres eliminar la categoría "${eliminandoCategoria.nombre}"? Esta acción no se puede deshacer.`}
          etiqueta="Eliminar categoría"
          guardando={enviando}
          onCerrar={() => {
            if (!enviando) setEliminandoCategoria(null);
          }}
          onConfirmar={confirmarEliminarCategoria}
        />
      )}

      {eliminandoServicio && (
        <ModalConfirmar
          titulo="Eliminar servicio"
          mensaje={`¿Seguro que quieres eliminar "${eliminandoServicio.nombre}" del catálogo? Esta acción no se puede deshacer.`}
          etiqueta="Eliminar servicio"
          guardando={enviando}
          onCerrar={() => {
            if (!enviando) setEliminandoServicio(null);
          }}
          onConfirmar={confirmarEliminarServicio}
        />
      )}

      {nuevaCategoriaModal && (
        <ModalRenombrar
          titulo="Nueva categoría"
          valorInicial=""
          onCerrar={() => setNuevaCategoriaModal(null)}
          onConfirmar={async (nombre) => {
            const creada = await crearCategoriaDesdeForm(nombre);
            if (!creada) return;
            if (nuevaCategoriaModal === "servicio") {
              setNuevoServicio((p) => ({ ...p, categoria: creada }));
            } else {
              setFormServicio((p) => ({ ...p, categoria: creada }));
            }
            setNuevaCategoriaModal(null);
          }}
        />
      )}
    </div>
  );
}

function ModalServicio({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex min-h-full items-center justify-center py-6">
        <div className="relative w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl animate-scale-in">
          <button
            onClick={onCerrar}
            className="float-right rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalRenombrar({
  titulo,
  valorInicial,
  onCerrar,
  onConfirmar,
}: {
  titulo: string;
  valorInicial: string;
  onCerrar: () => void;
  onConfirmar: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(valorInicial);
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = nombre.trim();
    if (limpio.length < 1) return;
    setGuardando(true);
    try {
      await onConfirmar(limpio);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex min-h-full items-center justify-center py-6">
        <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl animate-scale-in">
          <h3 className="font-display text-lg font-semibold text-zinc-900">{titulo}</h3>
          <form onSubmit={enviar} className="mt-4 space-y-4">
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
            />
            <div className="flex gap-2">
              <Boton type="submit" variante="primario" className="flex-1" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </Boton>
              <Boton variante="claro" onClick={onCerrar}>
                Cancelar
              </Boton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}