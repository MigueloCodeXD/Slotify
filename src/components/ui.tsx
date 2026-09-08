"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

/* ---- Botón ---- */
export function Boton({
  children,
  onClick,
  variante = "primario",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: "primario" | "secundario" | "fantasma" | "claro" | "peligro";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const estilos = {
    primario:
      "bg-[var(--primary-600)] text-white shadow-lg shadow-[var(--primary-900)]/20 hover:bg-[var(--primary-700)] focus-visible:ring-2 focus-visible:ring-[var(--primary-300)]",
    secundario:
      "bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-200)] hover:bg-[var(--primary-100)]",
    fantasma: "bg-transparent text-[var(--primary-600)] hover:bg-[var(--primary-50)]",
    claro:
      "bg-white text-[var(--primary-700)] border border-[var(--primary-200)] hover:bg-[var(--primary-50)]",
    peligro:
      "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100",
  }[variante];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:-translate-y-0 disabled:active:scale-100 ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

/* ---- Tarjeta clara ---- */
export function Tarjeta({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`glass glass-hover rounded-2xl text-zinc-800 ${className}`}
    >
      {children}
    </div>
  );
}

/* ---- Input ---- */
export function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        {...props}
        className={`w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--primary-400)] focus:ring-2 focus:ring-[var(--primary-500)]/20 ${
          props.className ?? ""
        }`}
      />
    </label>
  );
}

/* ---- Spinner ---- */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-[var(--primary-500)] ${className}`}
      aria-label="Cargando"
    />
  );
}

/* ---- Estado de cita (colores pastel claros) ---- */
export function ChipEstado({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    confirmada: "bg-teal-50 text-teal-700 border-teal-200",
    cancelada: "bg-rose-50 text-rose-700 border-rose-200",
    completada: "bg-sky-50 text-sky-700 border-sky-200",
    no_show: "bg-amber-50 text-amber-700 border-amber-200",
    pendiente: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  };
  const dot: Record<string, string> = {
    confirmada: "bg-teal-500",
    cancelada: "bg-rose-500",
    completada: "bg-sky-500",
    no_show: "bg-amber-500",
    pendiente: "bg-fuchsia-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${map[estado] ?? map.confirmada}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[estado] ?? dot.confirmada}`} />
      {estado === "no_show" ? "No asistió" : estado}
    </span>
  );
}

/* ---- Contador animado (incrementa desde 0) ---- */
export function Contador({
  valor,
  moneda = false,
  duracion = 900,
  className = "",
}: {
  valor: number;
  moneda?: boolean;
  duracion?: number;
  className?: string;
}) {
  const [mostrado, setMostrado] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const ini = performance.now();
    const paso = (t: number) => {
      const p = Math.min((t - ini) / duracion, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      ref.current = requestAnimationFrame(paso);
      if (moneda) {
        setMostrado((valor * eased));
      } else {
        setMostrado(Math.round(valor * eased));
      }
      if (p >= 1) cancelAnimationFrame(ref.current!);
    };
    ref.current = requestAnimationFrame(paso);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  const texto = moneda
    ? "$" + (Number.isFinite(mostrado) ? mostrado : 0).toFixed(2)
    : String(mostrado);

  return <span className={`font-mono tabular-nums ${className}`}>{texto}</span>;
}

/* ---- Skeleton claro ---- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}