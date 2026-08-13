// Rattachement INVERSE : depuis une demande (submission), retrouver la
// demande de transport réellement existante. Lecture seule uniquement.
import { describe, it, expect } from "vitest";
import {
  loadLinkedTransportRequest,
  mapLinkedTransport,
  type RpcClient,
} from "@/lib/parcours/validation";

const SUB = "11111111-1111-1111-1111-111111111111";

const ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  request_number: "DT-0025",
  status: "en_analyse",
  created_at: "2026-08-13T14:00:00.000Z",
  origin_submission_id: SUB,
  origin_stage: "transport_request",
  dump_name: "Dompe 118",
  site_address: "45 rue du Chantier, Lévis",
  selected_site_address: "1200 route du Site, Saint-Nicolas",
};

const client = (impl: (fn: string, args: Record<string, unknown>) => unknown): RpcClient & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push(fn);
      const out = impl(fn, args) as { data?: unknown; error?: { message: string } | null };
      return { data: out?.data ?? null, error: out?.error ?? null };
    },
  };
};

describe("rattachement inverse submission → demande de transport", () => {
  it("A — retrouve la demande associée", async () => {
    const c = client(() => ({ data: ROW }));
    const res = await loadLinkedTransportRequest(SUB, c);
    expect(res.state).toBe("found");
    if (res.state !== "found") return;
    expect(res.request.requestNumber).toBe("DT-0025");
    expect(res.request.submissionId).toBe(SUB);
  });

  it("B — aucune demande de transport : état « none » propre", async () => {
    const c = client(() => ({ data: null }));
    expect((await loadLinkedTransportRequest(SUB, c)).state).toBe("none");
  });

  it("C — submission inexistante / absente : aucune demande affichée, aucun appel", async () => {
    const c = client(() => ({ data: ROW }));
    expect((await loadLinkedTransportRequest(null, c)).state).toBe("none");
    expect(c.calls).toHaveLength(0);

    const c2 = client(() => ({ error: { message: "submission_id_required" } }));
    expect((await loadLinkedTransportRequest(SUB, c2)).state).toBe("error");
  });

  it("D — refresh : la même demande est retrouvée (la base fait foi)", async () => {
    const c = client(() => ({ data: ROW }));
    const a = await loadLinkedTransportRequest(SUB, c);
    const b = await loadLinkedTransportRequest(SUB, c);
    expect(a).toEqual(b);
    expect(c.calls).toEqual(["get_submission_transport_request", "get_submission_transport_request"]);
  });

  it("E/F — consultations et clics répétés : lecture seule, aucune écriture", async () => {
    const c = client((fn) => {
      if (fn !== "get_submission_transport_request") throw new Error(`écriture interdite : ${fn}`);
      return { data: ROW };
    });
    for (let i = 0; i < 5; i++) await loadLinkedTransportRequest(SUB, c);
    expect(new Set(c.calls)).toEqual(new Set(["get_submission_transport_request"]));
    expect(c.calls).toHaveLength(5);
  });

  it("G — statut réel, jamais inventé", async () => {
    const c = client(() => ({ data: { ...ROW, status: null } }));
    const res = await loadLinkedTransportRequest(SUB, c);
    expect(res.state === "found" && res.request.status).toBeNull();

    const c2 = client(() => ({ data: { ...ROW, status: "acceptee" } }));
    const res2 = await loadLinkedTransportRequest(SUB, c2);
    expect(res2.state === "found" && res2.request.status).toBe("acceptee");
  });

  it("H — site réel affiché (adresse du site sélectionné prioritaire)", () => {
    const mapped = mapLinkedTransport(ROW);
    expect(mapped?.dumpName).toBe("Dompe 118");
    expect(mapped?.siteAddress).toBe("1200 route du Site, Saint-Nicolas");
    const fallback = mapLinkedTransport({ ...ROW, selected_site_address: null });
    expect(fallback?.siteAddress).toBe("45 rue du Chantier, Lévis");
  });

  it("I — erreur DB : aucune fausse confirmation", async () => {
    const c = client(() => ({ error: { message: "connection reset" } }));
    const res = await loadLinkedTransportRequest(SUB, c);
    expect(res.state).toBe("error");
    expect(res.state === "error" && res.message).toContain("connection reset");
  });

  it("J — permission insuffisante : état sécurisé, aucune donnée exposée", async () => {
    const c = client(() => ({ error: { message: "not_authorized" } }));
    const res = await loadLinkedTransportRequest(SUB, c);
    expect(res.state).toBe("unauthorized");
    expect(res).not.toHaveProperty("request");
  });

  it("réponse inattendue (objet sans id) : traitée comme aucune demande", async () => {
    const c = client(() => ({ data: { request_number: "DT-9999" } }));
    expect((await loadLinkedTransportRequest(SUB, c)).state).toBe("none");
  });
});
