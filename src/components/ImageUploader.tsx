"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { subirImagen } from "@/lib/storage";
import { Spinner } from "@/components/ui";

export function ImageUploader({
  bucket,
  carpeta,
  actual,
  onCambio,
  texto = "Subir imagen",
  circular = false,
}: {
  bucket: string;
  carpeta: string;
  actual: string | null | undefined;
  onCambio: (url: string | null) => void;
  texto?: string;
  circular?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manejarArchivo(f: File | undefined) {
    if (!f) return;
    setSubiendo(true);
    setError(null);
    try {
      const res = await subirImagen(bucket, carpeta, f);
      if (res.error) setError(res.error);
      else onCambio(res.url);
    } catch {
      setError("No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative shrink-0 overflow-hidden border border-zinc-200 bg-zinc-50 ${
          circular ? "h-16 w-16 rounded-full" : "h-20 w-20 rounded-xl"
        }`}
      >
        {actual ? (
          <Image
            src={actual}
            alt="Imagen"
            fill
            className="object-cover"
          />
        ) : subiendo ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-zinc-300">
            🖼
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => manejarArchivo(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="rounded-lg border border-[var(--primary-200)] bg-[var(--primary-50)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-700)] transition hover:bg-[var(--primary-100)] disabled:opacity-50"
        >
          {texto}
        </button>
        {actual && (
          <button
            type="button"
            onClick={() => onCambio(null)}
            disabled={subiendo}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            Eliminar
          </button>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}