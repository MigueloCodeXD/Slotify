const DEFAULT_ALLOWED = ["http://localhost:3000", "http://127.0.0.1:3000"];

function allowedOrigins(): string[] {
  const raw = Deno.env.get("APP_ALLOWED_ORIGINS") ?? Deno.env.get("APP_BASE_URL") ?? "";
  const envOrigins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED, ...envOrigins])];
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = allowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  return null;
}