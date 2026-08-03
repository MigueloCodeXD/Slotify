// Script de setup inicial: crea el usuario admin en Supabase Auth
// y lo vincula a la tabla profesionales con rol='admin'.
//
// Uso:
//   deno run --allow-env --allow-net supabase/scripts/setup-admin.ts
//
// Variables de entorno requeridas:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE

import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const email = Deno.env.get("ADMIN_EMAIL");
const password = Deno.env.get("ADMIN_PASSWORD");
const nombre = Deno.env.get("ADMIN_NOMBRE") ?? "Administrador";

if (!url || !key || !email || !password) {
  console.error(
    "Faltan variables. Requeridas: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD"
  );
  Deno.exit(1);
}

if (password.length < 8) {
  console.error("ADMIN_PASSWORD debe tener al menos 8 caracteres.");
  Deno.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// 1) Crear (o reutilizar) el usuario en Auth
let authUserId: string | null = null;
const { data: created, error: eCreate } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { nombre, rol: "admin" },
});
if (eCreate) {
  if (String(eCreate.message).toLowerCase().includes("already")) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email === email) ?? null;
    if (!found) {
      console.error("No se pudo resolver el usuario existente:", eCreate.message);
      Deno.exit(1);
    }
    authUserId = found.id;
    console.log("Usuario Auth ya existía:", email);
  } else {
    console.error("Error creando usuario Auth:", eCreate.message);
    Deno.exit(1);
  }
} else {
  authUserId = created?.user?.id ?? null;
  console.log("Usuario Auth creado:", email);
}

if (!authUserId) {
  console.error("No se pudo obtener el id del usuario Auth.");
  Deno.exit(1);
}

// 2) Vincular en profesionales con rol admin
const { data: existente } = await supabase
  .from("profesionales")
  .select("id, rol")
  .eq("email", email)
  .maybeSingle();

if (existente) {
  await supabase.from("profesionales").update({ user_id: authUserId, rol: "admin" }).eq("id", existente.id);
  console.log("Profesional actualizado a admin:", email);
} else {
  const { data, error } = await supabase
    .from("profesionales")
    .insert({ user_id: authUserId, email, nombre, rol: "admin" })
    .select("id")
    .single();
  if (error) {
    console.error("Error insertando profesional:", error.message);
    Deno.exit(1);
  }
  console.log("Profesional admin creado:", email, data.id);
}

console.log("Setup completado. Ya puedes iniciar sesión en /login");
