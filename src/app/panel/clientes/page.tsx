"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clientes } from "@/components/Clientes";
import { Spinner } from "@/components/ui";
import { getRolProfesional } from "@/lib/sesion";

export default function Page() {
  const router = useRouter();
  const [rol, setRol] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getRolProfesional().then((r) => {
      setRol(r);
      setCargando(false);
    });
  }, []);

  useEffect(() => {
    if (cargando) return;
    if (rol !== "admin") router.replace("/panel");
  }, [rol, cargando, router]);

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (rol !== "admin") return null;

  return <Clientes />;
}