import { admin } from "./db.ts";

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface MensajeChat {
  role: "user" | "model";
  text: string;
}

const MODELO = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
const LIMITE_DIARIO = (() => {
  const n = Number(Deno.env.get("GEMINI_LIMITE_DIARIO") ?? 500);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
})();

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

export async function incrementarUso(tipo: "cliente" | "profesional"): Promise<boolean> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("ia_uso")
    .select("contador")
    .eq("fecha", hoy)
    .eq("tipo", tipo)
    .maybeSingle();
  const actual = (data?.contador as number | undefined) ?? 0;
  if (actual >= LIMITE_DIARIO) return false;
  if (data) {
    await admin.from("ia_uso").update({ contador: actual + 1 }).eq("fecha", hoy).eq("tipo", tipo).eq("contador", actual);
  } else {
    await admin.from("ia_uso").insert({ fecha: hoy, tipo, contador: 1 });
  }
  return true;
}

export async function chatConHerramientas(opts: {
  sistema: string;
  mensajes: MensajeChat[];
  herramientas: ToolDef[];
  handlers: Record<string, Handler>;
  tipo: "cliente" | "profesional";
  maxTurns?: number;
}): Promise<{ respuesta: string; fallback: boolean }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { respuesta: "[fallback: sin API key]", fallback: true };
  if (!(await incrementarUso(opts.tipo))) {
    return { respuesta: "[fallback: límite diario alcanzado]", fallback: true };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`;

  const contents: Record<string, unknown>[] = opts.mensajes.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const tools = [
    {
      functionDeclarations: opts.herramientas.map((h) => ({
        name: h.name,
        description: h.description,
        parameters: h.parameters,
      })),
    },
  ];

  const maxTurns = opts.maxTurns ?? 6;
  const ejecutadas = new Set<string>();
  let ultimoTexto = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    let res: Response;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.sistema }] },
          contents,
          tools,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
    } catch {
      return { respuesta: "[fallback: error de red]", fallback: true };
    }

    if (res.status === 429) {
      console.warn(JSON.stringify({ ts: new Date().toISOString(), nivel: "warn", area: "gemini", evento: "rate_limit", datos: { tipo: opts.tipo } }));
      return { respuesta: "[fallback: 429 cuota]", fallback: true };
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      return { respuesta: "[fallback: respuesta inválida]", fallback: true };
    }

    if (!res.ok) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), nivel: "error", area: "gemini", evento: "api_error", datos: { status: res.status, tipo: opts.tipo } }));
      return { respuesta: `[fallback: error ${res.status}]`, fallback: true };
    }

    const candidates = data.candidates as Array<{ content?: { parts?: Array<Record<string, unknown>> } }> | undefined;
    const parts = candidates?.[0]?.content?.parts ?? [];
    const texto = parts.filter((p) => typeof p.text === "string").map((p) => String(p.text)).join("");
    if (texto) ultimoTexto = texto;
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      return { respuesta: texto || "Listo.", fallback: false };
    }

    const functionResponses: Record<string, unknown>[] = [];
    for (const call of calls) {
      const fc = call.functionCall as { name?: string; args?: Record<string, unknown> };
      const name = String(fc.name ?? "");
      const args = (fc.args ?? {}) as Record<string, unknown>;
      const clave = `${name}|${JSON.stringify(args)}`;
      if (ejecutadas.has(clave)) {
        functionResponses.push({
          functionResponse: {
            name,
            response: { error: "Acción ya ejecutada. Resúmela al usuario, no la repitas." },
          },
        });
        continue;
      }
      ejecutadas.add(clave);
      const handler = opts.handlers[name];
      if (!handler) {
        functionResponses.push({ functionResponse: { name, response: { error: "Función no disponible" } } });
        continue;
      }
      let result: unknown;
      try {
        result = await handler(args);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      functionResponses.push({ functionResponse: { name, response: result } });
    }

    contents.push({
      role: "model",
      parts: parts.map((p) => (p.functionCall ? p : { text: String(p.text ?? "") })),
    });
    contents.push({ role: "user", parts: functionResponses });
  }

  if (ultimoTexto) return { respuesta: ultimoTexto, fallback: false };
  return { respuesta: "[fallback: sin texto tras agotar turnos]", fallback: true };
}