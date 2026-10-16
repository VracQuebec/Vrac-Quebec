// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from "@/integrations/supabase/client";
import { submitTransportRequest, hasPendingSubmissions, newIdempotencyKey } from "./submitQueue";

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const payload = () => ({
  idempotency_key: newIdempotencyKey(),
  client_name: "Client Essai",
  client_phone: "819-000-0000",
  site_address: "1 rue de l'Essai",
  material_type: "sable",
});

function serverDrop(message: string) {
  return {
    data: null,
    error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: { json: async () => ({ retry: false, message }), clone: () => ({ json: async () => ({ retry: false, message }) }) },
    }),
  };
}

describe("file d'envoi des demandes de dompe", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  it("succès serveur : confirmé et retiré de la file", async () => {
    invoke.mockResolvedValue({ data: { ok: true, request_number: "DT-0099" }, error: null });
    const r = await submitTransportRequest(payload());
    expect(r).toMatchObject({ status: "confirmed", request_number: "DT-0099" });
    expect(hasPendingSubmissions()).toBe(false);
  });

  it("refus DÉFINITIF du serveur : jamais « en attente », état rejeté avec le motif", async () => {
    invoke.mockResolvedValue(serverDrop("tarif de camion introuvable"));
    const r = await submitTransportRequest(payload());
    expect(r.status).toBe("rejected");
    expect(r.message).toBe("tarif de camion introuvable");
    expect(hasPendingSubmissions()).toBe(false);
  });

  it("échec transitoire : mis en file pour relance, pas de fausse confirmation", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("non-2xx"), {
        context: { clone: () => ({ json: async () => ({ retry: true, message: "temporary_failure" }) }) },
      }),
    });
    const r = await submitTransportRequest(payload());
    expect(r.status).toBe("queued");
    expect(hasPendingSubmissions()).toBe(true);
  });
});
