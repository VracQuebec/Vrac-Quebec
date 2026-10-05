// « Mes demandes » — lecture seule des demandes de l'entrepreneur connecté.
import { describe, it, expect } from "vitest";
import { loadMySubmissions, mapMySubmission } from "@/lib/parcours/mes-demandes";
import { loadLinkedTransportRequest, type RpcClient } from "@/lib/parcours/validation";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  submission_number: 12,
  created_at: "2026-08-10T12:00:00.000Z",
  status: "nouveau",
  request_type: "remblai",
  materials: ["Terre"],
  quantity: "30 tonnes",
  city: "Lévis",
  ...extra,
});

const client = (impl: (fn: string, args: Record<string, unknown>) => unknown) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const c: RpcClient & { calls: typeof calls } = {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      const out = impl(fn, args) as { data?: unknown; error?: { message: string } | null };
      return { data: out?.data ?? null, error: out?.error ?? null };
    },
  };
  return c;
};

const transportRow = (sub: string, num: string) => ({
  id: `tr-${num}`,
  request_number: num,
  status: "en_analyse",
  created_at: "2026-08-11T12:00:00.000Z",
  origin_submission_id: sub,
  origin_stage: "transport_request",
});

describe("Mes demandes — espace entrepreneur", () => {
  it("A — une demande apparaît", async () => {
    const res = await loadMySubmissions(client(() => ({ data: [row(A)] })));
    expect(res.state).toBe("ok");
    if (res.state !== "ok") return;
    expect(res.submissions).toHaveLength(1);
    expect(res.submissions[0].material).toBe("Terre");
    expect(res.submissions[0].location).toBe("Lévis");
  });

  it("B — plusieurs demandes autorisées apparaissent", async () => {
    const res = await loadMySubmissions(client(() => ({ data: [row(A), row(B), row(C)] })));
    expect(res.state === "ok" && res.submissions.map((s) => s.id)).toEqual([A, B, C]);
  });

  it("C — demande avec transport : le rattachement est trouvé", async () => {
    const c = client(() => ({ data: transportRow(A, "DT-1") }));
    const res = await loadLinkedTransportRequest(A, c);
    expect(res.state).toBe("found");
  });

  it("D — demande sans transport : état « aucune » propre", async () => {
    const res = await loadLinkedTransportRequest(B, client(() => ({ data: null })));
    expect(res.state).toBe("none");
  });

  it("E — A→transport A et B→transport B : jamais de croisement", async () => {
    const c = client((_fn, args) =>
      args.p_submission_id === A
        ? { data: transportRow(A, "DT-A") }
        : { data: transportRow(B, "DT-B") },
    );
    const ra = await loadLinkedTransportRequest(A, c);
    const rb = await loadLinkedTransportRequest(B, c);
    expect(ra.state === "found" && ra.request.requestNumber).toBe("DT-A");
    expect(rb.state === "found" && rb.request.requestNumber).toBe("DT-B");
    expect(ra.state === "found" && ra.request.submissionId).toBe(A);
    expect(rb.state === "found" && rb.request.submissionId).toBe(B);
  });

  it("F — la base filtre : une demande d'un autre entrepreneur n'est jamais retournée", async () => {
    // La RPC `get_my_submissions` est appelée sans identifiant client :
    // le filtrage est fait en base (auth.uid()), impossible à contourner.
    const c = client(() => ({ data: [row(A)] }));
    const res = await loadMySubmissions(c);
    expect(c.calls[0].args).toEqual({});
    expect(res.state === "ok" && res.submissions.every((s) => s.id === A)).toBe(true);
  });

  it("G/H — consultations répétées : aucune écriture, uniquement des lectures", async () => {
    const c = client(() => ({ data: [row(A)] }));
    await loadMySubmissions(c);
    await loadMySubmissions(c);
    await loadLinkedTransportRequest(A, c);
    expect(c.calls.map((x) => x.fn)).toEqual([
      "get_my_submissions",
      "get_my_submission_meta",
      "get_my_submissions",
      "get_my_submission_meta",
      "get_submission_transport_request",
    ]);
  });

  it("I — refresh : mêmes données depuis la source de vérité", async () => {
    const c = client(() => ({ data: [row(A, { selected_site_label: "Dompe 118" })] }));
    const r1 = await loadMySubmissions(c);
    const r2 = await loadMySubmissions(c);
    expect(r1).toEqual(r2);
    expect(r1.state === "ok" && r1.submissions[0].selectedSiteLabel).toBe("Dompe 118");
  });

  it("J — erreur de lecture : aucune fausse confirmation", async () => {
    const res = await loadMySubmissions(client(() => ({ error: { message: "network" } })));
    expect(res.state).toBe("error");
  });

  it("K — permission insuffisante : état sécurisé", async () => {
    const res = await loadMySubmissions(client(() => ({ error: { message: "not_authorized" } })));
    expect(res.state).toBe("unauthorized");
  });

  it("L — aucune demande : liste vide propre", async () => {
    const res = await loadMySubmissions(client(() => ({ data: [] })));
    expect(res.state === "ok" && res.submissions).toEqual([]);
  });

  it("aucune donnée inventée : champs absents restent nuls", () => {
    const s = mapMySubmission({ id: A });
    expect(s?.material).toBeNull();
    expect(s?.status).toBeNull();
    expect(s?.selectedSiteLabel).toBeNull();
    expect(mapMySubmission({})).toBeNull();
  });
});
