import { describe, it, expect } from "vitest";
import { buildRecommendedSites, loadRecommendedSites } from "@/lib/parcours/sites-recommandes";
import { mapMySubmission } from "@/lib/parcours/mes-demandes";

const row = (o: Record<string, unknown>) => mapMySubmission({ id: o.id ?? "s1", ...o })!;
const client = (data: unknown, error: { message: string } | null = null) => ({
  rpc: async () => ({ data, error }),
});

describe("Sites recommandés — vue calculée", () => {
  it("A — aucune sélection : aucun site recommandé", () => {
    expect(buildRecommendedSites([row({ city: "Québec" })])).toHaveLength(0);
  });

  it("B — un site sélectionné : affiché avec son contexte", () => {
    const [s] = buildRecommendedSites([
      row({ selected_site_id: "site-1", selected_site_label: "Dépôt A", city: "Sainte-Foy", quote_material: "Terre" }),
    ]);
    expect(s.siteId).toBe("site-1");
    expect(s.label).toBe("Dépôt A");
    expect(s.chantier).toBe("Sainte-Foy");
    expect(s.material).toBe("Terre");
    expect(s.reason).toBe("selected_site");
  });

  it("C — plusieurs sites : entrées séparées", () => {
    const out = buildRecommendedSites([
      row({ id: "a", selected_site_id: "site-1" }),
      row({ id: "b", selected_site_id: "site-2" }),
    ]);
    expect(out.map((s) => s.siteId)).toEqual(["site-1", "site-2"]);
  });

  it("D — site validé par l'admin : motif distinct", () => {
    const [s] = buildRecommendedSites([
      row({ selected_site_id: "site-1", site_validated_at: "2026-01-05T10:00:00Z" }),
    ]);
    expect(s.reason).toBe("validated_site");
  });

  it("E — disponibilité inconnue : jamais inventée", () => {
    const [s] = buildRecommendedSites([row({ selected_site_id: "site-1" })]);
    expect(s.availability.level).toBe("unknown");
    expect(s.availability.label).toBe("À confirmer");
  });

  it("E bis — disponibilité réelle et fraîche : affichée telle quelle", () => {
    const [s] = buildRecommendedSites([
      row({
        selected_site_id: "site-1",
        site_availability_status: "available",
        site_availability_updated_at: new Date().toISOString(),
      }),
    ]);
    expect(s.availability.level).toBe("available");
  });

  it("F — distance/durée absentes : null, jamais estimées", () => {
    const [s] = buildRecommendedSites([row({ selected_site_id: "site-1" })]);
    expect(s.distanceKm).toBeNull();
    expect(s.durationMinutes).toBeNull();
  });

  it("F bis — distance réellement enregistrée : reprise sans modification", () => {
    const [s] = buildRecommendedSites([
      row({ selected_site_id: "site-1", quote_distance_km: 9.8, quote_duration_minutes: 14 }),
    ]);
    expect(s.distanceKm).toBe(9.8);
    expect(s.durationMinutes).toBe(14);
  });

  it("G/H — matériau connu affiché, inconnu jamais supposé", () => {
    const [known] = buildRecommendedSites([row({ selected_site_id: "x", materials: ["Pierre"] })]);
    expect(known.material).toBe("Pierre");
    const [unknown] = buildRecommendedSites([row({ selected_site_id: "x" })]);
    expect(unknown.material).toBeNull();
  });

  it("I/J — le rattachement transport reste porté par la demande d'origine", () => {
    const [s] = buildRecommendedSites([row({ id: "sub-9", selected_site_id: "site-1" })]);
    expect(s.submissionId).toBe("sub-9");
  });

  it("K/L — la RPC est la seule source : aucune donnée si non autorisé", async () => {
    const res = await loadRecommendedSites(client(null, { message: "not_authorized" }) as never);
    expect(res.state).toBe("unauthorized");
  });

  it("M — deux lectures successives : résultat identique, aucune écriture", async () => {
    const data = [{ id: "s1", selected_site_id: "site-1" }];
    const a = await loadRecommendedSites(client(data) as never);
    const b = await loadRecommendedSites(client(data) as never);
    expect(a).toEqual(b);
  });

  it("N/O — aucune donnée réelle : liste vide, aucun site inventé", async () => {
    const res = await loadRecommendedSites(client([{ id: "s1", city: "Lévis" }]) as never);
    expect(res).toEqual({ state: "ok", sites: [] });
  });

  it("erreur serveur : état d'erreur explicite", async () => {
    const res = await loadRecommendedSites(client(null, { message: "boom" }) as never);
    expect(res.state).toBe("error");
  });
});
