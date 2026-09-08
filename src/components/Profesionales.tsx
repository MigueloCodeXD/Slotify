"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Boton, Campo, ModalConfirmar, Spinner, Tarjeta } from "@/components/ui";
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
  cargo: string | null;
  foto_url: string | null;
  rol: "admin" | "profesional";
  activo: boolean;
  vinculado: boolean;
  yo: boolean;
  email_confirmado: boolean;
  servicios: number;
  invitacion_pendiente: boolean;
}

export function Profesionales() {
  const { notificar } = useToast();
  const router = useRouter();
  const [profesionales, setProfesionales] = useState<ProfGestion[]>([]);
  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [invitar, setInvitar] = useState({ nombre: "", email: "" });

  const [editando, setEditando] = useState<ProfGestion | null>(null);
  const [eliminando, setEliminando] = useState<ProfGestion | null>(null);
  const [eliminandoEnProgreso, setEliminandoEnProgreso] = useState(false);
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", cargo: "", rol: "profesional", activo: true });
  const [cargos, setCargos] = useState<{ id: string; nombre: string }[]>([]);

  const [asignando, setAsignando] = useState<ProfGestion | null>(null);
  const [selServicios, setSelServicios] = useState<Set<string>>(new Set());

  async function cargar() {
    try {
      const token = (await getTokenSesion()) ?? undefined;
      const [res, sv, cargosRes] = await Promise.all([
        llamarEdge<{ profesionales: ProfGestion[] }>("gestionar-profesionales", { accion: "listar" }, token),
        serviciosPublicos(),
        llamarEdge<{ cargos: { id: string; nombre: string }[] }>("gestionar-cargos", { accion: "listar" }, token),
      ]);
      setProfesionales(res.profesionales ?? []);
      setServicios((sv.data as ServicioPublico[]) ?? []);
      setCargos(cargosRes.cargos ?? []);
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
      cargo: p.cargo ?? "",
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
          cargo: form.cargo || null,
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

  function eliminarProfesional(p: ProfGestion) {
    setEliminando(p);
  }

  async function confirmarEliminarProfesional() {
    const p = eliminando;
    if (!p) return;
    if (eliminandoEnProgreso) return;
    setEliminandoEnProgreso(true);
    const token = (await getTokenSesion()) ?? undefined;
    try {
      await llamarEdge("gestionar-profesionales", { accion: "eliminar", id: p.id }, token);
      notificar("Profesional eliminado.", "exito");
      setEliminando(null);
      await cargar();
    } catch (err) {
      notificar((err as Error).message, "error");
    } finally {
      setEliminandoEnProgreso(false);
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

  async function reenviarConfirmacionEmail(p: ProfGestion) {
    const token = (await getTokenSesion()) ?? undefined;
    try {
      const res = await llamarEdge<{ mensaje: string }>(
        "gestionar-profesionales",
        { accion: "reenviar_confirmacion_email", id: p.id },
        token
      );
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
      <h1 className="text-2xl font-bold text-zinc-900 animate-fade-up">Profesionales</h1>

      <Tarjeta className="p-5 animate-fade-up">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-100)] text-sm">➕</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--primary-700)]">Invitar profesional</h2>
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
                {p.foto_url ? (
                  <Image
                    src={p.foto_url}
                    alt={p.nombre}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-100)] text-lg font-bold text-[var(--primary-700)]">
                    {p.nombre.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="font-semibold text-zinc-900">
                    {p.nombre} {p.yo && <span className="text-xs text-zinc-500">(tú)</span>}
                  </p>
                  <p className="text-xs text-zinc-500">{p.email}</p>
                  {p.cargo && <p className="text-xs font-medium text-[var(--primary-700)]">{p.cargo}</p>}
                </div>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${
                  p.rol === "admin"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-[var(--primary-200)] bg-[var(--primary-50)] text-[var(--primary-700)]"
                }`}
              >
                {p.rol === "admin" ? "Admin" : "Profesional"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {!p.activo ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                  Inactivo
                </span>
              ) : !p.vinculado ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  Invitación pendiente
                </span>
              ) : (
                <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                  Vinculado
                </span>
              )}
              {p.vinculado && !p.email_confirmado && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  Email sin confirmar
                </span>
              )}
              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                {p.servicios} servicios
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Boton variante="primario" className="px-3 py-1.5 text-xs" onClick={() => router.push(`/panel/profesionales/${p.id}`)}>
                Gestionar
              </Boton>
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
              {p.vinculado && !p.email_confirmado && (
                <Boton variante="fantasma" className="px-3 py-1.5 text-xs" onClick={() => reenviarConfirmacionEmail(p)}>
                  Reenviar confirmación de email
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

      {eliminando && (
        <ModalConfirmar
          titulo="Eliminar profesional"
          mensaje={`¿Seguro que quieres eliminar a "${eliminando.nombre}" del negocio? Esta acción no se puede deshacer.`}
          etiqueta="Eliminar profesional"
          guardando={eliminandoEnProgreso}
          onCerrar={() => {
            if (!eliminandoEnProgreso) setEliminando(null);
          }}
          onConfirmar={confirmarEliminarProfesional}
        />
      )}

      {editando && (
        <Modal onCerrar={() => setEditando(null)}>
          <h3 className="font-display text-lg font-semibold text-zinc-900">Editar profesional</h3>
          <form onSubmit={guardarEdicion} className="mt-4 grid gap-3">
            <Campo label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <Campo label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Campo label="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            <div>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Cargo</span>
              <select
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
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
            <div>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Rol</span>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20"
              >
                <option value="profesional">Profesional</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="h-4 w-4 accent-[var(--primary-600)]"
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
          <h3 className="font-display text-lg font-semibold text-zinc-900">
            Servicios de {asignando.nombre}
          </h3>
          {servicios.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No hay servicios en el catálogo.</p>
          ) : (
            <div className="mt-4 flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
              {servicios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleServicio(s.id)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                    selServicios.has(s.id)
                      ? "border-[var(--primary-600)] bg-[var(--primary-50)] text-[var(--primary-700)]"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-[var(--primary-400)]"
                  }`}
                >
                  <span>{s.nombre}</span>
                  <span className="text-xs font-normal text-zinc-500">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="glass-strong w-full max-w-md rounded-3xl p-5 text-zinc-900 shadow-2xl animate-scale-in">
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
  );
}