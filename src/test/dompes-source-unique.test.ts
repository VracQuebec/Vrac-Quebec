// ============================================================
// VERROUILLAGE DE LA SOURCE UNIQUE « DOMPES ENTREPRENEUR ».
// Vérifie que carte, recherche, listes et recommandations
// consomment exactement le même jeu de dompes admissibles,
// en lecture temps réel, sans coordonnée ni adresse réelle.
// ============================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEligibleEntrepreneurDumpSites, mappableDumpSites } from "@/lib/entrepreneur/dompes";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

/** Champs réels qui ne doivent JAMAIS atteindre le navigateur entrepreneur. */
const CHAMPS_INTERDITS = [
  "address",
  "postal_code",
  "real_latitude",
  "real_longitude",
  "postal_latitude",
  "postal_longitude",
  "email",
  "phone",
  "name",
];

const dompe = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  submission_number: 1,
  dompe_number: "D-1",
  materials: ["Terre"],
  latitude: 46.81,
  longitude: -71.21,
  availability_status: "available",
  ...extra,
});

/** Recherche entrepreneur (même filtre que la page carte/liste). */
const rechercher = (sites: Array<Record<string, unknown>>, q: string) =>
  sites.filter((s) =>
    `${s.dompe_number ?? ""} ${(s.materials as string[] | null ?? []).join(" ")}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

beforeEach(() => rpc.mockReset());

describe("source unique des dompes entrepreneur", () => {
  it("TEST 1-3 — une dompe admissible alimente carte, recherche et recommandations", async () => {
    rpc.mockResolvedValueOnce({ data: [dompe("a"), dompe("b", { dompe_number: "D-2" })], error: null });
    const { sites } = await getEligibleEntrepreneurDumpSites();
    expect(sites.map((s) => s.id)).toEqual(["a", "b"]);
    expect(mappableDumpSites(sites)).toHaveLength(2); // carte
    expect(rechercher(sites, "D-2").map((s) => s.id)).toEqual(["b"]); // recherche
    expect(sites.filter((s) => s.materials?.includes("Terre"))).toHaveLength(2); // recommandations
  });

  it("TEST 4-5 — un changement de statut retire puis rend la dompe (relecture serveur)", async () => {
    rpc.mockResolvedValueOnce({ data: [dompe("a")], error: null });
    expect((await getEligibleEntrepreneurDumpSites()).sites.map((s) => s.id)).toEqual(["a"]);
    // statut changé côté serveur : la RPC ne la retourne plus
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect((await getEligibleEntrepreneurDumpSites()).sites).toHaveLength(0);
    // remise « en attente de livraison » : elle réapparaît sans action côté client
    rpc.mockResolvedValueOnce({ data: [dompe("a")], error: null });
    expect((await getEligibleEntrepreneurDumpSites()).sites.map((s) => s.id)).toEqual(["a"]);
  });

  it("TEST 6 — l'admissibilité est décidée par le serveur, jamais recalculée côté client", async () => {
    rpc.mockResolvedValueOnce({ data: [dompe("a", { availability_status: "unavailable" })], error: null });
    const { sites } = await getEligibleEntrepreneurDumpSites();
    // la disponibilité n'exclut jamais une dompe admissible
    expect(sites).toHaveLength(1);
  });

  it("TEST 9-10 — aucune adresse ni coordonnée réelle dans la réponse consommée", async () => {
    rpc.mockResolvedValueOnce({ data: [dompe("a")], error: null });
    const { sites } = await getEligibleEntrepreneurDumpSites();
    for (const champ of CHAMPS_INTERDITS) expect(Object.keys(sites[0])).not.toContain(champ);
  });

  it("TEST 17 — carte, recherche et recommandations partagent le MÊME appel serveur", async () => {
    rpc.mockResolvedValueOnce({ data: [dompe("a"), dompe("b")], error: null });
    const { sites, fetchedAt } = await getEligibleEntrepreneurDumpSites();
    const carte = mappableDumpSites(sites).map((s) => s.id);
    const recherche = rechercher(sites, "terre").map((s) => s.id);
    const reco = sites.map((s) => s.id);
    expect(carte).toEqual(reco);
    expect(recherche).toEqual(reco);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fetchedAt).toBeGreaterThan(0); // lecture horodatée, aucun cache
  });

  it("repli public : mêmes dompes, jamais de données réelles", async () => {
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [dompe("a")], error: null });
    const { sites, error } = await getEligibleEntrepreneurDumpSites();
    expect(error).toBeNull();
    expect(sites.map((s) => s.id)).toEqual(["a"]);
  });

  it("remonte l'erreur serveur plutôt qu'une liste mémorisée", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { sites, error } = await getEligibleEntrepreneurDumpSites();
    expect(sites).toEqual([]);
    expect(error).toBe("boom");
  });
});

import { crmDompeNumber } from "@/lib/entrepreneur/dompes";
describe("numéro CRM exact", () => {
  it("reprend le numéro CRM tel quel", () => {
    expect(crmDompeNumber({ dompe_number: "Dompe 24" })).toBe("24");
    expect(crmDompeNumber({ dompe_number: "Dompe 167" })).toBe("167");
    expect(crmDompeNumber({ dompe_number: "#5" })).toBe("5");
  });
  it("aucun repli : numéro absent ou invalide → exclu", () => {
    expect(crmDompeNumber({ dompe_number: "" })).toBeNull();
    expect(crmDompeNumber({ dompe_number: null })).toBeNull();
    expect(crmDompeNumber({ dompe_number: "abc", submission_number: 4 } as never)).toBeNull();
  });
});
