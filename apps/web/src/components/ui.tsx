"use client";

import { ReactNode } from "react";

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
      "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30",
    secundario:
      "bg-white/10 hover:bg-white/20 text-white border border-white/20",
    fantasma: "bg-transparent hover:bg-white/10 text-violet-100",
    claro: "bg-white hover:bg-violet-50 text-violet-700 border border-violet-600",
    peligro: "bg-white hover:bg-rose-50 text-rose-600 border border-rose-500",
  }[variante];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/95 text-slate-800 shadow-xl shadow-black/10 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

export function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-violet-700">
        {label}
      </span>
      <input
        {...props}
        className={`w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-400/40 ${props.className ?? ""}`}
      />
    </label>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-6 w-6 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700 ${className}`}
      aria-label="Cargando"
    />
  );
}

export function ChipEstado({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    confirmada: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
    cancelada: "bg-rose-500/15 text-rose-300 border-rose-400/30",
    completada: "bg-sky-500/15 text-sky-300 border-sky-400/30",
    no_show: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${map[estado] ?? map.confirmada}`}>
      {estado}
    </span>
  );
}