"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Boton, Campo, Spinner, Tarjeta } from "@/components/ui";
import { CitasList } from "@/components/CitasList";
import { llamarEdge } from "@/lib/api";
import type { CitaCliente, Aviso } from "@/types";

type Etapa = "email" | "codigo" | "lista";

const CLAVE_SESION = "slotify_sesion";

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
    const res = await llamarEdge<{ citas: CitaCliente[]; avisos: Record<string, Aviso[]> }>(
      "consultar-mis-citas",
      { sesion: s }
    );
    setCitas(res.citas);
    setAvisos(res.avisos ?? {});
  }

  useEffect(() => {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    if (!guardada) {
      setRestaurando(false);
      return;
    }
    cargar(guardada)
      .then(() => setEtapa("lista"))
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
            <CitasList citas={citas} avisos={avisos} />
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