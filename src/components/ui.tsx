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
      "bg-gradient-to-r from-violet-500 to-violet-400 text-white border border-white/10 shadow-lg shadow-violet-900/40 hover:shadow-violet-500/30 hover:from-violet-500 hover:to-fuchsia-400",
    secundario:
      "glass text-white/90 hover:border-white/20 hover:bg-white/[0.09]",
    fantasma: "bg-transparent hover:bg-white/10 text-violet-200",
    claro:
      "glass-strong text-white hover:border-violet-300/40 hover:text-violet-100",
    peligro:
      "glass text-rose-200 hover:border-rose-400/40 hover:bg-rose-500/10",
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

/* ---- Tarjeta de vidrio ---- */
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
      className={`glass glass-hover rounded-2xl text-zinc-100 ${className}`}
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
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-violet-300/80">
        {label}
      </span>
      <input
        {...props}
        className={`w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none backdrop-blur transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/25 ${
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
      className={`h-6 w-6 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-400 ${className}`}
      aria-label="Cargando"
    />
  );
}

/* ---- Estado de cita (colores translúcidos suaves) ---- */
export function ChipEstado({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    confirmada: "bg-teal-400/10 text-teal-300 border-teal-300/25",
    cancelada: "bg-rose-400/10 text-rose-300/80 border-rose-400/25",
    completada: "bg-sky-400/10 text-sky-300 border-sky-300/25",
    no_show: "bg-amber-400/10 text-amber-300/85 border-amber-300/25",
    pendiente: "bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-300/25",
  };
  const dot: Record<string, string> = {
    confirmada: "bg-teal-400",
    cancelada: "bg-rose-400/80",
    completada: "bg-sky-400",
    no_show: "bg-amber-400",
    pendiente: "bg-fuchsia-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize backdrop-blur ${map[estado] ?? map.confirmada}`}
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

/* ---- Skeleton de vidrio ---- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}