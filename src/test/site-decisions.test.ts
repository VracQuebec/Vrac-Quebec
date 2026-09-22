// Approbation dompe par dompe : le client ne déduit jamais une adresse.
// Seul le serveur décide ce qu'il transmet ; ces tests vérifient le
// mappage et le fait qu'aucune adresse n'apparaît hors approbation.
import { describe, expect, it } from "vitest";
import {
  decideSubmissionSite,
  decisionLabel,
  loadSubmissionSites,
  mapSubmissionSite,
} from "@/lib/parcours/site-decisions";

const row = (over: Record<string, unknown> = {}) => ({
  submission_id: "sub-1",
  site_id: "site-1",
  site_label: "Dompe 1",
  status: "en_attente",
  decided_at: null,
  decision_note: null,
  created_at: "2026-09-01T00:00:00Z",
  site_status: "en attente de livraison",
  site_material: "terre",
  public_latitude: 46.8,
  public_longitude: -71.2,
  site_address: null,
  site_latitude: null,
  site_longitude: null,
  ...over,
});

const client = (data: unknown, error: { message: string } | null = null) => ({
  rpc: async () => ({ data, error }),
});

describe("mapSubmissionSite", () => {
  it("n'expose aucune adresse tant que la dompe n'est pas approuvée", () => {
    const s = mapSubmissionSite(row());
    expect(s?.status).toBe("en_attente");
    expect(s?.siteAddress).toBeNull();
    expect(s?.siteLatitude).toBeNull();
    expect(s?.publicLatitude).toBe(46.8);
  });

  it("expose l'adresse transmise pour une dompe approuvée", () => {
    const s = mapSubmissionSite(
      row({ status: "approuvee", site_address: "1 rue Réelle", site_latitude: 46.81 }),
    );
    expect(s?.status).toBe("approuvee");
    expect(s?.siteAddress).toBe("1 rue Réelle");
  });

  it("une dompe refusée ne porte jamais d'adresse", () => {
    const s = mapSubmissionSite(row({ status: "refusee" }));
    expect(s?.siteAddress).toBeNull();
  });

  it("retombe sur « en attente » pour un état inconnu", () => {
    expect(mapSubmissionSite(row({ status: "n'importe quoi" }))?.status).toBe("en_attente");
  });
});

describe("decisionLabel", () => {
  it("nomme les trois états", () => {
    expect(decisionLabel("approuvee")).toBe("Approuvée");
    expect(decisionLabel("refusee")).toBe("Refusée");
    expect(decisionLabel("en_attente")).toBe("En attente");
  });
});

describe("loadSubmissionSites", () => {
  it("retourne les dompes de la demande", async () => {
    const res = await loadSubmissionSites("sub-1", client([row(), row({ site_id: "site-2" })]));
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.sites).toHaveLength(2);
  });

  it("distingue l'accès refusé d'une erreur de lecture", async () => {
    expect((await loadSubmissionSites("sub-1", client(null, { message: "not_authorized" }))).state)
      .toBe("unauthorized");
    expect((await loadSubmissionSites("sub-1", client(null, { message: "boom" }))).state)
      .toBe("error");
  });

  it("ne lit rien sans demande", async () => {
    const res = await loadSubmissionSites(null, client([row()]));
    expect(res.state === "ok" && res.sites).toEqual([]);
  });
});

describe("decideSubmissionSite", () => {
  it("remonte la décision réellement enregistrée", async () => {
    const res = await decideSubmissionSite(
      "sub-1",
      "site-1",
      "approuvee",
      null,
      client({ site_id: "site-1", status: "approuvee", changed: true }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.site).toEqual({ siteId: "site-1", status: "approuvee", changed: true });
  });

  it("signale l'action réservée à l'administration", async () => {
    const res = await decideSubmissionSite(
      "sub-1",
      "site-1",
      "refusee",
      null,
      client(null, { message: "not_authorized" }),
    );
    expect(res.ok).toBe(false);
    if (res.ok !== true) expect(res.message).toContain("administration");
  });
});
