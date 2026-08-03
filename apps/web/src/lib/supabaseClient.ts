import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function configPublica() {
  return supabase.from("v_config").select("*").maybeSingle();
}

export function serviciosPublicos() {
  return supabase.from("v_servicios").select("*");
}

export function profesionalesPublicos() {
  return supabase.from("v_profesionales").select("*");
}
