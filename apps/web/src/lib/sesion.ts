import { supabase } from "@/lib/supabaseClient";

export async function getTokenSesion(): Promise<string | null> {
  await supabase.auth.getUser();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getRolProfesional(): Promise<"admin" | "profesional" | null> {
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata ?? {};
  const rol = meta.rol as string | undefined;
  return rol === "admin" ? "admin" : rol === "profesional" ? "profesional" : null;
}