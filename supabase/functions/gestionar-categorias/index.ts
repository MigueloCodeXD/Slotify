import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  accion: z.enum(["listar", "crear", "renombrar", "eliminar"]),
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(1).max(60).optional(),
});

export async function gestionarCategoriasRequest(req: Request): Promise<Response> {
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
      const { data: cats } = await admin.from("categorias").select("id, nombre").order("nombre");
      const { data: usos } = await admin.from("servicios").select("categoria").not("categoria", "is", null);
      const conteo: Record<string, number> = {};
      for (const s of usos ?? []) conteo[s.categoria] = (conteo[s.categoria] ?? 0) + 1;
      return json({
        categorias: (cats ?? []).map((c) => ({ id: c.id, nombre: c.nombre, en_uso: (conteo[c.nombre] ?? 0) > 0 })),
      });
    }

    case "crear": {
      if (!esAdmin) return json({ error: "Solo el administrador puede gestionar categorías." }, 403);
      if (!d.nombre) return json({ error: "Falta el nombre." }, 400);
      const { error } = await admin.from("categorias").insert({ nombre: d.nombre });
      if (error) return json({ error: "No se pudo crear la categoría (¿ya existe?)." }, 400);
      return json({ ok: true });
    }

    case "renombrar": {
      if (!esAdmin) return json({ error: "Solo el administrador puede gestionar categorías." }, 403);
      if (!d.id || !d.nombre) return json({ error: "Faltan datos." }, 400);
      const { error } = await admin.from("categorias").update({ nombre: d.nombre }).eq("id", d.id);
      if (error) return json({ error: "No se pudo renombrar la categoría (¿ya existe?)." }, 400);
      return json({ ok: true });
    }

    case "eliminar": {
      if (!esAdmin) return json({ error: "Solo el administrador puede gestionar categorías." }, 403);
      if (!d.id) return json({ error: "Falta id." }, 400);
      const { error } = await admin.from("categorias").delete().eq("id", d.id);
      if (error) {
        return json({ error: "No se puede eliminar: hay servicios con esta categoría." }, 400);
      }
      return json({ ok: true });
    }
  }
}

serve(async (req) => {
  try {
    const res = await gestionarCategoriasRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});