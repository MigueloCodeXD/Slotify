// Obtiene la IP del cliente en una Edge Function de Supabase.
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "";
}