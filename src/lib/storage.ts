import { supabase } from "@/lib/supabaseClient";

export interface SubidaResultado {
  url: string | null;
  error: string | null;
}

// Sube un archivo de imagen a un bucket de Supabase Storage
// y retorna la URL pública. Prefijo único para evitar colisiones.
export async function subirImagen(
  bucket: string,
  carpeta: string,
  archivo: File
): Promise<SubidaResultado> {
  if (!archivo.type.startsWith("image/")) {
    return { url: null, error: "El archivo debe ser una imagen." };
  }
  const maxMB = bucket === "fotos-profesionales" ? 3 : 2;
  if (archivo.size > maxMB * 1024 * 1024) {
    return { url: null, error: `La imagen no puede superar los ${maxMB} MB.` };
  }
  const ext = archivo.name.split(".").pop()?.toLowerCase() || "png";
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(ruta, archivo, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return { url: null, error: error.message };
  const { data } = supabase.storage.from(bucket).getPublicUrl(ruta);
  return { url: data.publicUrl, error: null };
}

export function urlPublica(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Dado un texto URL o path, retorna la URL pública si corresponde a este bucket.
export function normalizarUrl(bucket: string, valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (valor.startsWith("http")) return valor;
  return urlPublica(bucket, valor.startsWith("/") ? valor.slice(1) : valor);
}

// Extrae el path de objeto a partir de la URL pública (para borrar).
export function objetoDesdeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const partes = u.pathname.split("/");
    // /storage/v1/object/public/<bucket>/<ruta>
    const idx = partes.indexOf("public");
    if (idx === -1) return null;
    return partes.slice(idx + 2).join("/");
  } catch {
    return null;
  }
}

export async function eliminarImagen(bucket: string, url: string): Promise<void> {
  const path = objetoDesdeUrl(url);
  if (!path) return;
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // Si no se pudre borrar, no bloqueamos el flujo.
  }
}