"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { CitasList } from "@/components/CitasList";
import { llamarEdge } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { CitaCliente, Aviso } from "@/types";

type Etapa = "email" | "codigo" | "lista";

const CLAVE_SESION = "slotify_sesion";

interface PerfilCliente {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
}

export default function MisCitas() {
  const [etapa, setEtapa] = useState<Etapa>("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [citas, setCitas] = useState<CitaCliente[]>([]);
  const [avisos, setAvisos] = useState<Record<string, Aviso[]>>({});
  const [restaurando, setRestaurando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilCliente | null>(null);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [sesion, setSesion] = useState("");
  const { notificar } = useToast();

  async function solicitar() {
    setCargando(true);
    setError(null);
    setMensaje(null);
    try {
      const res = await llamarEdge<{ ok: boolean; mensaje: string }>("solicitar-codigo-acceso", {
        email,
      });
      setMensaje(res.mensaje);
      setEtapa("codigo");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function verificar() {
    setCargando(true);
    setError(null);
    try {
      const res = await llamarEdge<{ ok: boolean; sesion: string }>("verificar-codigo-acceso", {
        email,
        codigo,
      });
      sessionStorage.setItem(CLAVE_SESION, res.sesion);
      setSesion(res.sesion);
      await cargar(res.sesion);
      setEtapa("lista");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  function cambiarCorreo() {
    sessionStorage.removeItem(CLAVE_SESION);
    setCitas([]);
    setAvisos({});
    setEtapa("email");
  }

  async function cargar(s: string) {
    const res = await llamarEdge<{ citas: CitaCliente[]; avisos: Record<string, Aviso[]>; cliente: PerfilCliente | null }>(
      "consultar-mis-citas",
      { sesion: s }
    );
    setCitas(res.citas);
    setAvisos(res.avisos ?? {});
    setPerfil(res.cliente);
  }

  async function guardarPerfil(e: React.FormEvent) {
    e.preventDefault();
    if (!sesion || !perfil) return;
    setGuardandoPerfil(true);
    try {
      const res = await llamarEdge<{ cliente: PerfilCliente }>("editar-perfil-cliente", {
        sesion,
        nombre: perfil.nombre,
        telefono: perfil.telefono ?? "",
      });
      setPerfil(res.cliente);
      notificar("Perfil actualizado.", "exito");
    } catch (err) {
      notificar((err as Error).message, "error");
    } finally {
      setGuardandoPerfil(false);
    }
  }

  useEffect(() => {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    if (!guardada) {
      setRestaurando(false);
      return;
    }
    cargar(guardada)
      .then(() => {
        setSesion(guardada);
        setEtapa("lista");
      })
      .catch(() => {
        sessionStorage.removeItem(CLAVE_SESION);
        setEtapa("email");
      })
      .finally(() => setRestaurando(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="mb-6 text-3xl font-bold text-white">Mis citas</h1>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}
        {mensaje && (
          <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100">
            {mensaje}
          </div>
        )}

        {restaurando && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {etapa === "email" && !restaurando && (
          <Tarjeta className="mx-auto max-w-md p-6">
            <p className="mb-4 text-sm text-zinc-400">
              Ingresa tu correo y te enviaremos un código para acceder a tus citas.
            </p>
            <div className="space-y-4">
              <Campo
                label="Email"
                type="email"
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-zinc-100 border-white/10 bg-white/[0.06] placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
              />
              <Boton
                variante="primario"
                onClick={solicitar}
                disabled={!email.includes("@") || cargando}
                className="w-full"
              >
                {cargando ? <Spinner /> : "Enviar código"}
              </Boton>
            </div>
          </Tarjeta>
        )}

        {etapa === "codigo" && !restaurando && (
          <Tarjeta className="mx-auto max-w-md p-6">
            <p className="mb-4 text-sm text-zinc-400">
              Ingresa el código de 6 dígitos que te enviamos.
            </p>
            <div className="space-y-4">
              <Campo
                label="Código"
                placeholder="123456"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-lg font-bold tracking-[0.5em] text-zinc-100 border-white/10 bg-white/[0.06] placeholder-zinc-500 focus:border-violet-400 focus:ring-violet-300"
              />
              <Boton
                variante="primario"
                onClick={verificar}
                disabled={codigo.length !== 6 || cargando}
                className="w-full"
              >
                {cargando ? <Spinner /> : "Ver mis citas"}
              </Boton>
              <button
                className="w-full text-center text-xs text-violet-500 hover:underline"
                onClick={() => setEtapa("email")}
              >
                ¿No recibiste el código? Reintentar
              </button>
            </div>
          </Tarjeta>
        )}

        {etapa === "lista" && !restaurando && (
          <>
            {perfil && (
              <Tarjeta className="mb-6 p-6">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-violet-300">
                  Mi perfil
                </h2>
                <form onSubmit={guardarPerfil} className="space-y-4">
                  <Campo
                    label="Nombre"
                    value={perfil.nombre}
                    onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })}
                    className="text-zinc-100 border-white/10 bg-white/[0.06] focus:border-violet-400 focus:ring-violet-300"
                  />
                  <Campo
                    label="Email"
                    type="email"
                    value={perfil.email}
                    disabled
                    className="text-zinc-100 border-white/10 bg-white/[0.06] focus:border-violet-400 focus:ring-violet-300"
                  />
                  <Campo
                    label="Teléfono"
                    placeholder="+57 300 000 0000"
                    value={perfil.telefono ?? ""}
                    onChange={(e) => setPerfil({ ...perfil, telefono: e.target.value })}
                    className="text-zinc-100 border-white/10 bg-white/[0.06] focus:border-violet-400 focus:ring-violet-300"
                  />
                  <Boton variante="primario" disabled={guardandoPerfil || perfil.nombre.trim().length < 2}>
                    {guardandoPerfil ? <Spinner /> : "Guardar perfil"}
                  </Boton>
                </form>
              </Tarjeta>
            )}
            <CitasList citas={citas} avisos={avisos} sesion={sesion} />
            <div className="mt-6 text-center">
              <button
                onClick={cambiarCorreo}
                className="text-sm text-violet-200 hover:underline"
              >
                Usar otro correo
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}