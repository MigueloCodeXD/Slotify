import { getRequestId, logError } from "./logging.ts";
import { json } from "./db.ts";

export function withRequestLog(area: string, handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const requestId = getRequestId(req);
    try {
      const res = await handler(req);
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      logError(area, "unhandled_error", { requestId, error: (err as Error).message });
      return json({ error: "Error interno" }, 500, req);
    }
  };
}
