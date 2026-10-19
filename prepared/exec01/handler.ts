// NOT DEPLOYED. Transport-neutral server handler; only injected repositories are
// supported. No service key, no hosted database access, no sending implementation.
import { z } from "zod";
import type { RemblaiService } from "../../src/lib/remblai/service";
import { conditionsSchema } from "../../src/lib/remblai/conditions";
const credentials = { linkId: z.string().max(80), requestId: z.string().max(80), secret: z.string().min(32).max(128) };
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), ...credentials }).strict(),
  z.object({ kind: z.literal("code"), ...credentials }).strict(),
  z.object({ kind: z.literal("verify"), ...credentials, code: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ kind: z.literal("act"), ...credentials, action: z.enum(["modifier", "confirmer", "pause", "reprendre", "fermer"]), operationId: z.string().min(16).max(80), version: z.number().int().positive(), confirmed: z.literal(true), conditions: conditionsSchema.optional() }).strict(),
]);
export function makeHandler(service: RemblaiService, deliverCode: Parameters<RemblaiService["requestCode"]>[3]) {
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  return async (request: Request) => {
    // GET is always inert; scanners cannot issue codes or mutate a dossier.
    if (request.method === "GET") return response({ message: "Ouvrez le suivi personnel pour consulter votre demande." });
    if (request.method !== "POST") return response({ error: "Méthode non permise." }, 405);
    if (Number(request.headers.get("content-length") || "0") > 60000000) return response({ error: "Requête trop volumineuse." }, 413);
    const result = schema.safeParse(await request.json().catch(() => null));
    if (!result.success) return response({ error: "Requête invalide." }, 400);
    const value = result.data;
    try {
      if (value.kind === "read") return response(await service.read(value.linkId, value.secret, value.requestId));
      if (value.kind === "code") await service.requestCode(value.linkId, value.secret, value.requestId, deliverCode);
      if (value.kind === "verify") await service.verifyCode(value.linkId, value.secret, value.requestId, value.code);
      if (value.kind === "act") {
        const { linkId, secret, requestId, action, operationId, version, confirmed, conditions } = value;
        if (!linkId || !secret || !requestId || !action || !operationId || version == null || confirmed !== true) return response({ error: "Requête invalide." }, 400);
        return response(await service.act({ linkId, secret, requestId, action, operationId, version, confirmed, conditions }));
      }
      return response({ ok: true });
    } catch {
      // Never return database errors, credentials, hashes or dossier existence.
      return response({ error: "Accès ou action indisponible. Vérifiez votre lien et votre code." }, 403);
    }
  };
}