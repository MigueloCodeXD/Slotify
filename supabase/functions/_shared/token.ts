// Firma/verifica tokens de sesión de cliente con HMAC-SHA256 (WebCrypto).
const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const secret = enc.encode(Deno.env.get("AUTH_SECRET") ?? "slotify-dev-secret");
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function crearSesionCliente(email: string): Promise<string> {
  const payload = { email, exp: Date.now() + 3 * 3600 * 1000 };
  const body = btoa(JSON.stringify(payload));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function verificarSesionCliente(token: string): Promise<{ email: string } | null> {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = await hmac(body);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(atob(body));
    if (payload.exp < Date.now()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}