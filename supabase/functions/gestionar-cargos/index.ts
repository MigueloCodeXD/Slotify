import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  accion: z.enum(["listar", "crear", "renombrar", "eliminar"]),
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(1).max(100).optional(),
});

export async function gestionarCargosRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401);
  const esAdmin = prof.rol === "admin";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400);
  const d = parsed.data;

  switch (d.accion) {
    case "listar": {
      const { data: cargos } = await admin.from("cargos").select("id, nombre").order("nombre");
      const { data: profesionales } = await admin.from("profesionales").select("cargo").not("cargo", "is", null);
      const { data: servicios } = await admin.from("servicios").select("cargo_requerido").not("cargo_requerido", "is", null);
      const usados = new Set<string>();
      for (const p of profesionales ?? []) if (p.cargo) usados.add(p.cargo);
      for (const s of servicios ?? []) if (s.cargo_requerido) usados.add(s.cargo_requerido);
      return json({
        cargos: (cargos ?? []).map((c) => ({ id: c.id, nombre: c.nombre, en_uso: usados.has(c.nombre) })),
      });
    }

    case "crear": {
      if (!esAdmin) return json({ error: "Solo el administrador puede gestionar cargos." }, 403);
      if (!d.nombre) return json({ error: "Falta el nombre." }, 400);
      const { error } = await admin.from("cargos").insert({ nombre: d.nombre });
      if (error) return json({ error: "No se pudo crear el cargo (¿ya existe?)." }, 400);
      return json({ ok: true });
    }

    case "renombrar": {
      if (!esAdmin) return json({ error: "Solo el administrador puede gestionar cargos." }, 403);
      if (!d.id || !d.nombre) return json({ error: "Faltan datos." }, 400);
      const { data: actual } = await admin.from("cargos").select("nombre").eq("id", d.id).single();
      if (!actual) return json({ error: "Cargo no encontrado." }, 404);
      const { error } = await admin.from("cargos").update({ nombre: d.nombre }).eq("id", d.id);
      if (error) return json({ error: "No se pudo renombrar el cargo (¿ya existe?)." }, 400);
      // Respaldo por si no está la FK (cascade): mantener sincronizados los usos.
      await admin.from("profesionales").update({ cargo: d.nombre }).eq("cargo", actual.nombre);
      await admin.from("servicios").update({ cargo_requerido: d.nombre }).eq("cargo_requerido", actual.nombre);
      return json({ ok: true });
    }

    case "eliminar": {
      if (!esAdmin) return json({ error: "Solo el administrador puede gestionar cargos." }, 403);
      if (!d.id) return json({ error: "Falta id." }, 400);
      const { error } = await admin.from("cargos").delete().eq("id", d.id);
      if (error) {
        return json({ error: "No se puede eliminar: hay profesionales o servicios usando este cargo." }, 400);
      }
      return json({ ok: true });
    }
  }
}

serve(async (req) => {
  try {
    const res = await gestionarCargosRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});