import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Config } from "@/types";

export async function obtenerConfig(): Promise<Config | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const { data } = await supabase.from("configuracion").select("*").maybeSingle();
  return (data as Config) ?? null;
}
