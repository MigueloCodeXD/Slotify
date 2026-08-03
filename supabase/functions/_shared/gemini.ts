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
const LIMITE_DIARIO = Number(Deno.env.get("GEMINI_LIMITE_DIARIO") ?? 500);

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

export async function incrementarUso(tipo: "cliente" | "profesional"): Promise<boolean> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("ia_uso")
    .select("contador")
    .eq("fecha", hoy)
    .eq("tipo", tipo)
    .maybeSingle();
  const actual = (data?.contador as number | undefined) ?? 0;
  if (actual >= LIMITE_DIARIO) return false;
  if (data) {
    await admin.from("ia_uso").update({ contador: actual + 1 }).eq("fecha", hoy).eq("tipo", tipo);
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
  if (!(await incrementarUso(opts.tipo))) {
    return { respuesta: "__FALLBACK_BOTONES__", fallback: true };
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { respuesta: "__FALLBACK_BOTONES__", fallback: true };

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

  for (let turn = 0; turn < maxTurns; turn++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.sistema }] },
          contents,
          tools,
        }),
      });
    } catch {
      return { respuesta: "__FALLBACK_BOTONES__", fallback: true };
    }

    if (res.status === 429) {
      return { respuesta: "__FALLBACK_BOTONES__", fallback: true };
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      return { respuesta: "Lo siento, no pude procesar eso. Usa los botones para agendar.", fallback: true };
    }

    if (!res.ok) {
      console.error("Gemini error:", res.status, JSON.stringify(data).slice(0, 300));
      return { respuesta: "Lo siento, hubo un error. Usa los botones para continuar.", fallback: true };
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const texto = parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
    const calls = parts.filter((p: any) => p.functionCall);

    if (calls.length === 0) {
      return { respuesta: texto || "Listo.", fallback: false };
    }

    const functionResponses: Record<string, unknown>[] = [];
    for (const call of calls) {
      const name = call.functionCall.name as string;
      const args = (call.functionCall.args ?? {}) as Record<string, unknown>;
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
      parts: parts.map((p: any) => (p.functionCall ? p : { text: p.text ?? "" })),
    });
    contents.push({ role: "user", parts: functionResponses });
  }

  return { respuesta: "Necesito un poco más de información. Si algo falla, usa los botones.", fallback: true };
}