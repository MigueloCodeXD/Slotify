"use client";

// ── Conversión y generación de tonalidades del color principal ──

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const limpio = (hex ?? "#7C3AED").replace("#", "");
  const r = parseInt(limpio.slice(0, 2), 16) / 255;
  const g = parseInt(limpio.slice(2, 4), 16) / 255;
  const b = parseInt(limpio.slice(4, 6), 16) / 255;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { h: 255, s: 91, l: 47 };
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

// Escala tonal por luminosidad (ligeramente desaturada en extremos)
const TONOS: { tono: number; l: number; s: number }[] = [
  { tono: 50, l: 96, s: 95 },
  { tono: 100, l: 90, s: 88 },
  { tono: 200, l: 78, s: 80 },
  { tono: 300, l: 66, s: 70 },
  { tono: 400, l: 57, s: 63 },
  { tono: 500, l: 47, s: 58 },
  { tono: 600, l: 39, s: 54 },
  { tono: 700, l: 30, s: 50 },
  { tono: 800, l: 22, s: 46 },
  { tono: 900, l: 14, s: 42 },
];

export function generarTonalidades(hex: string): Record<string, string> {
  const { h } = hexToHsl(hex);
  const vars: Record<string, string> = {};
  for (const t of TONOS) {
    vars[`--primary-${t.tono}`] = hsl(h, t.s, t.l);
  }
  vars["--primary"] = hex;
  vars["--primary-rgb"] = `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;
  return vars;
}

// Inyecta las variables CSS del color principal en :root
export function aplicarTema(colorHex: string): void {
  const vars = generarTonalidades(colorHex);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    const actual = root.style.getPropertyValue(k);
    if (!actual || actual !== v) root.style.setProperty(k, v);
  }
}

export const PALETA_PREDEFINIDA: { nombre: string; hex: string }[] = [
  { nombre: "Violeta", hex: "#7C3AED" },
  { nombre: "Azul", hex: "#2563EB" },
  { nombre: "Rosa", hex: "#DB2777" },
  { nombre: "Verde", hex: "#059669" },
  { nombre: "Naranja", hex: "#EA580C" },
  { nombre: "Rojo", hex: "#DC2626" },
  { nombre: "Turquesa", hex: "#0D9488" },
  { nombre: "Gris", hex: "#1F2937" },
];