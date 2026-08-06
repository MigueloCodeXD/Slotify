"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { llamarEdge } from "@/lib/api";
import { getTokenSesion } from "@/lib/sesion";
import { serviciosPublicos } from "@/lib/supabaseClient";
import { useToast } from "@/components/Toast";
import type { ServicioPublico } from "@/types";

interface ProfGestion {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: "admin" | "profesional";
  activo: boolean;
  vinculado: boolean;
  yo: boolean;
  servicios: number;
  invitacion_pendiente: boolean;
}

export function Profesionales() {
  const { notificar } = useToast();
  const [profesionales, setProfesionales] = useState<ProfGestion[]>([]);
  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [invitar, setInvitar] = useState({ nombre: "", email: "" });

  const [editando, setEditando] = useState<ProfGestion | null>(null);
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", rol: "profesional", activo: true });

  const [asignando, setAsignando] = useState<ProfGestion | null>(null);
  const [selServicios, setSelServicios] = useState<Set<string>>(new Set());

  async function cargar() {
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const [res, sv] = await Promise.all([
        llamarEdge<{ profesionales: ProfGestion[] }>("gestionar-profesionales", { accion: "listar" }, token),
        serviciosPublicos(),
      ]);
      setProfesionales(res.profesionales ?? []);
      setServicios((sv.data as ServicioPublico[]) ?? []);
    } catch (e) {
      notificar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invitarProfesional(e: React.FormEvent) {
    e.preventDefault();
    if (invitar.nombre.trim().length < 2 || !invitar.email.includes("@")) {
      notificar("Completa nombre y email.", "error");
      return;
    }
    const token = (await getTokenSesion()) ?? undefined;
    try {
      const res = await llamarEdge<{ mensaje: string }>("invitar-profesional", invitar, token);
      setInvitar({ nombre: "", email: "" });
      notificar(res.mensaje, "exito");
      await cargar();
    } catch (err) {
      notificar((err as Error).message, "error");
    }
  }

  function abrirEditar(p: ProfGestion) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      email: p.email,
      telefono: p.telefono ?? "",
      rol: p.rol,
      activo: p.activo,
    });
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "gestionar-profesionales",
        {
          accion: "editar",
          id: editando.id,
          nombre: form.nombre,
          email: form.email,
          telefono: form.telefono || null,
          rol: form.rol,
          activo: form.activo,
        },
        token
      );
      notificar("Profesional actualizado.", "exito");
      setEditando(null);
      await cargar();
    } catch (err) {
      notificar((err as Error).message, "error");
    }
  }

  async function eliminarProfesional(p: ProfGestion) {
    if (!window.confirm(`¿Eliminar a "${p.nombre}" del negocio?`)) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-profesionales", { accion: "eliminar", id: p.id }, token);
      notificar("Profesional eliminado.", "exito");
      await cargar();
    } catch (err) {
      notificar((err as Error).message, "error");
    }
  }

  async function reenviarInvitacion(p: ProfGestion) {
    const token = (await getTokenSesion()) ?? undefined;
    try {
      const res = await llamarEdge<{ mensaje: string }>("gestionar-profesionales", { accion: "reenviar_invitacion", id: p.id }, token);
      notificar(res.mensaje, "exito");
    } catch (err) {
      notificar((err as Error).message, "error");
    }
  }

  function abrirAsignar(p: ProfGestion) {
    setAsignando(p);
    const ya = new Set(
      servicios.filter((s) => s.profesionales_ids?.includes(p.id)).map((s) => s.id)
    );
    setSelServicios(ya);
  }

  async function guardarAsignacion() {
    if (!asignando) return;
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge(
        "gestionar-profesionales",
        { accion: "asignar_servicios", id: asignando.id, servicio_ids: [...selServicios] },
        token
      );
      notificar("Servicios actualizados.", "exito");
      setAsignando(null);
      await cargar();
    } catch (err) {
      notificar((err as Error).message, "error");
    }
  }

  function toggleServicio(id: string) {
    setSelServicios((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
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
      <h1 className="text-2xl font-bold text-white animate-fade-up">Profesionales</h1>

      <Tarjeta className="p-5 animate-fade-up">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-sm">➕</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">Invitar profesional</h2>
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
          <div className="flex items-end">
            <Boton type="submit" variante="primario" className="w-full">
              Enviar invitación
            </Boton>
          </div>
        </form>
      </Tarjeta>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-up [animation-delay:120ms]">
        {profesionales.map((p) => (
          <Tarjeta key={p.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/15 text-lg font-bold text-violet-200">
                  {p.nombre.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-semibold text-white">
                    {p.nombre} {p.yo && <span className="text-xs text-zinc-500">(tú)</span>}
                  </p>
                  <p className="text-xs text-zinc-400">{p.email}</p>
                </div>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase backdrop-blur ${
                  p.rol === "admin"
                    ? "border-amber-300/30 bg-amber-400/15 text-amber-200"
                    : "border-violet-300/30 bg-violet-400/10 text-violet-200"
                }`}
              >
                {p.rol === "admin" ? "Admin" : "Profesional"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {!p.activo ? (
                <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                  Inactivo
                </span>
              ) : !p.vinculado ? (
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  Invitación pendiente
                </span>
              ) : (
                <span className="rounded-full border border-teal-300/30 bg-teal-400/10 px-2 py-0.5 text-[11px] font-semibold text-teal-300">
                  Vinculado
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                {p.servicios} servicios
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Boton variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => abrirEditar(p)}>
                Editar
              </Boton>
              <Boton variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => abrirAsignar(p)}>
                Servicios
              </Boton>
              {!p.vinculado && (
                <Boton variante="fantasma" className="px-3 py-1.5 text-xs" onClick={() => reenviarInvitacion(p)}>
                  Reenviar invitación
                </Boton>
              )}
              {!p.yo && (
                <Boton variante="peligro" className="px-3 py-1.5 text-xs" onClick={() => eliminarProfesional(p)}>
                  Eliminar
                </Boton>
              )}
            </div>
          </Tarjeta>
        ))}
      </div>

      {editando && (
        <Modal onCerrar={() => setEditando(null)}>
          <h3 className="font-display text-lg font-semibold text-white">Editar profesional</h3>
          <form onSubmit={guardarEdicion} className="mt-4 grid gap-3">
            <Campo label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <Campo label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Campo label="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            <div>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-violet-300/80">Rol</span>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 outline-none"
              >
                <option value="profesional">Profesional</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="h-4 w-4 accent-violet-500"
              />
              Activo (recibe nuevas citas)
            </label>
            <div className="mt-2 flex gap-2">
              <Boton type="submit" variante="primario" className="flex-1">
                Guardar
              </Boton>
              <Boton variante="claro" onClick={() => setEditando(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </Modal>
      )}

      {asignando && (
        <Modal onCerrar={() => setAsignando(null)}>
          <h3 className="font-display text-lg font-semibold text-white">
            Servicios de {asignando.nombre}
          </h3>
          {servicios.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No hay servicios en el catálogo.</p>
          ) : (
            <div className="mt-4 flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
              {servicios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleServicio(s.id)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                    selServicios.has(s.id)
                      ? "border-violet-500 bg-violet-500/25 text-white"
                      : "border-white/10 bg-white/[0.05] text-zinc-300 hover:border-violet-400/50"
                  }`}
                >
                  <span>{s.nombre}</span>
                  <span className="text-xs font-normal text-zinc-400">
                    {s.duracion_min} min · ${s.precio}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Boton variante="primario" className="flex-1" onClick={guardarAsignacion}>
              Guardar servicios
            </Boton>
            <Boton variante="claro" onClick={() => setAsignando(null)}>
              Cancelar
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
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