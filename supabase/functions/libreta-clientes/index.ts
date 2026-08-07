import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { admin, json } from "../_shared/db.ts";
import { getUserFromRequest, getProfesionalByUser } from "../_shared/auth.ts";

const schema = z.object({
  accion: z.enum(["listar", "eliminar"]).default("listar"),
  id: z.string().uuid().optional(),
  busqueda: z.string().max(100).optional(),
  limite: z.number().int().min(1).max(200).optional(),
});

interface CitaExt {
  cliente_id: string;
  estado: string;
  rango_tiempo: string;
  servicio: { nombre: string; precio: number } | null;
  profesional: { nombre: string } | null;
}

interface Agregado {
  conteo: Record<string, number>;
  gasto: number;
  historia: Omit<CitaExt, "cliente_id">[];
}

function inicioMs(rango: string): number {
  const clean = String(rango).replace(/[\[\]\(\)"]/g, "").split(",")[0] ?? "";
  const norm = clean.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
  const t = Date.parse(norm);
  return Number.isNaN(t) ? 0 : t;
}

const CONTABILIZA = (estado: string) => estado === "completada" || estado === "confirmada";

export async function libretaClientesRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const userId = await getUserFromRequest(req);
  if (!userId) return json({ error: "No autorizado." }, 401);
  const { data: prof } = await getProfesionalByUser(userId);
  if (!prof) return json({ error: "No autorizado." }, 401);
  if (prof.rol !== "admin") return json({ error: "Solo el administrador puede ver la libreta de clientes." }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos" }, 400);
  const d = parsed.data;

  if (d.accion === "eliminar") {
    if (!d.id) return json({ error: "Falta el id del cliente." }, 400);
    const { data: existe } = await admin.from("clientes").select("id").eq("id", d.id).single();
    if (!existe) return json({ error: "Cliente no encontrado." }, 404);
    const { error: errCitas } = await admin.from("citas").delete().eq("cliente_id", d.id);
    if (errCitas) return json({ error: "No se pudieron eliminar las citas del cliente." }, 500);
    const { error: errCliente } = await admin.from("clientes").delete().eq("id", d.id);
    if (errCliente) return json({ error: "No se pudo eliminar el cliente." }, 500);
    return json({ ok: true });
  }

  const [clientesRes, citasRes] = await Promise.all([
    admin.from("clientes").select("id, nombre, email, telefono").order("created_at"),
    admin
      .from("citas")
      .select("cliente_id, estado, rango_tiempo, servicio:servicios(nombre, precio), profesional:profesionales(nombre)"),
  ]);

  const clientes = (clientesRes.data ?? []) as { id: string; nombre: string; email: string | null; telefono: string | null }[];
  const citas = (citasRes.data ?? []) as unknown as CitaExt[];

  const porCliente: Record<string, Agregado> = {};
  for (const c of citas) {
    const g = (porCliente[c.cliente_id] ??= { conteo: {}, gasto: 0, historia: [] });
    g.conteo[c.estado] = (g.conteo[c.estado] ?? 0) + 1;
    if (CONTABILIZA(c.estado)) g.gasto += Number(c.servicio?.precio ?? 0);
    g.historia.push({ estado: c.estado, rango_tiempo: c.rango_tiempo, servicio: c.servicio, profesional: c.profesional });
  }

  const resultado = clientes.map((cl) => {
    const g = porCliente[cl.id];
    const historia = (g?.historia ?? []).sort((a, b) => inicioMs(b.rango_tiempo) - inicioMs(a.rango_tiempo));
    const total = g ? Object.values(g.conteo).reduce((s, n) => s + n, 0) : 0;
    const ultima = historia[0] ?? null;
    return {
      id: cl.id,
      nombre: cl.nombre,
      email: cl.email,
      telefono: cl.telefono,
      total,
      conteo: g?.conteo ?? {},
      gasto: g?.gasto ?? 0,
      ultima_cita: ultima
        ? {
            rango_tiempo: ultima.rango_tiempo,
            estado: ultima.estado,
            servicio: ultima.servicio?.nombre ?? null,
            profesional: ultima.profesional?.nombre ?? null,
          }
        : null,
      ultimas: historia.slice(0, 5).map((c) => ({
        rango_tiempo: c.rango_tiempo,
        estado: c.estado,
        servicio: c.servicio?.nombre ?? null,
        profesional: c.profesional?.nombre ?? null,
      })),
    };
  });

  let lista = resultado;
  if (d.busqueda) {
    const q = d.busqueda.toLowerCase();
    lista = lista.filter(
      (c) => (c.nombre ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)
    );
  }
  if (d.limite) lista = lista.slice(0, d.limite);

  return json({ clientes: lista, total: resultado.length });
}

serve(async (req) => {
  try {
    const res = await libretaClientesRequest(req);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: corsHeaders });
  }
});