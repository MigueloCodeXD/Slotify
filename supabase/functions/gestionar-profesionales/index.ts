import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";
import { enviarCorreo } from "../_shared/brevo.ts";

const schema = z.object({
  accion: z.enum(["listar", "editar", "eliminar", "asignar_servicios", "reenviar_invitacion", "reenviar_confirmacion_email"]),
  id: z.string().uuid().optional(),
  nombre: z.string().min(2).max(120).optional(),
  email: z.string().email().max(255).optional(),
  telefono: z.string().max(30).nullable().optional(),
  rol: z.enum(["admin", "profesional"]).optional(),
  activo: z.boolean().optional(),
  servicio_ids: z.array(z.string().uuid()).optional(),
});

export async function gestionarProfesionalesRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: adminProf } = await getProfesionalByUser(userId);
  if (!adminProf || adminProf.rol !== "admin") {
    return json({ error: "Solo el administrador puede gestionar profesionales." }, 403);
  }

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
      const { data: profs } = await admin.from("profesionales").select("*").order("nombre");
      const { data: invitaciones } = await admin
        .from("invitaciones")
        .select("profesional_id, expira_at, usado")
        .eq("usado", false)
        .gt("expira_at", new Date().toISOString());
      const { data: servs } = await admin.from("profesional_servicios").select("profesional_id");
      const pendiente = new Set((invitaciones ?? []).map((i) => i.profesional_id));
      const nServicios: Record<string, number> = {};
      for (const s of servs ?? []) nServicios[s.profesional_id] = (nServicios[s.profesional_id] ?? 0) + 1;
      return json({
        profesionales: (profs ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          email: p.email,
          telefono: p.telefono,
          rol: p.rol,
          activo: p.activo,
          vinculado: Boolean(p.user_id),
          yo: p.id === adminProf.id,
          email_confirmado: p.email_confirmado !== false,
          servicios: nServicios[p.id] ?? 0,
          invitacion_pendiente: pendiente.has(p.id),
        })),
      });
    }

    case "editar": {
      if (!d.id) return json({ error: "Falta id." }, 400);
      const { data: prof } = await admin.from("profesionales").select("*").eq("id", d.id).single();
      if (!prof) return json({ error: "No se encontró el profesional." }, 404);

      const campos: Record<string, unknown> = {};
      if (d.nombre !== undefined) campos.nombre = d.nombre;
      if (d.telefono !== undefined) campos.telefono = d.telefono;
      if (d.email !== undefined) {
        const email = d.email.toLowerCase();
        if (email !== prof.email) {
          const { data: dup } = await admin
            .from("profesionales")
            .select("id")
            .eq("email", email)
            .neq("id", d.id)
            .maybeSingle();
          if (dup) return json({ error: "Ese email ya pertenece a otro profesional." }, 400);
          campos.email = email;
          // Cambio de email => requiere re-confirmación (el email es la llave de acceso).
          campos.email_confirmado = false;
          if (prof.user_id) {
            await admin.auth.admin.updateUserById(prof.user_id, { email, email_confirm: false }).catch(() => {});
          }
        }
      }
      if (d.rol !== undefined) campos.rol = d.rol;
      if (d.activo !== undefined) campos.activo = d.activo;

      if (d.rol !== undefined && d.rol !== prof.rol && d.rol === "profesional" && prof.rol === "admin") {
        const { data: admins } = await admin
          .from("profesionales")
          .select("id")
          .eq("rol", "admin")
          .eq("activo", true);
        if ((admins ?? []).length <= 1) return json({ error: "No puedes degradar al último administrador." }, 400);
      }
      if (d.activo === false && prof.id === adminProf.id) {
        return json({ error: "No puedes desactivar tu propia cuenta." }, 400);
      }

      const { error } = await admin.from("profesionales").update(campos).eq("id", d.id);
      if (error) return json({ error: "No se pudo actualizar el profesional." }, 500);

      if (d.rol !== undefined && prof.user_id) {
        await admin.auth.admin.updateUserById(prof.user_id, {
          user_metadata: { nombre: d.nombre ?? prof.nombre, rol: d.rol },
        }).catch(() => {});
      }
      return json({ ok: true });
    }

    case "eliminar": {
      if (!d.id) return json({ error: "Falta id." }, 400);
      if (d.id === adminProf.id) return json({ error: "No puedes eliminar tu propia cuenta." }, 400);
      const { data: prof } = await admin.from("profesionales").select("id, rol, user_id").eq("id", d.id).single();
      if (!prof) return json({ error: "No se encontró el profesional." }, 404 );

      const { data: citas } = await admin
        .from("citas")
        .select("id")
        .eq("profesional_id", d.id)
        .in("estado", ["confirmada", "pendiente"])
        .limit(1);
      if ((citas ?? []).length > 0) {
        return json(
          { error: "No se puede eliminar: tiene citas activas. Desactívalo para que no reciba nuevas citas." },
          409
        );
      }
      const { data: admins } = await admin.from("profesionales").select("id").eq("rol", "admin").eq("activo", true);
      if (prof.rol === "admin" && (admins ?? []).length <= 1) {
        return json({ error: "No puedes eliminar al último administrador." }, 400);
      }

      const { error } = await admin.from("profesionales").delete().eq("id", d.id);
      if (error) return json({ error: "No se pudo eliminar el profesional." }, 500);
      return json({ ok: true });
    }

    case "asignar_servicios": {
      if (!d.id || !d.servicio_ids) return json({ error: "Faltan datos." }, 400);
      const { data: prof } = await admin.from("profesionales").select("id").eq("id", d.id).single();
      if (!prof) return json({ error: "No se encontró el profesional." }, 404);
      await admin.from("profesional_servicios").delete().eq("profesional_id", d.id);
      if (d.servicio_ids.length > 0) {
        const { error } = await admin
          .from("profesional_servicios")
          .insert(d.servicio_ids.map((servicio_id) => ({ profesional_id: d.id, servicio_id })));
        if (error) return json({ error: "No se pudieron asignar los servicios." }, 500);
      }
      return json({ ok: true });
    }

    case "reenviar_invitacion": {
      if (!d.id) return json({ error: "Falta id." }, 400);
      const { data: prof } = await admin.from("profesionales").select("id, nombre, email, user_id").eq("id", d.id).single();
      if (!prof) return json({ error: "No se encontró el profesional." }, 404);
      if (prof.user_id) return json({ error: "Este profesional ya vinculó su cuenta." }, 400);

      const { data: invExistente } = await admin
        .from("invitaciones")
        .select("id")
        .eq("profesional_id", d.id)
        .eq("usado", false)
        .maybeSingle();
      let token: string;
      if (invExistente) {
        const nuevoToken = crypto.randomUUID();
        const { data: inv, error: eUpd } = await admin
          .from("invitaciones")
          .update({ token: nuevoToken, expira_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString() })
          .eq("id", invExistente.id)
          .select("token")
          .single();
        if (eUpd || !inv) return json({ error: "No se pudo regenerar la invitación." }, 500);
        token = inv.token;
      } else {
        const { data: inv, error: eInv } = await admin
          .from("invitaciones")
          .insert({ profesional_id: d.id, creado_por: adminProf.id })
          .select("token")
          .single();
        if (eInv || !inv) return json({ error: "No se pudo generar la invitación." }, 500);
        token = inv.token;
      }

      const link = `${Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000"}/activar-cuenta?token=${token}`;
      await enviarCorreo("invitacion_profesional", {
        to: prof.email,
        nombre: prof.nombre,
        link_activacion: link,
        negocio: "Slotify",
      }).catch(() => {});
      return json({ ok: true, mensaje: "Invitación reenviada." });
    }

    case "reenviar_confirmacion_email": {
      if (!d.id) return json({ error: "Falta id." }, 400);
      const { data: prof } = await admin
        .from("profesionales")
        .select("id, nombre, email, user_id, email_confirmado")
        .eq("id", d.id)
        .single();
      if (!prof) return json({ error: "No se encontró el profesional." }, 404);
      if (prof.email_confirmado !== false) {
        return json({ error: "El email ya está confirmado." }, 400);
      }
      if (prof.user_id) {
        const { error: eAuth } = await admin.auth.admin.updateUserById(prof.user_id, {
          email: prof.email,
          email_confirm: false,
        });
        if (eAuth) return json({ error: "No se pudo enviar la confirmación." }, 500);
      }
      return json({ ok: true, mensaje: "Confirmación enviada a tu nuevo email." });
    }
  }
}

serve(async (req) => {
  try {
    const res = await gestionarProfesionalesRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});