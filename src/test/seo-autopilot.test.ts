import { describe, it, expect } from "vitest";
import { planCityTasks, isCircuitBreak, finalOutcome } from "../../supabase/functions/_shared/seo-autopilot";
import { previewLines } from "@/lib/seo/autopilot";

const slot = (m: string | null, a: string) => ({ kind: m ? "material" : "hub", material_slug: m, service_slug: null, availability: a });
const page = (m: string | null, status: string) => ({ id: `p-${m}`, slug: `${m}-x`, status, material_slug: m, service_slug: null });

describe("START — planification d'une ville", () => {
  const plan = planCityTasks(
    [slot(null, "confirmee"), slot("sable", "confirmee"), slot("gravier", "confirmee"), slot("remblai", "inconnue"), slot("neige", "exclue"), slot("sable", "confirmee"), slot("terre", "inconnue")],
    [page(null, "published"), page("gravier", "draft"), page("terre", "draft")],
  );
  const of = (m: string | null) => plan.filter((t) => t.material_slug === m);
  it("page en ligne : aucune tâche", () => expect(of(null)).toHaveLength(0));
  it("manquante confirmée : générée", () => expect(of("sable")[0]).toMatchObject({ kind: "auto_generate", status: "queued" }));
  it("aucun doublon pour une combinaison répétée", () => expect(of("sable")).toHaveLength(1));
  it("brouillon confirmé : finalisé (qualité, correction, publication)", () => expect(of("gravier")[0]).toMatchObject({ kind: "auto_finish", page_id: "p-gravier" }));
  it("inconnue : liste d'attente, jamais en file", () => expect(of("remblai")[0]).toMatchObject({ status: "skipped", outcome: "waiting_evidence" }));
  it("brouillon à disponibilité inconnue : conservé, en attente", () => expect(of("terre")[0]).toMatchObject({ status: "skipped", outcome: "waiting_evidence", page_id: "p-terre" }));
  it("exclue : jamais générée", () => expect(of("neige")[0]).toMatchObject({ status: "skipped", outcome: "excluded" }));
});

describe("START — arrêt sur crédits et résultats", () => {
  it("402 met en pause", () => expect(isCircuitBreak(402, "x")).toBe(true));
  it("403 d'accès IA met en pause", () => expect(isCircuitBreak(403, "credit_limit_reached")).toBe(true));
  it("403 de disponibilité : refus de la page seulement", () => expect(isCircuitBreak(403, "Disponibilité inconnue")).toBe(false));
  it("429 : nouvelle tentative, pas d'arrêt", () => expect(isCircuitBreak(429, "rate")).toBe(false));
  it("résultat publié après génération", () => expect(finalOutcome({ generated: true, fixed: false, published: true })).toBe("generated_published"));
  it("non publiable : brouillon conservé", () => expect(finalOutcome({ generated: false, fixed: false, published: false })).toBe("kept_draft"));
  it("résumé : coût estimé et publications prévues", () => {
    const l = previewLines({ cities: 162, combinations: 4536, published: 1383, to_generate: 10, drafts_to_finish: 10, drafts_waiting: 2, waiting_evidence: 3, excluded: 4, global_locked: true });
    expect(l.join(" ")).toMatch(/au plus 20/);
    expect(l.join(" ")).toMatch(/1 crédit/);
  });
});

import { scopeLines as _scopeLines } from "@/lib/seo/autopilot";
describe("Résumé START — périmètres", () => {
  const base = { cities: 162, combinations: 4536, published: 1383, to_generate: 0, drafts_to_finish: 0, drafts_waiting: 0, waiting_evidence: 0, excluded: 0, global_locked: true };
  it("sépare municipalités, arrondissements/secteurs et total", () => {
    const l = _scopeLines({ ...base, scopes: { muni_places: 162, muni_published: 1383, muni_drafts: 62, other_places: 26, other_published: 728, other_drafts: 0, all_published: 2111, all_drafts: 62 } });
    expect(l[0]).toContain("1383 pages publiées");
    expect(l[1]).toContain("728 pages publiées");
    expect(l[2]).toContain("188 lieux");
    expect(l[2]).toContain("2111 pages publiées");
  });
  it("signale une répartition absente au lieu d'inventer", () => {
    expect(_scopeLines(base)[0]).toContain("indisponible");
  });
});
