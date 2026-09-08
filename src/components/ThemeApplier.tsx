"use client";

import { useEffect } from "react";
import { configPublica } from "@/lib/supabaseClient";
import { aplicarTema } from "@/lib/theme";
import type { Config } from "@/types";

// Lee la config del negocio y aplica el color principal en :root.
// Se monta una sola vez en el layout raíz.
export function ThemeApplier() {
  useEffect(() => {
    const aplicar = async () => {
      try {
        const c = await configPublica();
        const cfg = c.data as Config | null;
        if (cfg?.color_principal) aplicarTema(cfg.color_principal);
      } catch {
        // Sin config no hay color personalizado; usar default.
      }
    };
    void aplicar();
  }, []);

  return null;
}