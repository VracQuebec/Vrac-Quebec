import { describe, expect, it } from "vitest";
import { inboxState, isPending, sortByUrgency } from "@/lib/access-requests/inbox";

const none = { seen_at: null, taken_at: null, follow_status: "nouvelle" };

describe("boîte des nouvelles demandes de dompes", () => {
  it("une demande jamais ouverte est Nouvelle", () => {
    expect(inboxState("nouvelle", null)).toBe("nouvelle");
  });
  it("ouvrir la demande la rend Consultée, pas Traitée", () => {
    const s = inboxState("nouvelle", { ...none, seen_at: "2026-10-14T10:00:00Z" });
    expect(s).toBe("consultee");
    expect(isPending(s)).toBe(true);
  });
  it("un statut de coordination ou une prise en charge = En traitement", () => {
    expect(inboxState("informations_requises", none)).toBe("en_traitement");
    expect(inboxState("nouvelle", { ...none, follow_status: "prise_en_charge" })).toBe("en_traitement");
  });
  it("seule une décision réelle rend la demande Traitée et la retire", () => {
    expect(inboxState("acceptee", none)).toBe("traitee");
    expect(inboxState("refusee", none)).toBe("traitee");
    expect(isPending("traitee")).toBe(false);
  });
  it("À traiter : seules acceptée, refusée, terminée, annulée sont exclues", () => {
    for (const s of ["nouvelle", "en_analyse", "informations_requises", "en_attente_proprietaire", null])
      expect(isPending(inboxState(s, none))).toBe(true);
    for (const s of ["acceptee", "refusee", "terminee", "annulee"])
      expect(isPending(inboxState(s, none))).toBe(false);
  });
  it("tri : jamais ouvertes d'abord, puis la plus ancienne", () => {
    const out = sortByUrgency([
      { id: "trait-vieille", state: "en_traitement" as const, created_at: "2026-01-01" },
      { id: "nouv-recente", state: "nouvelle" as const, created_at: "2026-10-10" },
      { id: "nouv-vieille", state: "nouvelle" as const, created_at: "2026-10-01" },
      { id: "vue", state: "consultee" as const, created_at: "2026-09-01" },
    ]).map((r) => r.id);
    expect(out).toEqual(["nouv-vieille", "nouv-recente", "vue", "trait-vieille"]);
  });
});
